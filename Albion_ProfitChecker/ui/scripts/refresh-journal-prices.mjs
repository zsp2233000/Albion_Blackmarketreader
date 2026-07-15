import fs from "node:fs/promises";
import path from "node:path";

// Fetches empty/full crafting-journal ("book") prices per city, per region, from the Albion
// Online Data Project. Output feeds the journal-profit feature in the BM Crafter and Crafting
// Calculator. Mirrors the fetch/retry conventions of refresh-crafting-data.mjs.

const REGIONS = {
  us: "west",
  eu: "europe",
  asia: "east"
};

const CITIES = ["Lymhurst", "Martlock", "Fort Sterling", "Thetford", "Bridgewatch", "Caerleon", "Brecilien"];
const TIERS = [4, 5, 6, 7, 8];
const PROFESSIONS = ["WARRIOR", "HUNTER", "MAGE", "TOOLMAKER"];
const STATES = ["EMPTY", "FULL"];

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

function buildJournalIds() {
  const ids = [];
  for (const tier of TIERS) {
    for (const prof of PROFESSIONS) {
      for (const state of STATES) ids.push(`T${tier}_JOURNAL_${prof}_${state}`);
    }
  }
  return ids;
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
    if (!current || (isFresh && !current.isFresh)) {
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

function pricesByCity(itemId, priceMap) {
  const prices = {};
  for (const city of CITIES) {
    const price = Number(priceMap.get(`${itemId}::${city}`)?.price || 0);
    if (price > 0) prices[city] = price;
  }
  return prices;
}

function buildPayload(region, priceMap) {
  const journals = {};
  for (const prof of PROFESSIONS) {
    const key = prof.toLowerCase();
    journals[key] = {};
    for (const tier of TIERS) {
      journals[key][tier] = {
        empty: pricesByCity(`T${tier}_JOURNAL_${prof}_EMPTY`, priceMap),
        full: pricesByCity(`T${tier}_JOURNAL_${prof}_FULL`, priceMap)
      };
    }
  }
  return {
    generatedAt: new Date().toISOString(),
    region,
    cities: CITIES,
    tiers: TIERS,
    professions: PROFESSIONS.map((p) => p.toLowerCase()),
    journals
  };
}

async function writeJson(filename, payload) {
  await fs.writeFile(path.join(publicDataDir, filename), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function refreshRegion(region) {
  const host = REGIONS[region];
  const ids = buildJournalIds();
  console.log(`[${region}] fetching ${ids.length} journal prices across ${CITIES.length} cities…`);
  const priceMap = await fetchAllPrices(host, ids, CITIES);
  await writeJson(`journals-${region}.json`, buildPayload(region, priceMap));
  console.log(`[${region}] wrote journals-${region}.json (${priceMap.size} priced entries)`);
}

async function main() {
  const requested = process.argv.slice(2).map((r) => r.toLowerCase());
  const invalidRegions = requested.filter((region) => !(region in REGIONS));
  if (invalidRegions.length) throw new Error(`unknown region: ${invalidRegions.join(", ")}`);
  const regions = requested.length ? requested : Object.keys(REGIONS);
  for (const region of regions) {
    await refreshRegion(region);
    if (region !== regions[regions.length - 1]) await sleep(REGION_DELAY_MS);
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
