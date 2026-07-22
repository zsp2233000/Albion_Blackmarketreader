using System.Text.Json;
using System.Text.Json.Nodes;
using AlbionProfitChecker.Models;

namespace AlbionProfitChecker.Services;

public sealed class BlackMarketProjectionService
{
    private static readonly JsonSerializerOptions JsonOptions = new(JsonSerializerDefaults.Web)
    {
        WriteIndented = true
    };

    public string BuildLocalPayload(string basePath, string region, BlackMarketOrderBook orderBook, DateTime? nowUtc = null)
    {
        var root = ReadRoot(basePath);
        ApplyLocalOverlay(root, region, orderBook, nowUtc ?? DateTime.UtcNow);
        return root.ToJsonString(JsonOptions);
    }

    public void Publish(string basePath, string region, BlackMarketOrderBook orderBook, DateTime? nowUtc = null)
    {
        var root = ReadRoot(basePath);
        ApplyLocalOverlay(root, region, orderBook, nowUtc ?? DateTime.UtcNow);
        var json = root.ToJsonString(JsonOptions);
        using (JsonDocument.Parse(json))
        {
        }

        var tempPath = basePath + ".publish.tmp";
        File.WriteAllText(tempPath, json);
        File.Move(tempPath, basePath, overwrite: true);
    }

    private static JsonObject ReadRoot(string path)
    {
        if (!File.Exists(path)) throw new FileNotFoundException("Published BM snapshot was not found.", path);
        var root = JsonNode.Parse(File.ReadAllText(path)) as JsonObject;
        if (root is null || root["items"] is not JsonArray)
            throw new InvalidDataException("Published BM snapshot must contain an items array.");
        return root;
    }

    private static void ApplyLocalOverlay(JsonObject root, string region, BlackMarketOrderBook orderBook, DateTime nowUtc)
    {
        var items = (JsonArray)root["items"]!;
        var prices = orderBook.GetFreshBuyPrices(region, nowUtc);
        var generatedAt = root["generatedAt"]?.GetValue<string>();

        foreach (var index in Enumerable.Range(0, items.Count))
        {
            var entry = items[index];
            var itemId = ReadItemId(entry);
            if (string.IsNullOrWhiteSpace(itemId)) continue;

            if (entry is JsonArray tuple)
            {
                if (!prices.TryGetValue(itemId, out var localPrice)) continue;
                var sold = tuple.Count > 2 ? tuple[2]?.DeepClone() : null;
                items[index] = new JsonObject
                {
                    ["id"] = itemId,
                    ["bm"] = localPrice.UnitPriceSilver,
                    ["sold"] = sold,
                    ["source"] = "local",
                    ["observedAt"] = localPrice.ObservedAtUtc.ToUniversalTime().ToString("O")
                };
                continue;
            }

            if (entry is not JsonObject itemObject) continue;
            if (prices.TryGetValue(itemId, out var overlay))
            {
                itemObject["bm"] = overlay.UnitPriceSilver;
                itemObject["source"] = "local";
                itemObject["observedAt"] = overlay.ObservedAtUtc.ToUniversalTime().ToString("O");
            }
            else
            {
                itemObject["source"] = "api";
                if (!string.IsNullOrWhiteSpace(generatedAt)) itemObject["observedAt"] = generatedAt;
            }
        }
    }

    private static string? ReadItemId(JsonNode? entry)
    {
        if (entry is JsonArray tuple && tuple.Count > 0) return tuple[0]?.ToString().Trim();
        if (entry is JsonObject item && item["id"] is not null) return item["id"]!.ToString().Trim();
        return null;
    }
}

