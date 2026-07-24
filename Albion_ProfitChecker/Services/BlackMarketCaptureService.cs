using System.Net;
using PacketDotNet;
using SharpPcap;
using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public sealed class BlackMarketCaptureService : IDisposable
{
    private readonly BlackMarketOrderBook _orderBook;
    private readonly string? _deviceSelector;
    private readonly string? _manualRegion;
    private readonly Action<string>? _log;
    private readonly object _gate = new();
    private readonly AlbionMarketPhotonParser _parser;
    private ICaptureDevice? _device;
    private string? _detectedRegion;
    private string? _activeRegion;
    private string? _lastError;
    private DateTime? _lastPacketAtUtc;
    private DateTime? _lastOrderAtUtc;
    private long _capturedPacketCount;
    private bool _blocked;
    private bool _disposed;

    public BlackMarketCaptureService(
        BlackMarketOrderBook orderBook,
        string? deviceSelector = null,
        string? manualRegion = null,
        bool enabled = true,
        Action<string>? log = null)
    {
        _orderBook = orderBook;
        _deviceSelector = string.IsNullOrWhiteSpace(deviceSelector) ? null : deviceSelector.Trim();
        _manualRegion = BlackMarketCaptureConstants.NormalizeRegion(manualRegion);
        _activeRegion = _manualRegion;
        Enabled = enabled;
        _log = log;
        _parser = new AlbionMarketPhotonParser(() => _activeRegion, OnOrder, SetParseError);
    }

    public bool Enabled { get; }

    public BlackMarketCaptureStatus Status
    {
        get
        {
            lock (_gate)
            {
                return new BlackMarketCaptureStatus(
                    Enabled,
                    _device is not null && !_blocked,
                    _device?.Name,
                    _detectedRegion,
                    _manualRegion,
                    _activeRegion,
                    _lastPacketAtUtc,
                    _lastOrderAtUtc,
                    Interlocked.Read(ref _capturedPacketCount),
                    _parser.ParsedOrderCount,
                    _parser.ParseErrorCount,
                    _lastError);
            }
        }
    }

    public IReadOnlyList<(string Name, string Description)> ListDevices()
    {
        try
        {
            return CaptureDeviceList.Instance
                .Select(device => (device.Name, device.Description ?? string.Empty))
                .ToList();
        }
        catch (Exception ex)
        {
            SetError($"Npcap devices unavailable: {ex.Message}");
            return Array.Empty<(string Name, string Description)>();
        }
    }

    public bool Start()
    {
        if (!Enabled)
        {
            SetError("Local packet capture is disabled.");
            return false;
        }

        try
        {
            var devices = CaptureDeviceList.Instance;
            if (devices.Count == 0)
            {
                SetError("No capture device found. Install Npcap and enable WinPcap compatibility mode.");
                return false;
            }

            _device = SelectDevice(devices);
            _device.OnPacketArrival += OnPacketArrival;
            _device.Open(DeviceModes.Promiscuous, 1000);
            _device.StartCapture();
            Log($"Passive capture started on {_device.Name}.");
            return true;
        }
        catch (Exception ex)
        {
            SetError($"Could not start passive capture: {ex.Message}");
            Stop();
            return false;
        }
    }

    public void Stop()
    {
        lock (_gate)
        {
            if (_device is null) return;
            try { _device.StopCapture(); } catch { }
            try { _device.OnPacketArrival -= OnPacketArrival; } catch { }
            try { _device.Close(); } catch { }
            _device = null;
        }
    }

    public void Dispose()
    {
        if (_disposed) return;
        _disposed = true;
        Stop();
    }

    private ICaptureDevice SelectDevice(CaptureDeviceList devices)
    {
        if (_deviceSelector is not null)
        {
            if (int.TryParse(_deviceSelector, out var index) && index >= 0 && index < devices.Count)
                return devices[index];

            var byName = devices.FirstOrDefault(device =>
                string.Equals(device.Name, _deviceSelector, StringComparison.OrdinalIgnoreCase) ||
                string.Equals(device.Description, _deviceSelector, StringComparison.OrdinalIgnoreCase));
            if (byName is not null) return byName;
            throw new InvalidOperationException($"Capture device '{_deviceSelector}' was not found.");
        }

        // The common one-adapter case can start without extra configuration. If several adapters
        // exist, prefer a non-loopback adapter and keep the selector available for deterministic use.
        return devices.FirstOrDefault(device =>
                   !device.Description.Contains("Loopback", StringComparison.OrdinalIgnoreCase) &&
                   !device.Name.Contains("Loopback", StringComparison.OrdinalIgnoreCase))
               ?? devices[0];
    }

    private void OnPacketArrival(object sender, PacketCapture e)
    {
        try
        {
            Interlocked.Increment(ref _capturedPacketCount);
            lock (_gate) _lastPacketAtUtc = DateTime.UtcNow;

            var rawPacket = e.GetPacket();
            var packet = Packet.ParsePacket(rawPacket.LinkLayerType, rawPacket.Data);
            var udp = packet.Extract<UdpPacket>();
            if (udp is null || !IsAlbionUdpPort(udp.SourcePort) && !IsAlbionUdpPort(udp.DestinationPort)) return;

            var ipv4Packet = packet.Extract<IPv4Packet>();
            var ipv6Packet = packet.Extract<IPv6Packet>();
            var remoteAddress = IsAlbionUdpPort(udp.SourcePort)
                ? ipv4Packet?.SourceAddress ?? ipv6Packet?.SourceAddress
                : ipv4Packet?.DestinationAddress ?? ipv6Packet?.DestinationAddress;
            if (remoteAddress is null) return;
            var detectedRegion = DetectRegion(remoteAddress);

            var payload = udp.PayloadData;
            if (payload is null || payload.Length == 0) return;
            ProcessCapturedPayload(detectedRegion, payload);
        }
        catch (Exception ex)
        {
            SetParseError($"Packet decode failed: {ex.Message}");
        }
    }

    internal bool SelectRegion(string? detectedRegion)
    {
        lock (_gate)
        {
            if (detectedRegion is not null)
            {
                if (_detectedRegion is not null &&
                    !string.Equals(_detectedRegion, detectedRegion, StringComparison.OrdinalIgnoreCase))
                {
                    _blocked = true;
                    _lastError = $"Multiple Albion server regions detected: {_detectedRegion}, {detectedRegion}. Capture stopped for safety.";
                    Log(_lastError);
                    return false;
                }

                _detectedRegion ??= detectedRegion;
            }

            // An explicitly selected region is authoritative for parsing. Endpoint geolocation
            // data is advisory and can be stale or wrong for an otherwise valid server address.
            _activeRegion = _manualRegion ?? _detectedRegion;
            return _activeRegion is not null && !_blocked;
        }
    }

    internal bool ProcessCapturedPayload(string? detectedRegion, byte[] payload)
    {
        if (!SelectRegion(detectedRegion)) return false;
        _parser.ReceivePacket(payload);
        return true;
    }

    private void OnOrder(BlackMarketOrder order)
    {
        if (_orderBook.Apply(order))
            lock (_gate) _lastOrderAtUtc = DateTime.UtcNow;
    }

    private void SetParseError(string message)
    {
        lock (_gate) _lastError = message;
        Log(message);
    }

    private void SetError(string message)
    {
        lock (_gate) _lastError = message;
        Log(message);
    }

    private void Log(string message) => _log?.Invoke(message);

    private static bool IsAlbionUdpPort(int port) => port is 5055 or 5056;

    private static string? DetectRegion(IPAddress address)
    {
        var value = address.ToString();
        if (value.StartsWith("5.188.125.", StringComparison.Ordinal)) return "us";
        if (value.StartsWith("5.45.187.", StringComparison.Ordinal)) return "asia";
        if (value.StartsWith("193.169.238.", StringComparison.Ordinal)) return "eu";
        return null;
    }
}
