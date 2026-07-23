using System.Collections.Concurrent;
using System.Globalization;
using System.Text;
using System.Text.Json;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Hosting;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.FileProviders;
using AlbionProfitChecker.Models;
using AlbionProfitChecker.Services;

namespace AlbionProfitChecker;

internal static class Program
{
    private const string BM_LOCATION = "Black Market";

    private static readonly string[] DEFAULT_CITIES = { "Lymhurst", "Martlock", "Fort Sterling", "Thetford", "Bridgewatch", "Caerleon" };
    private static readonly int[] DEFAULT_TIERS = { 4, 5, 6, 7, 8 };
    private static readonly int[] DEFAULT_ENCHANTS = { 0, 1, 2, 3 };

    private static readonly int[] DEFAULT_BM_DAYS = { 14 };
    private const double DEFAULT_MIN_PROFIT_PERCENT = 30.0;
    private const double DEFAULT_MIN_SOLD_PER_DAY = 0.0;

    private const int DEFAULT_MIN_BM_POINTS = 1;
    private const int DEFAULT_MAX_PRICE_AGE_DAYS = 30;
    private const int DEFAULT_BULK_BATCH_SIZE = 100;
    private const int DEFAULT_BULK_DELAY_MS = 500;
    private const int DEFAULT_HISTORY_RETRIES = 1;
    private const int DEFAULT_HISTORY_RETRY_DELAY_MS = 1200;
    private const int DEFAULT_HISTORY_SPAN_DELAY_MS = 1000;
    private const int DEFAULT_MAX_HISTORY_CONCURRENCY = 3;
    // Verwende das aktuelle Arbeitsverzeichnis, damit ui/public/results.js im Repo geschrieben wird (auch in CI).
    private static readonly string BaseDir = Directory.GetCurrentDirectory();
    private static readonly string UiDir = Path.Combine(BaseDir, "ui");
    private static readonly string UiDistDir = Path.Combine(UiDir, "dist");
    private static readonly string PublicDir = Path.Combine(UiDir, "public");
    private static readonly string PictureDir = Path.Combine(BaseDir, "picture");
    private static readonly string ProgressPath = Path.Combine(UiDir, "progress.json");

    private const string DEFAULT_ITEM_LIST_PATH = "Data/ItemList.json";

    private sealed record Variant(string ItemId, int Tier, int Enchant, string BaseCode);

    private sealed record ResultRow(
        string City,
        string ItemId,
        int Tier,
        int Enchant,
        long CityBuyPrice,
        DateTime? CityDateUtc,
        double BmAvgPrice,
        double BmSoldPerDay,
        double ProfitPercent,
        int DaysUsed
    );

    private sealed record Options(
        string ItemListPath,
        double MinProfitPercent,
        double MinSoldPerDay,
        int[] BmFallbackDays,
        string[] Cities,
        int[] Tiers,
        int[] Enchants,
        int MinBmPoints,
        int MaxPriceAgeDays,
        int BulkBatchSize,
        int BulkDelayMs,
        int HistoryRetries,
        int HistoryRetryDelayMs,
        int HistorySpanDelayMs,
        int MaxHistoryConcurrency,
        string ApiHost,
        string? HistoryCacheFile,
        string? CaptureDevice,
        string? CaptureRegion,
        string? LocalOrderStatePath,
        bool CaptureEnabled
    );

    public static async Task Main(string[] args)
    {
        Console.OutputEncoding = Encoding.UTF8;
        CultureInfo.CurrentCulture = CultureInfo.InvariantCulture;

        bool runOnce = args.Any(a => string.Equals(a, "--run-once", StringComparison.OrdinalIgnoreCase));
        bool publishLocal = args.Any(a => string.Equals(a, "--publish-local", StringComparison.OrdinalIgnoreCase));
        bool listCaptureDevices = args.Any(a => string.Equals(a, "--list-capture-devices", StringComparison.OrdinalIgnoreCase));
        bool serve = !runOnce;

        var options = ParseOptions(args);

        if (listCaptureDevices)
        {
            ListCaptureDevices(options);
            return;
        }

        if (publishLocal)
        {
            await PublishLocalAsync(options);
            return;
        }

        if (serve)
        {
            await RunServerAsync(options);
            return;
        }

        await RunPipelineAsync(options);
    }

    private static async Task RunServerAsync(Options options)
    {
        var uiEntryPath = Path.Combine(UiDistDir, "index.html");
        if (!File.Exists(uiEntryPath))
        {
            Console.WriteLine($"Frontend build missing: {uiEntryPath}");
            Console.WriteLine("Run 'cd ui; npm install; npm run build' and start the server again.");
            return;
        }

        var builder = WebApplication.CreateBuilder(new WebApplicationOptions
        {
            ContentRootPath = BaseDir,
            WebRootPath = UiDistDir
        });

        builder.WebHost.UseUrls("http://localhost:5173");

        var app = builder.Build();

        app.UseDefaultFiles();
        // Serve mutable files (env.js, results.js and data) first so a local
        // pipeline run is visible immediately without rebuilding the bundle.
        if (Directory.Exists(PublicDir))
        {
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(PublicDir),
                RequestPath = ""
            });
        }
        app.UseStaticFiles(); // ui/dist/*
        if (Directory.Exists(PictureDir))
        {
            app.UseStaticFiles(new StaticFileOptions
            {
                FileProvider = new PhysicalFileProvider(PictureDir),
                RequestPath = "/picture"
            });
        }

        app.MapGet("/progress", () =>
        {
            if (!File.Exists(ProgressPath))
                return Results.Json(new { total = 0, done = 0, ts = DateTime.UtcNow });
            var json = File.ReadAllText(ProgressPath);
            return Results.Content(json, "application/json");
        });

        app.MapPost("/refresh", async (HttpContext ctx) =>
        {
            await RunPipelineAsync(options);
            return Results.Json(new { updatedAt = DateTime.UtcNow });
        });

        var localStore = new BlackMarketOrderStore(options.LocalOrderStatePath);
        var orderBook = new BlackMarketOrderBook(localStore);
        var capture = new BlackMarketCaptureService(
            orderBook,
            options.CaptureDevice,
            options.CaptureRegion,
            options.CaptureEnabled,
            message => Console.WriteLine($"[capture] {message}"));
        var projection = new BlackMarketProjectionService();

        app.MapGet("/api/local/status", () => Results.Json(capture.Status));
        app.MapGet("/api/local/bm-crafter-{region}.json", (string region) =>
        {
            var normalizedRegion = BlackMarketCaptureConstants.NormalizeRegion(region);
            if (normalizedRegion is null) return Results.BadRequest(new { error = "Unknown region." });
            var basePath = Path.Combine(PublicDir, "data", $"bm-crafter-{normalizedRegion}.json");
            if (!File.Exists(basePath)) return Results.NotFound();
            try
            {
                var payload = projection.BuildLocalPayload(basePath, normalizedRegion, orderBook);
                return Results.Content(payload, "application/json");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"[capture] local projection fallback: {ex.Message}");
                return Results.File(basePath, "application/json");
            }
        });

        Console.WriteLine("Lokaler Server gestartet: http://localhost:5173");
        Console.WriteLine("Passwort für Dashboard: testo");
        Console.WriteLine($"Local Black Market state: {localStore.Path}");
        if (!capture.Start()) Console.WriteLine("Passive capture unavailable; the existing API/static fallback remains active.");
        app.Lifetime.ApplicationStopping.Register(capture.Dispose);
        TryOpenBrowser("http://localhost:5173");
        await app.RunAsync();
    }

    // ---------- Pipeline ----------

    private static Options ParseOptions(string[] args)
    {
        // simple flag parser: --profit-min 30 --sold-min 0.5 --bm-days 14,30 --item-list path
        var opt = new Options(
            ItemListPath: DEFAULT_ITEM_LIST_PATH,
            MinProfitPercent: DEFAULT_MIN_PROFIT_PERCENT,
            MinSoldPerDay: DEFAULT_MIN_SOLD_PER_DAY,
            BmFallbackDays: DEFAULT_BM_DAYS,
            Cities: DEFAULT_CITIES,
            Tiers: DEFAULT_TIERS,
            Enchants: DEFAULT_ENCHANTS,
            MinBmPoints: DEFAULT_MIN_BM_POINTS,
            MaxPriceAgeDays: DEFAULT_MAX_PRICE_AGE_DAYS,
            BulkBatchSize: DEFAULT_BULK_BATCH_SIZE,
            BulkDelayMs: DEFAULT_BULK_DELAY_MS,
            HistoryRetries: DEFAULT_HISTORY_RETRIES,
            HistoryRetryDelayMs: DEFAULT_HISTORY_RETRY_DELAY_MS,
            HistorySpanDelayMs: DEFAULT_HISTORY_SPAN_DELAY_MS,
            MaxHistoryConcurrency: DEFAULT_MAX_HISTORY_CONCURRENCY,
            ApiHost: "https://west.albion-online-data.com/api/v2/stats",
            HistoryCacheFile: null,
            CaptureDevice: null,
            CaptureRegion: null,
            LocalOrderStatePath: null,
            CaptureEnabled: true
        );

        for (int i = 0; i < args.Length; i++)
        {
            var arg = args[i];
            if (string.Equals(arg, "--profit-min", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && double.TryParse(args[i + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out var p))
            {
                opt = opt with { MinProfitPercent = p };
                i++;
            }
            else if (string.Equals(arg, "--sold-min", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && double.TryParse(args[i + 1], NumberStyles.Float, CultureInfo.InvariantCulture, out var s))
            {
                opt = opt with { MinSoldPerDay = s };
                i++;
            }
            else if (string.Equals(arg, "--bm-days", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                opt = opt with { BmFallbackDays = ParseIntList(args[i + 1], DEFAULT_BM_DAYS) };
                i++;
            }
            else if (string.Equals(arg, "--item-list", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                opt = opt with { ItemListPath = args[i + 1] };
                i++;
            }
            else if (string.Equals(arg, "--tiers", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                opt = opt with { Tiers = ParseIntList(args[i + 1], DEFAULT_TIERS) };
                i++;
            }
            else if (string.Equals(arg, "--enchants", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                opt = opt with { Enchants = ParseIntList(args[i + 1], DEFAULT_ENCHANTS) };
                i++;
            }
            else if (string.Equals(arg, "--cities", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                var list = args[i + 1].Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
                if (list.Length > 0)
                    opt = opt with { Cities = list.ToArray() };
                i++;
            }
            else if (string.Equals(arg, "--api-host", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                opt = opt with { ApiHost = args[i + 1].Trim().TrimEnd('/') };
                i++;
            }
            else if (string.Equals(arg, "--history-cache-file", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                opt = opt with { HistoryCacheFile = args[i + 1].Trim() };
                i++;
            }
            else if (string.Equals(arg, "--capture-device", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                opt = opt with { CaptureDevice = args[i + 1].Trim() };
                i++;
            }
            else if (string.Equals(arg, "--region", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                var region = BlackMarketCaptureConstants.NormalizeRegion(args[i + 1]);
                if (region is not null) opt = opt with { CaptureRegion = region };
                i++;
            }
            else if (string.Equals(arg, "--local-orders", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length)
            {
                opt = opt with { LocalOrderStatePath = args[i + 1].Trim() };
                i++;
            }
            else if (string.Equals(arg, "--no-capture", StringComparison.OrdinalIgnoreCase))
            {
                opt = opt with { CaptureEnabled = false };
            }
            else if (string.Equals(arg, "--bm-min-points", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && int.TryParse(args[i + 1], out var mp))
            {
                opt = opt with { MinBmPoints = Math.Max(1, mp) };
                i++;
            }
            else if (string.Equals(arg, "--max-price-age-days", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && int.TryParse(args[i + 1], out var age))
            {
                opt = opt with { MaxPriceAgeDays = Math.Max(1, age) };
                i++;
            }
            else if (string.Equals(arg, "--bulk-batch-size", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && int.TryParse(args[i + 1], out var bs))
            {
                opt = opt with { BulkBatchSize = Math.Max(1, bs) };
                i++;
            }
            else if (string.Equals(arg, "--bulk-delay-ms", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && int.TryParse(args[i + 1], out var bd))
            {
                opt = opt with { BulkDelayMs = Math.Max(0, bd) };
                i++;
            }
            else if (string.Equals(arg, "--history-retries", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && int.TryParse(args[i + 1], out var hr))
            {
                opt = opt with { HistoryRetries = Math.Max(0, hr) };
                i++;
            }
            else if (string.Equals(arg, "--history-retry-delay-ms", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && int.TryParse(args[i + 1], out var hrd))
            {
                opt = opt with { HistoryRetryDelayMs = Math.Max(0, hrd) };
                i++;
            }
            else if (string.Equals(arg, "--history-span-delay-ms", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && int.TryParse(args[i + 1], out var hsd))
            {
                opt = opt with { HistorySpanDelayMs = Math.Max(0, hsd) };
                i++;
            }
            else if (string.Equals(arg, "--history-parallel", StringComparison.OrdinalIgnoreCase) && i + 1 < args.Length && int.TryParse(args[i + 1], out var hp))
            {
                opt = opt with { MaxHistoryConcurrency = Math.Max(1, hp) };
                i++;
            }
        }

        return opt;
    }

    private static async Task RunPipelineAsync(Options options)
    {
        var api = new AlbionApiService(apiBase: options.ApiHost);
        var historyCache = new BlackMarketHistoryCache(options.HistoryCacheFile);

        // 0) ItemList laden
        var itemListPath = ToAbsolute(options.ItemListPath);
        var baseCodes = LoadItemList(itemListPath);
        if (baseCodes.Length == 0)
        {
            Console.WriteLine($"Keine Items in {itemListPath} gefunden!");
            return;
        }

        var results = new ConcurrentBag<ResultRow>();

        foreach (var city in options.Cities)
        {
            Console.WriteLine($"--- Starte City: {city} ---");

            var variants = GenerateAllVariants(baseCodes, options.Tiers, options.Enchants).ToList();
            int totalVariants = variants.Count;
            UpdateProgress(totalVariants, 0);

            // 2) Bulk City-Preise holen
            var allIds = variants.Select(v => v.ItemId).Distinct(StringComparer.OrdinalIgnoreCase).ToList();
            var cityPrices = await FetchCityPricesBatchedAsync(api, allIds, city, options.MaxPriceAgeDays, options.BulkBatchSize, options.BulkDelayMs);

            int processed = 0;
            var noPriceLogged = new HashSet<string>(StringComparer.OrdinalIgnoreCase);
            using var semaphore = new SemaphoreSlim(options.MaxHistoryConcurrency);
            var tasks = variants.Select(async v =>
            {
                await semaphore.WaitAsync();
                try
                {
                    (int buyPrice, DateTime? buyDateUtc) = cityPrices.TryGetValue(v.ItemId, out var tuple) ? tuple : (0, null);
                    if (buyPrice <= 0)
                    {
                        var key = $"{city}:{v.BaseCode}";
                        if (noPriceLogged.Add(key))
                            Console.WriteLine($"{city} {v.ItemId} (keine preise)");
                        return;
                    }

                    var cacheKey = BlackMarketHistoryCacheKey.Create(
                        options.ApiHost,
                        v.ItemId,
                        BM_LOCATION,
                        options.BmFallbackDays,
                        options.MinBmPoints);
                    var history = await historyCache.GetOrAddAsync(cacheKey, async () =>
                    {
                        var (cachedAvgPrice, cachedAvgSoldPerDay, cachedDaysUsed, cachedPointsUsed) =
                            await GetBmAveragesAsync(
                                api, v.ItemId, options.BmFallbackDays, options.MinBmPoints,
                                options.HistoryRetries, options.HistoryRetryDelayMs, options.HistorySpanDelayMs);
                        return new BlackMarketHistorySnapshot(
                            cachedAvgPrice,
                            cachedAvgSoldPerDay,
                            cachedDaysUsed,
                            cachedPointsUsed);
                    });
                    var (avgPrice, avgSoldPerDay, daysUsed, pointsUsed) = history;

                    if (avgPrice <= 0 || avgSoldPerDay <= 0 || pointsUsed < options.MinBmPoints)
                    {
                        var key = $"{city}:{v.BaseCode}";
                        if (noPriceLogged.Add(key))
                            Console.WriteLine($"{city} {v.ItemId} (keine preise)");
                        return;
                    }

                    double profitPercent = ((avgPrice - buyPrice) / buyPrice) * 100.0;

                    Console.WriteLine(
                        $"info {city} {v.ItemId}: Buy={buyPrice} (Datum: {FormatDate(buyDateUtc)}), " +
                        $"BM ~={Math.Round(avgPrice)} | Profit={profitPercent:+0.0;-0.0}% | Span={daysUsed}d/{pointsUsed}p");

                    if (profitPercent < options.MinProfitPercent || avgSoldPerDay < options.MinSoldPerDay)
                    {
                        Console.WriteLine($"{city} {v.ItemId}: Buy={buyPrice}, BM={Math.Round(avgPrice)}, Profit={profitPercent:+0.0;-0.0}%");
                    }
                    else
                    {
                        results.Add(new ResultRow(
                            city,
                            v.ItemId, v.Tier, v.Enchant,
                            buyPrice, buyDateUtc,
                            avgPrice, avgSoldPerDay, profitPercent, daysUsed
                        ));
                    }
                }
                catch (Exception ex)
                {
                    // One item's API timeout / network blip / parse error must never kill the
                    // whole run. Log and skip; the remaining items keep processing.
                    Console.WriteLine($"WARN {city} {v.ItemId} skipped: {ex.GetType().Name}: {ex.Message}");
                }
                finally
                {
                    var done = Interlocked.Increment(ref processed);
                    if (done == totalVariants || done % 5 == 0)
                        UpdateProgress(totalVariants, done);
                    semaphore.Release();
                }
            }).ToList();

            await Task.WhenAll(tasks);
            UpdateProgress(totalVariants, totalVariants);
        }

        await historyCache.SaveAsync();

        // 4) Ausgabe
        var winners = results
            .OrderByDescending(r => r.ProfitPercent)
            .ThenByDescending(r => r.BmSoldPerDay)
            .ToList();

        ExportResultsToJs(winners, Path.Combine(PublicDir, "results.js"));

        Console.WriteLine();
        Console.WriteLine($"Gefundene profitable Varianten (>= {options.MinProfitPercent:0}% Profit, Zeitraum {string.Join("/", options.BmFallbackDays)} Tage):");

        if (winners.Count == 0)
        {
            Console.WriteLine("(keine)");
            return;
        }

        foreach (var r in winners)
        {
            Console.WriteLine(
                $"{r.City}:{r.ItemId.PadRight(14)} | " +
                $"Buy: {r.CityBuyPrice,9} | " +
                $"BM: {Math.Round(r.BmAvgPrice),10} | " +
                $"Profit: {r.ProfitPercent,7:0.0}% | " +
                $"Span: {r.DaysUsed,2}d"
            );
        }
    }

    private static int[] ParseIntList(string csv, int[] fallback)
    {
        var parts = csv.Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries);
        var list = new List<int>();
        foreach (var p in parts)
        {
            if (int.TryParse(p, NumberStyles.Integer, CultureInfo.InvariantCulture, out var n))
                list.Add(n);
        }
        return list.Count > 0 ? list.ToArray() : fallback;
    }

    private static string[] LoadItemList(string path)
    {
        if (!File.Exists(path))
        {
            Console.WriteLine($"WARN: {path} fehlt, benutze nur BAG als Default.");
            return new[] { "BAG" };
        }

        try
        {
            var json = File.ReadAllText(path);
            var arr = JsonSerializer.Deserialize<string[]>(json);
            return arr ?? Array.Empty<string>();
        }
        catch (Exception ex)
        {
            Console.WriteLine($"Fehler beim Laden von {path}: {ex.Message}");
            return Array.Empty<string>();
        }
    }

    private static IEnumerable<Variant> GenerateAllVariants(IEnumerable<string> baseCodes, IEnumerable<int> tiers, IEnumerable<int> enchants)
    {
        foreach (var baseCode in baseCodes)
        {
            foreach (var tier in tiers)
            {
                foreach (var enchant in enchants)
                {
                    var itemId = enchant == 0
                        ? $"T{tier}_{baseCode}"
                        : $"T{tier}_{baseCode}@{enchant}";
                    yield return new Variant(itemId, tier, enchant, baseCode);
                }
            }
        }
    }

    private static string ToAbsolute(string relativePath)
    {
        if (Path.IsPathRooted(relativePath))
            return relativePath;
        return Path.Combine(BaseDir, relativePath);
    }

    private static string FormatDate(DateTime? utc)
        => utc.HasValue ? utc.Value.ToString("yyyy-MM-dd", CultureInfo.InvariantCulture) : "n/a";

    private static void ListCaptureDevices(Options options)
    {
        var store = new BlackMarketOrderStore(options.LocalOrderStatePath);
        var book = new BlackMarketOrderBook(store);
        using var capture = new BlackMarketCaptureService(book, options.CaptureDevice, options.CaptureRegion, enabled: true, log: Console.WriteLine);
        var devices = capture.ListDevices();
        if (devices.Count == 0)
        {
            Console.WriteLine("No capture device found. Install Npcap first.");
            return;
        }

        for (var index = 0; index < devices.Count; index++)
            Console.WriteLine($"[{index}] {devices[index].Name} {devices[index].Description}");
    }

    private static Task PublishLocalAsync(Options options)
    {
        var store = new BlackMarketOrderStore(options.LocalOrderStatePath);
        var book = new BlackMarketOrderBook(store);
        var orders = book.Snapshot();
        var regions = orders
            .Select(order => BlackMarketCaptureConstants.NormalizeRegion(order.Region))
            .Where(region => region is not null)
            .Distinct(StringComparer.OrdinalIgnoreCase)
            .Cast<string>()
            .ToList();

        var region = options.CaptureRegion ?? (regions.Count == 1 ? regions[0] : null);
        if (region is null)
            throw new InvalidOperationException("Specify --region us|eu|asia when local state contains zero or multiple regions.");
        if (regions.Any(other => !string.Equals(other, region, StringComparison.OrdinalIgnoreCase)))
            throw new InvalidOperationException($"Local state contains another region than '{region}'. Refusing to publish a mixed snapshot.");

        var basePath = Path.Combine(PublicDir, "data", $"bm-crafter-{region}.json");
        var projection = new BlackMarketProjectionService();
        projection.Publish(basePath, region, book);
        var freshCount = book.GetFreshBuyPrices(region).Count;
        Console.WriteLine($"Published local Black Market overlay for {region}: {freshCount} fresh item prices.");
        return Task.CompletedTask;
    }

    private static void TryOpenBrowser(string url)
    {
        try
        {
            var psi = new System.Diagnostics.ProcessStartInfo
            {
                FileName = url,
                UseShellExecute = true
            };
            System.Diagnostics.Process.Start(psi);
        }
        catch
        {
            // ignore
        }
    }

    private static async Task<(double avgPrice, double avgSoldPerDay, int daysUsed, int pointsUsed)>
        GetBmAveragesAsync(
            AlbionApiService api,
            string itemId,
            int[] spans,
            int minBmPoints,
            int historyRetries,
            int historyRetryDelayMs,
            int historySpanDelayMs)
    {
        foreach (var span in spans)
        {
            for (int attempt = 1; attempt <= 1 + historyRetries; attempt++)
            {
                var pts = await api.GetHistoryAsync(itemId, BM_LOCATION, span);
                if (pts != null && pts.Count > 0)
                {
                    var cutoff = DateTime.UtcNow.AddDays(-span);
                    var use = pts.Where(p => p.Timestamp.ToUniversalTime() >= cutoff).ToList();
                    if (use.Count >= minBmPoints)
                    {
                        var avgP = use.Average(p => (double)p.AvgPrice);
                        var avgCnt = use.Average(p => (double)p.ItemCount);
                        if (avgP > 0 && avgCnt > 0)
                            return (avgP, avgCnt, span, use.Count);
                    }
                }

                // Falls leer -> Retry mit Delay
                if (attempt <= historyRetries)
                {
                    Console.WriteLine("...");
                    if (historyRetryDelayMs > 0)
                        await Task.Delay(historyRetryDelayMs);
                }
            }

            // extra Pause zwischen Spans
            if (historySpanDelayMs > 0)
                await Task.Delay(historySpanDelayMs);
        }
        return (0, 0, 0, 0);
    }

    private static async Task<Dictionary<string, (int Price, DateTime? DateUtc)>> FetchCityPricesBatchedAsync(
        AlbionApiService api,
        List<string> allIds,
        string location,
        int maxPriceAgeDays,
        int batchSize,
        int batchDelayMs)
    {
        var result = new Dictionary<string, (int, DateTime?)>(StringComparer.OrdinalIgnoreCase);
        for (int i = 0; i < allIds.Count; i += batchSize)
        {
            var slice = allIds.Skip(i).Take(batchSize).ToList();
            var part = await api.GetSellPriceMinBulkAsync(slice, location, maxPriceAgeDays);
            foreach (var kv in part)
                result[kv.Key] = kv.Value;

            var more = i + batchSize < allIds.Count;
            if (more && batchDelayMs > 0)
                await Task.Delay(batchDelayMs);
        }
        return result;
    }

    private static void ExportResultsToJs(IEnumerable<ResultRow> winners, string path)
    {
        try
        {
            var dir = Path.GetDirectoryName(path);
            if (!string.IsNullOrWhiteSpace(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            var payload = winners.Select(w => new object[]
            {
                w.City,
                w.ItemId,
                w.CityBuyPrice,
                Math.Round(w.BmAvgPrice),
                Math.Round(w.BmSoldPerDay, 1),
                Math.Round(w.ProfitPercent, 1),
                $"{w.DaysUsed}d"
            }).ToList();

            var json = JsonSerializer.Serialize(payload);
            File.WriteAllText(path, $"window.results = {json};");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"WARN: results.js konnte nicht geschrieben werden: {ex.Message}");
        }
    }

    private static readonly object _progressLock = new();
    private static void UpdateProgress(int total, int done)
    {
        try
        {
            var dir = Path.GetDirectoryName(ProgressPath);
            if (!string.IsNullOrWhiteSpace(dir) && !Directory.Exists(dir))
                Directory.CreateDirectory(dir);

            var payload = JsonSerializer.Serialize(new { total, done, ts = DateTime.UtcNow });
            lock (_progressLock)
            {
                File.WriteAllText(ProgressPath, payload);
            }
        }
        catch
        {
            // leise ignorieren
        }
    }
}
