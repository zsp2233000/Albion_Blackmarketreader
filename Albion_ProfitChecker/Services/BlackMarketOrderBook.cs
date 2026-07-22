using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public sealed class BlackMarketOrderBook
{
    private readonly object _gate = new();
    private readonly Dictionary<long, BlackMarketOrder> _orders;
    private readonly BlackMarketOrderStore _store;

    public BlackMarketOrderBook(BlackMarketOrderStore store)
    {
        _store = store;
        _orders = store.Load().Orders
            .Where(order => order.OrderId > 0)
            .GroupBy(order => order.OrderId)
            .ToDictionary(group => group.Key, group => group.OrderByDescending(order => order.LastSeenUtc).First());
    }

    public int Count
    {
        get { lock (_gate) return _orders.Count; }
    }

    public bool Apply(BlackMarketOrder order, DateTime? nowUtc = null)
    {
        if (!IsWellFormed(order)) return false;
        var now = (nowUtc ?? DateTime.UtcNow).ToUniversalTime();
        order.LastSeenUtc = now;
        if (order.FirstSeenUtc == default) order.FirstSeenUtc = now;

        lock (_gate)
        {
            if (_orders.TryGetValue(order.OrderId, out var previous))
                order.FirstSeenUtc = previous.FirstSeenUtc == default ? order.FirstSeenUtc : previous.FirstSeenUtc;
            _orders[order.OrderId] = order;
            _store.Save(_orders.Values, now);
        }

        return true;
    }

    public IReadOnlyList<BlackMarketOrder> Snapshot()
    {
        lock (_gate)
            return _orders.Values.Select(Clone).ToList();
    }

    public IReadOnlyDictionary<string, BlackMarketLocalPrice> GetFreshBuyPrices(string region, DateTime? nowUtc = null)
    {
        var now = (nowUtc ?? DateTime.UtcNow).ToUniversalTime();
        var cutoff = now - BlackMarketCaptureConstants.LocalFreshness;
        var normalizedRegion = BlackMarketCaptureConstants.NormalizeRegion(region);
        if (normalizedRegion is null) return new Dictionary<string, BlackMarketLocalPrice>();

        lock (_gate)
        {
            return _orders.Values
                .Where(order => string.Equals(order.Region, normalizedRegion, StringComparison.OrdinalIgnoreCase))
                .Where(order => IsBuyOrder(order.AuctionType))
                .Where(order => BlackMarketCaptureConstants.CalculationQualities.Contains(order.QualityLevel))
                .Where(order => order.Amount > 0 && order.UnitPriceSilver > 0)
                .Where(order => order.ExpiresUtc > now && order.LastSeenUtc >= cutoff)
                .GroupBy(order => order.ItemId, StringComparer.OrdinalIgnoreCase)
                .ToDictionary(
                    group => group.Key,
                    group =>
                    {
                        var best = group.OrderByDescending(order => order.UnitPriceSilver).ThenByDescending(order => order.LastSeenUtc).First();
                        return new BlackMarketLocalPrice(best.UnitPriceSilver, best.LastSeenUtc, best.QualityLevel);
                    },
                    StringComparer.OrdinalIgnoreCase);
        }
    }

    private static bool IsWellFormed(BlackMarketOrder order) =>
        order.OrderId > 0 &&
        !string.IsNullOrWhiteSpace(order.ItemId) &&
        BlackMarketCaptureConstants.IsSupportedRegion(order.Region) &&
        order.QualityLevel is >= 1 and <= 5 &&
        order.Amount > 0 &&
        order.UnitPriceSilver > 0 &&
        order.ExpiresUtc > DateTime.UtcNow &&
        order.LastSeenUtc <= DateTime.UtcNow.AddMinutes(5);

    private static bool IsBuyOrder(string? auctionType) =>
        string.Equals(auctionType, "request", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(auctionType, "requests", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(auctionType, "buy", StringComparison.OrdinalIgnoreCase) ||
        string.Equals(auctionType, "buy_order", StringComparison.OrdinalIgnoreCase);

    private static BlackMarketOrder Clone(BlackMarketOrder order) => new()
    {
        OrderId = order.OrderId,
        ItemId = order.ItemId,
        LocationId = order.LocationId,
        Region = order.Region,
        QualityLevel = order.QualityLevel,
        EnchantmentLevel = order.EnchantmentLevel,
        UnitPriceSilver = order.UnitPriceSilver,
        Amount = order.Amount,
        AuctionType = order.AuctionType,
        ExpiresUtc = order.ExpiresUtc,
        FirstSeenUtc = order.FirstSeenUtc,
        LastSeenUtc = order.LastSeenUtc
    };
}

public sealed record BlackMarketLocalPrice(long UnitPriceSilver, DateTime ObservedAtUtc, int QualityLevel);

