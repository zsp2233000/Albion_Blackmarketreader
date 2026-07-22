using System.Text.Json;
using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public sealed class BlackMarketOrderStore
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    private readonly object _gate = new();
    private readonly string _path;
    private readonly string _backupPath;

    public BlackMarketOrderStore(string? path = null)
    {
        var defaultDirectory = System.IO.Path.Combine(
            Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData),
            "AlbionBlackmarketReader");
        _path = System.IO.Path.GetFullPath(path ?? System.IO.Path.Combine(defaultDirectory, "black-market-orders.json"));
        _backupPath = _path + ".bak";
    }

    public string Path => _path;

    public BlackMarketLocalState Load()
    {
        lock (_gate)
        {
            if (TryRead(_path, out var state)) return state;
            if (TryRead(_backupPath, out state)) return state;
            return new BlackMarketLocalState();
        }
    }

    public void Save(IEnumerable<BlackMarketOrder> orders, DateTime? nowUtc = null)
    {
        lock (_gate)
        {
            var directory = System.IO.Path.GetDirectoryName(_path);
            if (!string.IsNullOrWhiteSpace(directory)) Directory.CreateDirectory(directory);

            var state = new BlackMarketLocalState
            {
                UpdatedAtUtc = (nowUtc ?? DateTime.UtcNow).ToUniversalTime(),
                Orders = orders.OrderBy(order => order.OrderId).ToList()
            };
            var json = JsonSerializer.Serialize(state, JsonOptions);
            var tempPath = _path + ".tmp";

            File.WriteAllText(tempPath, json);
            if (!TryRead(tempPath, out _))
            {
                File.Delete(tempPath);
                throw new InvalidDataException("Local Black Market JSON validation failed.");
            }

            if (File.Exists(_path) && TryRead(_path, out _))
                File.Copy(_path, _backupPath, overwrite: true);

            if (File.Exists(_path))
            {
                try
                {
                    File.Replace(tempPath, _path, destinationBackupFileName: null);
                }
                catch (PlatformNotSupportedException)
                {
                    File.Move(tempPath, _path, overwrite: true);
                }
                catch (UnauthorizedAccessException)
                {
                    // Some Windows filesystems disallow ReplaceFile even when the directory is writable.
                    // The validated temp file still gives us a recoverable overwrite fallback.
                    File.Move(tempPath, _path, overwrite: true);
                }
                catch (IOException)
                {
                    File.Move(tempPath, _path, overwrite: true);
                }
            }
            else
            {
                File.Move(tempPath, _path);
            }
        }
    }

    private static bool TryRead(string path, out BlackMarketLocalState state)
    {
        state = new BlackMarketLocalState();
        try
        {
            if (!File.Exists(path)) return false;
            var parsed = JsonSerializer.Deserialize<BlackMarketLocalState>(File.ReadAllText(path), JsonOptions);
            if (parsed is null || parsed.Orders is null) return false;
            state = parsed;
            return true;
        }
        catch (JsonException)
        {
            return false;
        }
        catch (IOException)
        {
            return false;
        }
    }
}
