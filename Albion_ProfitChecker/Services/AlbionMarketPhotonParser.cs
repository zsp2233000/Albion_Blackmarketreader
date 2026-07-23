using System.Collections;
using System.Globalization;
using System.Text.Json;
using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public sealed class AlbionMarketPhotonParser : Photon18Parser
{
    public const byte AuctionGetOffersOperation = 81;
    public const byte AuctionGetRequestsOperation = 82;

    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        PropertyNameCaseInsensitive = true
    };

    private readonly Func<string?> _regionProvider;
    private readonly Action<BlackMarketOrder> _onOrder;
    private readonly Action<string>? _onError;

    public AlbionMarketPhotonParser(Func<string?> regionProvider, Action<BlackMarketOrder> onOrder, Action<string>? onError = null)
    {
        _regionProvider = regionProvider;
        _onOrder = onOrder;
        _onError = onError;
    }

    public AlbionMarketPhotonParser(string region, Action<BlackMarketOrder> onOrder, Action<string>? onError = null)
        : this(() => region, onOrder, onError)
    {
    }

    public long ParsedOrderCount { get; private set; }
    public long ParseErrorCount { get; private set; }

    protected override void OnRequest(byte operationCode, Dictionary<byte, object> parameters)
    {
    }

    protected override void OnResponse(byte operationCode, short returnCode, string debugMessage, Dictionary<byte, object> parameters)
    {
        if (returnCode != 0) return;
        if (operationCode is not (AuctionGetOffersOperation or AuctionGetRequestsOperation)) return;

        var auctionType = operationCode == AuctionGetRequestsOperation ? "request" : "offer";
        if (!parameters.TryGetValue(0, out var rawOrders)) return;

        var region = _regionProvider() ?? "unknown";
        foreach (var json in ExtractJsonStrings(rawOrders))
        {
            if (!TryParseOrder(json, auctionType, region, DateTime.UtcNow, out var order, out var error))
            {
                RegisterError(error ?? "Unknown market order parse failure.");
                continue;
            }

            ParsedOrderCount++;
            _onOrder(order);
        }
    }

    protected override void OnEvent(byte code, Dictionary<byte, object> parameters)
    {
    }

    public static bool TryParseOrder(
        string json,
        string auctionType,
        string region,
        DateTime nowUtc,
        out BlackMarketOrder order,
        out string? error)
    {
        order = new BlackMarketOrder();
        error = null;
        try
        {
            var dto = JsonSerializer.Deserialize<MarketOrderDto>(json, JsonOptions);
            if (dto is null) return Fail("Market order JSON was empty.", out order, out error);

            var normalizedRegion = BlackMarketCaptureConstants.NormalizeRegion(region);
            if (normalizedRegion is null) return Fail("Market order region was unknown.", out order, out error);
            if (dto.Id <= 0) return Fail("Market order id was missing.", out order, out error);
            if (string.IsNullOrWhiteSpace(dto.ItemTypeId)) return Fail("Market order item id was missing.", out order, out error);
            if (!BlackMarketLocationRules.IsBlackMarket(dto.LocationId))
                return Fail($"Market order location was not Black Market: {dto.LocationId}.", out order, out error);
            if (dto.QualityLevel is < 1 or > 5) return Fail("Market order quality was outside 1..5.", out order, out error);
            if (dto.Amount <= 0) return Fail("Market order amount was not positive.", out order, out error);
            if (dto.UnitPriceSilver <= 0) return Fail("Market order price was not positive.", out order, out error);
            if (!TryParseExpiry(dto.Expires, out var expiresUtc) || expiresUtc <= nowUtc.ToUniversalTime())
                return Fail("Market order expiry was invalid or already elapsed.", out order, out error);

            var observedAt = nowUtc.ToUniversalTime();
            order = new BlackMarketOrder
            {
                OrderId = dto.Id,
                ItemId = dto.ItemTypeId.Trim(),
                LocationId = dto.LocationId?.Trim() ?? string.Empty,
                Region = normalizedRegion,
                QualityLevel = dto.QualityLevel,
                EnchantmentLevel = dto.EnchantmentLevel,
                UnitPriceSilver = dto.UnitPriceSilver,
                Amount = dto.Amount,
                AuctionType = auctionType,
                ExpiresUtc = expiresUtc,
                FirstSeenUtc = observedAt,
                LastSeenUtc = observedAt
            };
            return true;
        }
        catch (JsonException ex)
        {
            return Fail($"Market order JSON was invalid: {ex.Message}", out order, out error);
        }
        catch (FormatException ex)
        {
            return Fail($"Market order had an invalid value: {ex.Message}", out order, out error);
        }
    }

    private void RegisterError(string message)
    {
        ParseErrorCount++;
        _onError?.Invoke(message);
    }

    private static IEnumerable<string> ExtractJsonStrings(object? value)
    {
        if (value is null) yield break;
        if (value is string text)
        {
            if (!string.IsNullOrWhiteSpace(text)) yield return text;
            yield break;
        }

        if (value is JsonElement element)
        {
            if (element.ValueKind == JsonValueKind.String)
            {
                var textValue = element.GetString();
                if (!string.IsNullOrWhiteSpace(textValue)) yield return textValue;
            }
            else if (element.ValueKind == JsonValueKind.Array)
            {
                foreach (var child in element.EnumerateArray())
                    foreach (var childJson in ExtractJsonStrings(child)) yield return childJson;
            }
            yield break;
        }

        if (value is IDictionary dictionary)
        {
            foreach (DictionaryEntry entry in dictionary)
                foreach (var childJson in ExtractJsonStrings(entry.Value)) yield return childJson;
            yield break;
        }

        if (value is IEnumerable enumerable)
        {
            foreach (var child in enumerable)
                foreach (var childJson in ExtractJsonStrings(child)) yield return childJson;
        }
    }

    private static bool TryParseExpiry(string? raw, out DateTime expiresUtc)
    {
        if (DateTime.TryParse(raw, CultureInfo.InvariantCulture, DateTimeStyles.AssumeUniversal | DateTimeStyles.AdjustToUniversal, out expiresUtc))
            return true;
        if (long.TryParse(raw, NumberStyles.Integer, CultureInfo.InvariantCulture, out var unixSeconds))
        {
            expiresUtc = DateTimeOffset.FromUnixTimeSeconds(unixSeconds).UtcDateTime;
            return true;
        }
        expiresUtc = default;
        return false;
    }

    private static bool Fail(string message, out BlackMarketOrder order, out string? error)
    {
        order = new BlackMarketOrder();
        error = message;
        return false;
    }

    private sealed class MarketOrderDto
    {
        public long Id { get; set; }
        public string ItemTypeId { get; set; } = string.Empty;
        public string LocationId { get; set; } = string.Empty;
        public int QualityLevel { get; set; }
        public int EnchantmentLevel { get; set; }
        public long UnitPriceSilver { get; set; }
        public int Amount { get; set; }
        public string Expires { get; set; } = string.Empty;
    }
}

public static class BlackMarketLocationRules
{
    // Albion's Caerleon world location is represented as market id 3003; the client may append
    // -Auction2 or use the explicit Black Market token. BLACKBANK-* is deliberately excluded.
    public static bool IsBlackMarket(string? rawLocationId)
    {
        if (string.IsNullOrWhiteSpace(rawLocationId)) return false;
        var value = rawLocationId.Trim().Trim('\"', '\'');
        if (value.Equals("BLACK_MARKET", StringComparison.OrdinalIgnoreCase) ||
            value.Equals("BLACKMARKET", StringComparison.OrdinalIgnoreCase)) return true;

        var candidate = value;
        while (candidate.EndsWith("-Auction2", StringComparison.OrdinalIgnoreCase))
            candidate = candidate[..^"-Auction2".Length];
        return candidate.Equals("3003", StringComparison.OrdinalIgnoreCase);
    }
}
