using System.Text.Json;
using AlbionProfitChecker.Models;
using AlbionProfitChecker.Services;

namespace AlbionProfitChecker.Tests.Services;

public sealed class BlackMarketCaptureTests
{
    [Fact]
    public void RecognizesBlackMarketLocationWithoutAcceptingBlackBank()
    {
        Assert.True(BlackMarketLocationRules.IsBlackMarket("3003"));
        Assert.True(BlackMarketLocationRules.IsBlackMarket("3003-Auction2"));
        Assert.True(BlackMarketLocationRules.IsBlackMarket("BLACK_MARKET"));
        Assert.False(BlackMarketLocationRules.IsBlackMarket("3002"));
        Assert.False(BlackMarketLocationRules.IsBlackMarket("BLACKBANK-3003"));
    }

    [Fact]
    public void ParsesOrdersAndRejectsInvalidLocationOrExpiry()
    {
        var now = DateTime.UtcNow;
        var validJson = OrderJson(101, "T4_MAIN_SWORD", "3003-Auction2", 2, 12345, now.AddMinutes(20));

        Assert.True(AlbionMarketPhotonParser.TryParseOrder(validJson, "request", "eu", now, out var order, out _));
        Assert.Equal(101, order.OrderId);
        Assert.Equal("eu", order.Region);
        Assert.Equal(2, order.QualityLevel);

        Assert.False(AlbionMarketPhotonParser.TryParseOrder(
            OrderJson(102, "T4_MAIN_SWORD", "3002", 1, 12345, now.AddMinutes(20)),
            "request", "eu", now, out _, out _));
        Assert.False(AlbionMarketPhotonParser.TryParseOrder(
            OrderJson(103, "T4_MAIN_SWORD", "3003", 1, 12345, now.AddMinutes(-1)),
            "request", "eu", now, out _, out _));
    }

    [Fact]
    public void KeepsCurrentOrderStateAndUsesFreshFirstThreeQualityBuyOrders()
    {
        var path = TempPath();
        try
        {
            var store = new BlackMarketOrderStore(path);
            var book = new BlackMarketOrderBook(store);
            var now = DateTime.UtcNow;

            Assert.True(book.Apply(Order(1, "T4_MAIN_SWORD", "request", 1, 1000, now.AddHours(3)), now));
            Assert.True(book.Apply(Order(2, "T4_MAIN_SWORD", "request", 4, 9000, now.AddHours(3)), now));
            Assert.True(book.Apply(Order(3, "T4_MAIN_AXE", "offer", 1, 9000, now.AddHours(3)), now));
            Assert.True(book.Apply(Order(4, "T4_MAIN_BOW", "request", 1, 9000, now.AddHours(3)), now));

            var prices = book.GetFreshBuyPrices("eu", now);
            Assert.Equal(1000, prices["T4_MAIN_SWORD"].UnitPriceSilver);
            Assert.DoesNotContain("T4_MAIN_AXE", prices.Keys);

            var stalePrices = book.GetFreshBuyPrices("eu", now.AddHours(2));
            Assert.DoesNotContain("T4_MAIN_BOW", stalePrices.Keys);
        }
        finally
        {
            DeleteTempFiles(path);
        }
    }

    [Fact]
    public void UsesBackupWhenMainLocalJsonIsCorrupt()
    {
        var path = TempPath();
        try
        {
            var store = new BlackMarketOrderStore(path);
            var now = DateTime.UtcNow;
            store.Save(new[] { Order(1, "T4_MAIN_SWORD", "request", 1, 1000, now.AddMinutes(20)) }, now);
            store.Save(new[] { Order(2, "T4_MAIN_AXE", "request", 1, 2000, now.AddMinutes(20)) }, now);
            File.WriteAllText(path, "{not valid json");

            var recovered = new BlackMarketOrderStore(path).Load();
            Assert.Single(recovered.Orders);
            Assert.Equal(1, recovered.Orders[0].OrderId);
        }
        finally
        {
            DeleteTempFiles(path);
        }
    }

    [Fact]
    public void LocalProjectionOverlaysOnlyFreshEntriesAndKeepsApiFallback()
    {
        var directory = Directory.CreateDirectory(Path.Combine(Path.GetTempPath(), Guid.NewGuid().ToString("N"))).FullName;
        var statePath = Path.Combine(directory, "orders.json");
        var basePath = Path.Combine(directory, "bm-crafter-eu.json");
        try
        {
            File.WriteAllText(basePath, "{\"generatedAt\":\"2026-01-01T00:00:00Z\",\"region\":\"eu\",\"items\":[[\"T4_MAIN_SWORD\",100,2],[\"T4_MAIN_AXE\",200,3]]}");
            var now = DateTime.UtcNow;
            var book = new BlackMarketOrderBook(new BlackMarketOrderStore(statePath));
            book.Apply(Order(1, "T4_MAIN_SWORD", "request", 1, 999, now.AddMinutes(20)), now);

            var payload = new BlackMarketProjectionService().BuildLocalPayload(basePath, "eu", book, now);
            using var json = JsonDocument.Parse(payload);
            var items = json.RootElement.GetProperty("items");
            Assert.Equal("local", items[0].GetProperty("source").GetString());
            Assert.Equal(999, items[0].GetProperty("bm").GetInt64());
            Assert.Equal(JsonValueKind.Array, items[1].ValueKind);
        }
        finally
        {
            if (Directory.Exists(directory)) Directory.Delete(directory, recursive: true);
        }
    }

    private static BlackMarketOrder Order(long id, string itemId, string auctionType, int quality, long price, DateTime expiry) => new()
    {
        OrderId = id,
        ItemId = itemId,
        LocationId = "3003",
        Region = "eu",
        QualityLevel = quality,
        EnchantmentLevel = 0,
        UnitPriceSilver = price,
        Amount = 1,
        AuctionType = auctionType,
        ExpiresUtc = expiry
    };

    private static string OrderJson(long id, string itemId, string location, int quality, long price, DateTime expiry) => JsonSerializer.Serialize(new
    {
        Id = id,
        ItemTypeId = itemId,
        LocationId = location,
        QualityLevel = quality,
        EnchantmentLevel = 0,
        UnitPriceSilver = price,
        Amount = 1,
        Expires = expiry.ToString("O")
    });

    private static string TempPath() => Path.Combine(Path.GetTempPath(), $"albion-bm-test-{Guid.NewGuid():N}.json");

    private static void DeleteTempFiles(string path)
    {
        foreach (var candidate in new[] { path, path + ".bak", path + ".tmp", path + ".publish.tmp" })
            if (File.Exists(candidate)) File.Delete(candidate);
    }
}
