import fs from "node:fs/promises";
import path from "node:path";

const REGIONS = { us: "west", eu: "europe", asia: "east" };
const MATERIALS = ["ORE", "WOOD", "FIBER", "HIDE", "ROCK"];
const TIERS = [2, 3, 4, 5, 6, 7, 8];
const ENCHANTS = [0, 1, 2, 3, 4];
const CITIES = ["Lymhurst", "Caerleon", "Bridgewatch", "Martlock", "Fort Sterling", "Thetford", "Brecilien"];
const CHUNK_SIZE = 50;
const DELAY_MS = 1400;
const RETRIES = 3;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function buildItemIds() {
  return MATERIALS.flatMap((material) => TIERS.flatMap((tier) => ENCHANTS
    .filter((enchant) => tier >= 4 || enchant === 0)
    .map((enchant) => enchant > 0 ? `T${tier}_${material}_LEVEL${enchant}@${enchant}` : `T${tier}_${material}`)));
}

async function fetchChunk(host, itemIds) {
  const locations = encodeURIComponent(CITIES.join(","));
  const url = `https://${host}.albion-online-data.com/api/v2/stats/prices/${itemIds.join(",")}.json?locations=${locations}`;
  let lastError;
  for (let attempt = 1; attempt <= RETRIES; attempt += 1) {
    try {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const data = await response.json();
      if (!Array.isArray(data)) throw new Error("response is not an array");
      return data;
    } catch (error) {
      lastError = error;
      if (attempt < RETRIES) await sleep(attempt * DELAY_MS);
    }
  }
  throw new Error(`Failed raw material request after ${RETRIES} attempts: ${lastError?.message ?? "unknown error"}`);
}

function buildPriceMap(rows) {
  return rows.reduce((prices, row) => {
    const itemId = typeof row?.item_id === "string" ? row.item_id : "";
    const city = typeof row?.city === "string" && CITIES.includes(row.city) ? row.city : "";
    const price = Number(row?.sell_price_min || 0);
    if (!itemId || !city || !Number.isFinite(price) || price <= 0) return prices;
    const current = prices.get(itemId) ?? new Map();
    const previous = current.get(city);
    const nextCityPrices = previous && previous <= price ? current : new Map(current).set(city, price);
    return new Map(prices).set(itemId, nextCityPrices);
  }, new Map());
}

function parseMeta(itemId) {
  return {
    tier: Number(itemId.match(/^T(\d+)_/)?.[1] ?? 0),
    enchant: Number(itemId.match(/@(\d+)/)?.[1] ?? 0)
  };
}

async function main() {
  const region = String(process.argv[2] || "").toLowerCase();
  if (!(region in REGIONS)) throw new Error(`unknown region: ${region || "<missing>"}`);
  const itemIds = buildItemIds();
  const rows = [];
  for (let index = 0; index < itemIds.length; index += CHUNK_SIZE) {
    rows.push(...await fetchChunk(REGIONS[region], itemIds.slice(index, index + CHUNK_SIZE)));
    if (index + CHUNK_SIZE < itemIds.length) await sleep(DELAY_MS);
  }
  const priceMap = buildPriceMap(rows);
  if (priceMap.size === 0) throw new Error(`No positive raw material prices returned for ${region}`);
  const items = itemIds.map((itemId) => ({
    itemId,
    ...parseMeta(itemId),
    prices: Object.fromEntries(CITIES.map((city) => [city, priceMap.get(itemId)?.get(city) ?? 0]))
  }));
  const payload = { generatedAt: new Date().toISOString(), region, cities: CITIES, count: items.length, items };
  const outputDir = path.join("public", "data");
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, `raw-materials-cities-${region}.json`), JSON.stringify(payload));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
