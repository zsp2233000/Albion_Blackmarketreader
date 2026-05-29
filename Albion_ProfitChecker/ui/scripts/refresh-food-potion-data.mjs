import fs from "node:fs/promises";
import path from "node:path";

/**
 * Refreshes Food & Potion price data from the Albion Online Data Project.
 * Reads item IDs from the bundled recipe/ingredient JSON and writes per-city price files
 * consumed by src/features/food-potion-crafter/data (consumable-ingredient-prices-*, {category}-prices-*).
 *
 * Usage:
 *   node scripts/refresh-food-potion-data.mjs          # both regions
 *   node scripts/refresh-food-potion-data.mjs eu       # EU only
 *   node scripts/refresh-food-potion-data.mjs us       # US only
 */

const REGIONS = {
  us: "west",
  eu: "europe",
};

const CITIES = ["Lymhurst", "Martlock", "Fort Sterling", "Thetford", "Bridgewatch", "Caerleon", "Brecilien"];
const MAX_PRICE_AGE_DAYS = 30;
const BATCH_SIZE = 40;
const BATCH_DELAY_MS = 250;
const MAX_RETRIES = 5;
const SINGLE_ITEM_RETRIES = 4;
const SINGLE_ITEM_DELAY_MS = 15000;
const REGION_DELAY_MS = 20000;

const rootDir = process.cwd();
const publicDataDir = path.join(rootDir, "public", "data");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseApiDate(raw) {
  const date = new Date(String(raw || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function readJson(file) {
  const raw = await fs.readFile(path.join(publicDataDir, file), "utf8");
  return JSON.parse(raw);
}

async function fetchPriceBatch(host, itemIds, cities) {
  const url = `https://${host}.albion-online-data.com/api/v2/stats/prices/${itemIds.map(encodeURIComponent).join(",")}.json?locations=${encodeURIComponent(cities.join(","))}`;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, { headers: { "accept-encoding": "gzip" } });
    if (response.ok) return response.json();
    if (response.status === 429 && attempt < MAX_RETRIES) {
      const retryAfter = Number(response.headers.get("retry-after") || 0);
      const delayMs = retryAfter > 0 ? retryAfter * 1000 : Math.min(8000, 1000 * (attempt + 1));
      await sleep(delayMs);
      continue;
    }
    throw new Error(`price request failed: ${response.status} ${response.statusText}`);
  }
  throw new Error("price request failed after retries");
}

function pickBestPrices(rows) {
  const best = new Map();
  const ageLimit = new Date(Date.now() - MAX_PRICE_AGE_DAYS * 24 * 60 * 60 * 1000);

  for (const row of rows) {
    const itemId = String(row.item_id || "").trim();
    const city = String(row.city || "").trim();
    const price = Number(row.sell_price_min || 0);
    if (!itemId || !city || !Number.isFinite(price) || price <= 0) continue;

    const date = parseApiDate(row.sell_price_min_date);
    const isFresh = date && date >= ageLimit;
    const key = `${itemId}::${city}`;
    const current = best.get(key);

    if (!current) {
      best.set(key, { price, date, isFresh });
      continue;
    }
    if (isFresh && !current.isFresh) {
      best.set(key, { price, date, isFresh });
      continue;
    }
    if (isFresh === current.isFresh) {
      const currentTime = current.date ? current.date.getTime() : 0;
      const nextTime = date ? date.getTime() : 0;
      if (nextTime >= currentTime) best.set(key, { price, date, isFresh });
    }
  }
  return best;
}

async function fetchBatchWithFallback(host, itemIds, cities, singleItemAttempt = 0) {
  try {
    return await fetchPriceBatch(host, itemIds, cities);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!message.includes("429")) throw error;

    if (itemIds.length <= 1) {
      if (singleItemAttempt >= SINGLE_ITEM_RETRIES) throw error;
      await sleep(SINGLE_ITEM_DELAY_MS * (singleItemAttempt + 1));
      return fetchBatchWithFallback(host, itemIds, cities, singleItemAttempt + 1);
    }

    const midpoint = Math.ceil(itemIds.length / 2);
    const firstRows = await fetchBatchWithFallback(host, itemIds.slice(0, midpoint), cities);
    await sleep(BATCH_DELAY_MS);
    const secondRows = await fetchBatchWithFallback(host, itemIds.slice(midpoint), cities);
    return [...firstRows, ...secondRows];
  }
}

async function fetchAllPrices(host, itemIds, cities) {
  const best = new Map();
  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    const batch = itemIds.slice(i, i + BATCH_SIZE);
    const rows = await fetchBatchWithFallback(host, batch, cities);
    for (const [key, value] of pickBestPrices(rows)) best.set(key, value);
    if (i + BATCH_SIZE < itemIds.length) await sleep(BATCH_DELAY_MS);
  }
  return best;
}

function buildPricesPayload(region, itemIds, priceMap) {
  const items = itemIds.map((itemId) => {
    const tierMatch = itemId.match(/^T(\d+)_/);
    const prices = Object.fromEntries(
      CITIES.map((city) => [city, Number(priceMap.get(`${itemId}::${city}`)?.price || 0)]).filter(([, value]) => value > 0)
    );
    return { itemId, tier: tierMatch ? Number(tierMatch[1]) : 0, prices };
  });
  return { generatedAt: new Date().toISOString(), region, cities: CITIES, count: items.length, items };
}

async function loadItemIds() {
  const [foodDoc, potionDoc, ingredientsDoc] = await Promise.all([
    readJson("recipes-food.json"),
    readJson("recipes-potions.json"),
    readJson("consumable-ingredients.json"),
  ]);
  const foodIds = [...new Set((foodDoc.recipes || []).map((r) => r.itemId).filter(Boolean))];
  const potionIds = [...new Set((potionDoc.recipes || []).map((r) => r.itemId).filter(Boolean))];
  const ingredientIds = [...new Set((ingredientsDoc.ingredients || []).map((i) => i.itemId).filter(Boolean))];
  return { foodIds, potionIds, ingredientIds };
}

async function refreshRegion(region, ids) {
  const host = REGIONS[region];
  if (!host) throw new Error(`unknown region: ${region}`);

  console.log(`[${region}] fetching ${ids.ingredientIds.length} ingredients + ${ids.foodIds.length} food + ${ids.potionIds.length} potions...`);

  const ingredientPrices = await fetchAllPrices(host, ids.ingredientIds, CITIES);
  await sleep(BATCH_DELAY_MS);
  const foodPrices = await fetchAllPrices(host, ids.foodIds, CITIES);
  await sleep(BATCH_DELAY_MS);
  const potionPrices = await fetchAllPrices(host, ids.potionIds, CITIES);

  await fs.writeFile(
    path.join(publicDataDir, `consumable-ingredient-prices-${region}.json`),
    JSON.stringify(buildPricesPayload(region, ids.ingredientIds, ingredientPrices), null, 2)
  );
  await fs.writeFile(
    path.join(publicDataDir, `food-prices-${region}.json`),
    JSON.stringify(buildPricesPayload(region, ids.foodIds, foodPrices), null, 2)
  );
  await fs.writeFile(
    path.join(publicDataDir, `potion-prices-${region}.json`),
    JSON.stringify(buildPricesPayload(region, ids.potionIds, potionPrices), null, 2)
  );

  console.log(`[${region}] wrote consumable-ingredient-prices, food-prices, potion-prices.`);
}

async function main() {
  const arg = String(process.argv[2] || "").toLowerCase();
  const regions = arg === "us" || arg === "eu" ? [arg] : ["eu", "us"];
  const ids = await loadItemIds();

  for (let i = 0; i < regions.length; i += 1) {
    await refreshRegion(regions[i], ids);
    if (i < regions.length - 1) await sleep(REGION_DELAY_MS);
  }
  console.log("Food & Potion price refresh complete.");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
