using System.Text.Json.Serialization;

namespace AlbionProfitChecker.Models;

public static class BlackMarketCaptureConstants
{
    public const int CurrentSchemaVersion = 1;
    public static readonly TimeSpan LocalFreshness = TimeSpan.FromHours(1);
    public static readonly int[] CalculationQualities = { 1, 2, 3 };

    public static bool IsSupportedRegion(string? value) =>
        value is "us" or "eu" or "asia";

    public static string? NormalizeRegion(string? value)
    {
        var normalized = value?.Trim().ToLowerInvariant();
        return IsSupportedRegion(normalized) ? normalized : null;
    }
}

public sealed class BlackMarketOrder
{
    [JsonPropertyName("orderId")]
    public long OrderId { get; set; }

    [JsonPropertyName("itemId")]
    public string ItemId { get; set; } = string.Empty;

    [JsonPropertyName("locationId")]
    public string LocationId { get; set; } = string.Empty;

    [JsonPropertyName("region")]
    public string Region { get; set; } = string.Empty;

    [JsonPropertyName("qualityLevel")]
    public int QualityLevel { get; set; }

    [JsonPropertyName("enchantmentLevel")]
    public int EnchantmentLevel { get; set; }

    [JsonPropertyName("unitPriceSilver")]
    public long UnitPriceSilver { get; set; }

    [JsonPropertyName("amount")]
    public int Amount { get; set; }

    [JsonPropertyName("auctionType")]
    public string AuctionType { get; set; } = string.Empty;

    [JsonPropertyName("expiresUtc")]
    public DateTime ExpiresUtc { get; set; }

    [JsonPropertyName("firstSeenUtc")]
    public DateTime FirstSeenUtc { get; set; }

    [JsonPropertyName("lastSeenUtc")]
    public DateTime LastSeenUtc { get; set; }
}

public sealed class BlackMarketLocalState
{
    [JsonPropertyName("schemaVersion")]
    public int SchemaVersion { get; set; } = BlackMarketCaptureConstants.CurrentSchemaVersion;

    [JsonPropertyName("updatedAtUtc")]
    public DateTime UpdatedAtUtc { get; set; } = DateTime.UtcNow;

    [JsonPropertyName("orders")]
    public List<BlackMarketOrder> Orders { get; set; } = new();
}

public sealed record BlackMarketCaptureStatus(
    bool Enabled,
    bool IsCapturing,
    string? Device,
    string? DetectedRegion,
    string? ManualRegion,
    DateTime? LastPacketAtUtc,
    DateTime? LastOrderAtUtc,
    long CapturedPacketCount,
    long ParsedOrderCount,
    long ParseErrorCount,
    string? LastError
);

