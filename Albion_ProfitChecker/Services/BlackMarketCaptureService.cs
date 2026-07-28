using System.Net;
using PacketDotNet;
using SharpPcap;
using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public sealed class BlackMarketCaptureService : IDisposable
{
    private const string CaptureFilter = "tcp port 5055 or udp port 5055 or tcp port 5056 or udp port 5056";
    private readonly BlackMarketOrderBook _orderBook;
    private readonly string? _deviceSelector;
    private readonly string? _manualRegion;
    private readonly Action<string>? _log;
    private readonly object _gate = new();
    private readonly AlbionMarketPhotonParser _parser;
    private readonly Dictionary<TcpFlowKey, Photon18TcpStreamAssembler> _tcpStreams = new();
    private ICaptureDevice? _device;
    private string? _detectedRegion;
    private string? _activeRegion;
    private string? _lastError;
    private DateTime? _lastPacketAtUtc;
    private DateTime? _lastOrderAtUtc;
    private long _capturedPacketCount;
    private long _matchedPacketCount;
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
                    Interlocked.Read(ref _matchedPacketCount),
                    _parser.ReceivedPacketCount,
                    _parser.AcceptedPacketCount,
                    _parser.EncryptedPacketCount,
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
            _device.Filter = CaptureFilter;
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
            _tcpStreams.Clear();
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
            var tcp = packet.Extract<TcpPacket>();
            if (udp is null && tcp is null) return;

            var sourcePort = udp?.SourcePort ?? tcp!.SourcePort;
            var destinationPort = udp?.DestinationPort ?? tcp!.DestinationPort;
            if (!IsAlbionTransportPort(sourcePort) && !IsAlbionTransportPort(destinationPort)) return;
            Interlocked.Increment(ref _matchedPacketCount);

            var ipv4Packet = packet.Extract<IPv4Packet>();
            var ipv6Packet = packet.Extract<IPv6Packet>();
            var sourceAddress = ipv4Packet?.SourceAddress ?? ipv6Packet?.SourceAddress;
            var destinationAddress = ipv4Packet?.DestinationAddress ?? ipv6Packet?.DestinationAddress;
            var remoteAddress = IsAlbionTransportPort(sourcePort) ? sourceAddress : destinationAddress;
            if (remoteAddress is null) return;
            var detectedRegion = DetectRegion(remoteAddress);

            if (udp?.PayloadData is { Length: > 0 } udpPayload)
            {
                ProcessCapturedPayload(detectedRegion, udpPayload);
                return;
            }

            if (tcp?.PayloadData is not { Length: > 0 } tcpPayload ||
                sourceAddress is null || destinationAddress is null)
                return;

            var flow = new TcpFlowKey(
                sourceAddress.ToString(),
                sourcePort,
                destinationAddress.ToString(),
                destinationPort);
            Photon18TcpStreamAssembler assembler;
            lock (_gate)
            {
                if (!_tcpStreams.TryGetValue(flow, out var existing))
                    _tcpStreams[flow] = existing = new Photon18TcpStreamAssembler();
                assembler = existing;
            }

            foreach (var frame in assembler.Append(tcp.SequenceNumber, tcpPayload))
                ProcessCapturedPayload(detectedRegion, frame);
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
                    if (_manualRegion is null)
                    {
                        _blocked = true;
                        _lastError = $"Multiple Albion server regions detected: {_detectedRegion}, {detectedRegion}. Capture stopped for safety.";
                        Log(_lastError);
                        return false;
                    }

                    var warning = $"Endpoint region advisory mismatch: {_detectedRegion}, {detectedRegion}. Continuing with manually selected region {_manualRegion}.";
                    if (!string.Equals(_lastError, warning, StringComparison.Ordinal))
                    {
                        _lastError = warning;
                        Log(warning);
                    }
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

    private static bool IsAlbionTransportPort(int port) => port is 5055 or 5056;

    private readonly record struct TcpFlowKey(
        string SourceAddress,
        int SourcePort,
        string DestinationAddress,
        int DestinationPort);

    private static string? DetectRegion(IPAddress address)
    {
        var value = address.ToString();
        if (value.StartsWith("5.188.125.", StringComparison.Ordinal)) return "us";
        if (value.StartsWith("5.45.187.", StringComparison.Ordinal)) return "asia";
        if (value.StartsWith("193.169.238.", StringComparison.Ordinal)) return "eu";
        return null;
    }
}
