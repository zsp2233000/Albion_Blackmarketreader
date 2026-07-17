using System.Collections.Concurrent;
using System.Text.Json;

namespace AlbionProfitChecker.Services;

public sealed record BlackMarketHistorySnapshot(
    double AvgPrice,
    double AvgSoldPerDay,
    int DaysUsed,
    int PointsUsed)
{
    public static BlackMarketHistorySnapshot Empty { get; } = new(0, 0, 0, 0);
}

public sealed record BlackMarketHistoryCacheKey(
    string ApiHost,
    string ItemId,
    string Location,
    string DaySpans,
    int MinPoints)
{
    public static BlackMarketHistoryCacheKey Create(
        string apiHost,
        string itemId,
        string location,
        IEnumerable<int> daySpans,
        int minPoints)
        => new(
            apiHost.Trim().TrimEnd('/').ToLowerInvariant(),
            itemId.Trim().ToUpperInvariant(),
            location.Trim().ToUpperInvariant(),
            string.Join(',', daySpans),
            minPoints);
}

public sealed record BlackMarketHistoryCacheStatistics(
    int Loaded,
    long Hits,
    long Misses,
    int Saved);

public sealed class BlackMarketHistoryCache
{
    private const int CurrentFormatVersion = 1;
    private static readonly JsonSerializerOptions JsonOptions = new() { WriteIndented = true };

    private readonly ConcurrentDictionary<BlackMarketHistoryCacheKey, Lazy<Task<BlackMarketHistorySnapshot>>> _entries = new();
    private readonly SemaphoreSlim _saveLock = new(1, 1);
    private readonly string? _filePath;
    private readonly Action<string> _log;
    private int _loaded;
    private int _saved;
    private long _hits;
    private long _misses;

    public BlackMarketHistoryCache(string? filePath = null, Action<string>? log = null)
    {
        _filePath = string.IsNullOrWhiteSpace(filePath) ? null : Path.GetFullPath(filePath);
        _log = log ?? Console.WriteLine;
        Load();
    }

    public BlackMarketHistoryCacheStatistics Statistics => new(
        Volatile.Read(ref _loaded),
        Interlocked.Read(ref _hits),
        Interlocked.Read(ref _misses),
        Volatile.Read(ref _saved));

    public async Task<BlackMarketHistorySnapshot> GetOrAddAsync(
        BlackMarketHistoryCacheKey key,
        Func<Task<BlackMarketHistorySnapshot>> factory)
    {
        ArgumentNullException.ThrowIfNull(key);
        ArgumentNullException.ThrowIfNull(factory);

        var candidate = new Lazy<Task<BlackMarketHistorySnapshot>>(
            factory,
            LazyThreadSafetyMode.ExecutionAndPublication);
        var selected = _entries.GetOrAdd(key, candidate);

        if (ReferenceEquals(candidate, selected))
            Interlocked.Increment(ref _misses);
        else
            Interlocked.Increment(ref _hits);

        try
        {
            return await selected.Value.ConfigureAwait(false);
        }
        catch
        {
            if (_entries.TryGetValue(key, out var current) && ReferenceEquals(current, selected))
                _entries.TryRemove(key, out _);
            throw;
        }
    }

    public async Task SaveAsync(CancellationToken cancellationToken = default)
    {
        await _saveLock.WaitAsync(cancellationToken).ConfigureAwait(false);
        try
        {
            if (_filePath is null)
            {
                LogStatistics(saved: 0, "memory only");
                return;
            }

            var completedEntries = _entries
                .Where(pair => pair.Value.IsValueCreated && pair.Value.Value.IsCompletedSuccessfully)
                .Select(pair => new PersistedEntry(pair.Key, pair.Value.Value.Result))
                .OrderBy(entry => entry.Key.ApiHost, StringComparer.Ordinal)
                .ThenBy(entry => entry.Key.ItemId, StringComparer.Ordinal)
                .ThenBy(entry => entry.Key.DaySpans, StringComparer.Ordinal)
                .ToList();

            var directory = Path.GetDirectoryName(_filePath);
            if (!string.IsNullOrWhiteSpace(directory))
                Directory.CreateDirectory(directory);

            var temporaryPath = $"{_filePath}.{Guid.NewGuid():N}.tmp";
            try
            {
                await using (var stream = new FileStream(
                    temporaryPath,
                    FileMode.CreateNew,
                    FileAccess.Write,
                    FileShare.None,
                    bufferSize: 16_384,
                    useAsync: true))
                {
                    var document = new PersistedDocument(CurrentFormatVersion, completedEntries);
                    await JsonSerializer.SerializeAsync(stream, document, JsonOptions, cancellationToken).ConfigureAwait(false);
                }

                File.Move(temporaryPath, _filePath, overwrite: true);
            }
            finally
            {
                if (File.Exists(temporaryPath))
                    File.Delete(temporaryPath);
            }

            Volatile.Write(ref _saved, completedEntries.Count);
            LogStatistics(completedEntries.Count, "file");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException)
        {
            _log($"WARN: BM history cache could not be saved to '{_filePath}': {ex.Message}");
        }
        finally
        {
            _saveLock.Release();
        }
    }

    private void Load()
    {
        if (_filePath is null || !File.Exists(_filePath))
            return;

        try
        {
            var json = File.ReadAllText(_filePath);
            var document = JsonSerializer.Deserialize<PersistedDocument>(json, JsonOptions);
            if (document is null || document.Version != CurrentFormatVersion || document.Entries is null)
                throw new JsonException("Unsupported cache format.");

            foreach (var entry in document.Entries)
            {
                if (entry?.Key is null || entry.Value is null)
                    throw new JsonException("Cache entry is incomplete.");

                var snapshot = entry.Value;
                _entries[entry.Key] = new Lazy<Task<BlackMarketHistorySnapshot>>(
                    () => Task.FromResult(snapshot),
                    LazyThreadSafetyMode.ExecutionAndPublication);
            }

            Volatile.Write(ref _loaded, _entries.Count);
            _log($"BM history cache: loaded={_entries.Count} from '{_filePath}'.");
        }
        catch (Exception ex) when (ex is IOException or UnauthorizedAccessException or JsonException or NotSupportedException)
        {
            _entries.Clear();
            _log($"WARN: BM history cache '{_filePath}' is invalid and will be rebuilt: {ex.Message}");
        }
    }

    private void LogStatistics(int saved, string destination)
    {
        var statistics = Statistics with { Saved = saved };
        _log(
            $"BM history cache: loaded={statistics.Loaded}, hits={statistics.Hits}, " +
            $"misses={statistics.Misses}, saved={statistics.Saved} ({destination}).");
    }

    private sealed record PersistedDocument(int Version, IReadOnlyList<PersistedEntry?>? Entries);
    private sealed record PersistedEntry(BlackMarketHistoryCacheKey Key, BlackMarketHistorySnapshot Value);
}
