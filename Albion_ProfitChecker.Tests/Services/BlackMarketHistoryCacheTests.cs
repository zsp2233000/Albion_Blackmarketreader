using AlbionProfitChecker.Services;

namespace AlbionProfitChecker.Tests.Services;

public sealed class BlackMarketHistoryCacheTests : IDisposable
{
    private readonly string _tempDirectory = Path.Combine(
        Path.GetTempPath(),
        "AlbionProfitCheckerTests",
        Guid.NewGuid().ToString("N"));

    [Fact]
    public async Task GetOrAddAsync_ConcurrentRequestsForSameKey_InvokeFactoryOnce()
    {
        var cache = new BlackMarketHistoryCache();
        var key = CreateKey();
        var calls = 0;
        var expected = new BlackMarketHistorySnapshot(1_000, 2.5, 14, 14);

        var requests = Enumerable.Range(0, 20).Select(_ => cache.GetOrAddAsync(key, async () =>
        {
            Interlocked.Increment(ref calls);
            await Task.Delay(25);
            return expected;
        }));

        var results = await Task.WhenAll(requests);

        Assert.Equal(1, calls);
        Assert.All(results, result => Assert.Equal(expected, result));
    }

    [Fact]
    public async Task GetOrAddAsync_EmptyResult_IsCached()
    {
        var cache = new BlackMarketHistoryCache();
        var key = CreateKey();
        var calls = 0;

        BlackMarketHistorySnapshot Factory()
        {
            calls++;
            return BlackMarketHistorySnapshot.Empty;
        }

        var first = await cache.GetOrAddAsync(key, () => Task.FromResult(Factory()));
        var second = await cache.GetOrAddAsync(key, () => Task.FromResult(Factory()));

        Assert.Equal(BlackMarketHistorySnapshot.Empty, first);
        Assert.Equal(BlackMarketHistorySnapshot.Empty, second);
        Assert.Equal(1, calls);
    }

    [Fact]
    public async Task GetOrAddAsync_DifferentHostsOrQuerySettings_DoNotShareEntries()
    {
        var cache = new BlackMarketHistoryCache();
        var calls = 0;
        var keys = new[]
        {
            CreateKey(apiHost: "https://east.albion-online-data.com/api/v2/stats", minPoints: 1),
            CreateKey(apiHost: "https://west.albion-online-data.com/api/v2/stats", minPoints: 1),
            CreateKey(apiHost: "https://east.albion-online-data.com/api/v2/stats", minPoints: 2),
            CreateKey(location: "Caerleon"),
            CreateKey(daySpans: new[] { 7, 14 })
        };

        foreach (var key in keys)
        {
            await cache.GetOrAddAsync(key, () =>
            {
                calls++;
                return Task.FromResult(new BlackMarketHistorySnapshot(calls, calls, 14, 14));
            });
        }

        Assert.Equal(5, calls);
    }

    [Fact]
    public async Task SaveAsync_SubsequentCacheLoadsEntryWithoutCallingFactory()
    {
        Directory.CreateDirectory(_tempDirectory);
        var path = Path.Combine(_tempDirectory, "history-cache.json");
        var key = CreateKey();
        var expected = new BlackMarketHistorySnapshot(2_000, 3.5, 14, 12);
        var firstCache = new BlackMarketHistoryCache(path);
        await firstCache.GetOrAddAsync(key, () => Task.FromResult(expected));
        await firstCache.SaveAsync();

        var calls = 0;
        var secondCache = new BlackMarketHistoryCache(path);
        var actual = await secondCache.GetOrAddAsync(key, () =>
        {
            calls++;
            return Task.FromResult(BlackMarketHistorySnapshot.Empty);
        });

        Assert.Equal(expected, actual);
        Assert.Equal(0, calls);
    }

    [Theory]
    [InlineData("not-json")]
    [InlineData("{\"Version\":1,\"Entries\":null}")]
    [InlineData("{\"Version\":1,\"Entries\":[null]}")]
    public async Task CorruptCacheFile_IsIgnoredAndReplaced(string corruptContent)
    {
        Directory.CreateDirectory(_tempDirectory);
        var path = Path.Combine(_tempDirectory, "history-cache.json");
        await File.WriteAllTextAsync(path, corruptContent);
        var messages = new List<string>();

        var cache = new BlackMarketHistoryCache(path, messages.Add);
        var expected = new BlackMarketHistorySnapshot(3_000, 4.5, 14, 10);
        var actual = await cache.GetOrAddAsync(CreateKey(), () => Task.FromResult(expected));
        await cache.SaveAsync();

        Assert.Equal(expected, actual);
        Assert.Contains(messages, message => message.Contains("WARN", StringComparison.OrdinalIgnoreCase));
        Assert.StartsWith("{", await File.ReadAllTextAsync(path));
    }

    public void Dispose()
    {
        if (Directory.Exists(_tempDirectory))
            Directory.Delete(_tempDirectory, recursive: true);
    }

    private static BlackMarketHistoryCacheKey CreateKey(
        string apiHost = "https://east.albion-online-data.com/api/v2/stats/",
        int minPoints = 1,
        string location = "Black Market",
        int[]? daySpans = null)
        => BlackMarketHistoryCacheKey.Create(apiHost, "T4_BAG", location, daySpans ?? new[] { 14 }, minPoints);
}
