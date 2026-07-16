import fs from "node:fs/promises";
import path from "node:path";

const REGIONS = {
  us: "west",
  eu: "europe",
  asia: "east"
};

const CITIES = ["Lymhurst", "Martlock", "Fort Sterling", "Thetford", "Bridgewatch", "Caerleon", "Brecilien"];
const TIERS = [4, 5, 6, 7, 8];
const ENCHANTS = [0, 1, 2, 3, 4];
const MATERIAL_BASES = new Set(["METALBAR", "PLANKS", "CLOTH", "LEATHER", "STONEBLOCK"]);
const MAX_PRICE_AGE_DAYS = 30;
const BATCH_SIZE = 40;
const BATCH_DELAY_MS = 250;
const MAX_RETRIES = 5;
const SINGLE_ITEM_RETRIES = 4;
const SINGLE_ITEM_DELAY_MS = 15000;
const REGION_DELAY_MS = 20000;

const rootDir = process.cwd();
const publicDataDir = path.join(rootDir, "public", "data");
const publicDir = path.join(rootDir, "public");
const recipesPath = path.join(rootDir, "public", "items-categorized-crafting.json");

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeMaterialBase(raw) {
  return String(raw || "")
    .trim()
    .toUpperCase()
    .replace(/\s+/g, "_")
    .replace(/^T\d+_/, "")
    .replace(/^T\d+/, "");
}

function buildMaterialItemId(base, tier, enchant) {
  if (base === "STONEBLOCK") return `T${tier}_STONEBLOCK`;
  if (enchant > 0) return `T${tier}_${base}_LEVEL${enchant}@${enchant}`;
  return `T${tier}_${base}`;
}

function buildCraftedItemId(baseId, tier, enchant) {
  return enchant > 0 ? `T${tier}_${baseId}@${enchant}` : `T${tier}_${baseId}`;
}

function buildSpecialComponentId(componentId, tier) {
  return `T${tier}_${componentId}`;
}

function parseApiDate(raw) {
  const date = new Date(String(raw || ""));
  return Number.isNaN(date.getTime()) ? null : date;
}

async function fetchPriceBatch(host, itemIds, cities) {
  const url = `https://${host}.albion-online-data.com/api/v2/stats/prices/${itemIds.map(encodeURIComponent).join(",")}.json?locations=${encodeURIComponent(cities.join(","))}`;
  for (let attempt = 0; attempt <= MAX_RETRIES; attempt += 1) {
    const response = await fetch(url, {
      headers: {
        "accept-encoding": "gzip"
      }
    });

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
    const isRateLimited = message.includes("429");
    if (!isRateLimited) throw error;

    if (itemIds.length <= 1) {
      if (singleItemAttempt >= SINGLE_ITEM_RETRIES) throw error;
      await sleep(SINGLE_ITEM_DELAY_MS * (singleItemAttempt + 1));
      return fetchBatchWithFallback(host, itemIds, cities, singleItemAttempt + 1);
    }

    const midpoint = Math.ceil(itemIds.length / 2);
    const firstHalf = itemIds.slice(0, midpoint);
    const secondHalf = itemIds.slice(midpoint);
    const firstRows = await fetchBatchWithFallback(host, firstHalf, cities);
    await sleep(BATCH_DELAY_MS);
    const secondRows = await fetchBatchWithFallback(host, secondHalf, cities);
    return [...firstRows, ...secondRows];
  }
}

async function fetchAllPrices(host, itemIds, cities) {
  const best = new Map();

  for (let i = 0; i < itemIds.length; i += BATCH_SIZE) {
    const batch = itemIds.slice(i, i + BATCH_SIZE);
    const rows = await fetchBatchWithFallback(host, batch, cities);
    const batchBest = pickBestPrices(rows);
    for (const [key, value] of batchBest) best.set(key, value);

    const hasMore = i + BATCH_SIZE < itemIds.length;
    if (hasMore) await sleep(BATCH_DELAY_MS);
  }

  return best;
}

function buildMaterialsCitiesPayload(region, itemIds, priceMap) {
  const items = itemIds.map((itemId) => {
    const tierMatch = itemId.match(/^T(\d+)_/);
    const enchantMatch = itemId.match(/@(\d+)$/);
    const prices = Object.fromEntries(
      CITIES.map((city) => [city, Number(priceMap.get(`${itemId}::${city}`)?.price || 0)])
    );

    return {
      itemId,
      tier: tierMatch ? Number(tierMatch[1]) : 0,
      enchant: enchantMatch ? Number(enchantMatch[1]) : 0,
      prices
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    region,
    cities: CITIES,
    count: items.length,
    items
  };
}

function buildMaterialsAnyPayload(region, itemIds, priceMap) {
  const items = itemIds.map((itemId) => {
    const tierMatch = itemId.match(/^T(\d+)_/);
    const enchantMatch = itemId.match(/@(\d+)$/);
    let bestCity = "ANY";
    let bestPrice = 0;

    for (const city of CITIES) {
      const price = Number(priceMap.get(`${itemId}::${city}`)?.price || 0);
      if (price > 0 && (!bestPrice || price < bestPrice)) {
        bestPrice = price;
        bestCity = city;
      }
    }

    return {
      itemId,
      tier: tierMatch ? Number(tierMatch[1]) : 0,
      enchant: enchantMatch ? Number(enchantMatch[1]) : 0,
      city: bestCity,
      price: bestPrice
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    region,
    city: "ANY",
    count: items.length,
    items
  };
}

function buildArtefactsPayload(region, itemIds, priceMap) {
  const items = [];

  for (const itemId of itemIds) {
    let emitted = false;
    for (const city of CITIES) {
      const price = Number(priceMap.get(`${itemId}::${city}`)?.price || 0);
      if (price <= 0) continue;
      items.push({ itemId, city, price });
      emitted = true;
    }

    if (!emitted) items.push({ itemId, price: 0 });
  }

  return {
    generatedAt: new Date().toISOString(),
    region,
    city: "ANY",
    count: items.length,
    items
  };
}

function buildCraftingResultsPayload(region, itemIds, priceMap) {
  const items = itemIds.map((itemId) => {
    const tierMatch = itemId.match(/^T(\d+)_/);
    const baseMatch = itemId.match(/^T\d+_([^@]+)/);
    const enchantMatch = itemId.match(/@(\d+)$/);
    const prices = Object.fromEntries(
      CITIES.map((city) => [city, Number(priceMap.get(`${itemId}::${city}`)?.price || 0)])
    );

    return {
      itemId,
      baseId: baseMatch ? baseMatch[1] : itemId,
      tier: tierMatch ? Number(tierMatch[1]) : 0,
      enchant: enchantMatch ? Number(enchantMatch[1]) : 0,
      prices
    };
  });

  return {
    generatedAt: new Date().toISOString(),
    region,
    cities: CITIES,
    tiers: TIERS,
    enchants: ENCHANTS,
    count: items.length,
    items
  };
}

function buildLegacyCraftingRows(itemIds, priceMap) {
  const rows = [];

  for (const itemId of itemIds) {
    const tierMatch = itemId.match(/^T(\d+)_/);
    const enchantMatch = itemId.match(/@(\d+)$/);
    const tier = tierMatch ? Number(tierMatch[1]) : 0;
    const enchant = enchantMatch ? Number(enchantMatch[1]) : 0;

    for (const city of CITIES) {
      rows.push({
        city,
        id: itemId,
        price: Number(priceMap.get(`${itemId}::${city}`)?.price || 0),
        tier,
        enchant
      });
    }
  }

  return rows;
}

async function loadRecipeIds() {
  const payload = JSON.parse(await fs.readFile(recipesPath, "utf8"));
  const categories = Array.isArray(payload?.categories) ? payload.categories : [];
  const items = categories.flatMap((category) => Array.isArray(category?.items) ? category.items : []);

  const craftedBaseIds = new Set();
  const materialBaseIds = new Set();
  const specialComponentBaseIds = new Set();

  for (const item of items) {
    if (item?.id) craftedBaseIds.add(String(item.id).trim());

    const materials = Array.isArray(item?.materials) ? item.materials : [];
    for (const material of materials) {
      const raw = material?.itemId || material?.id || material?.name;
      const base = normalizeMaterialBase(raw);
      if (MATERIAL_BASES.has(base)) materialBaseIds.add(base);
    }

    if (item?.artifactId) specialComponentBaseIds.add(String(item.artifactId).trim());
  }

  return {
    craftedIds: [...craftedBaseIds],
    materialBases: [...materialBaseIds],
    specialBases: [...specialComponentBaseIds]
  };
}

async function writeJson(filename, payload) {
  await fs.mkdir(publicDataDir, { recursive: true });
  await fs.writeFile(path.join(publicDataDir, filename), `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

async function writeLegacyResults(region, itemIds, priceMap) {
  await fs.mkdir(publicDir, { recursive: true });
  const payload = buildLegacyCraftingRows(itemIds, priceMap);
  const filename = `results-crafting-${region}.js`;
  await fs.writeFile(path.join(publicDir, filename), `window.resultsCrafting = ${JSON.stringify(payload)};\n`, "utf8");
}

async function refreshRegion(region) {
  const host = REGIONS[region];
  if (!host) throw new Error(`unknown region: ${region}`);

  const { craftedIds, materialBases, specialBases } = await loadRecipeIds();

  const materialItemIds = [];
  for (const base of materialBases) {
    for (const tier of TIERS) {
      if (base === "STONEBLOCK") {
        materialItemIds.push(`T${tier}_STONEBLOCK`);
        continue;
      }
      for (const enchant of ENCHANTS) {
        materialItemIds.push(buildMaterialItemId(base, tier, enchant));
      }
    }
  }

  const specialItemIds = [];
  for (const base of specialBases) {
    for (const tier of TIERS) {
      specialItemIds.push(buildSpecialComponentId(base, tier));
    }
  }

  const craftedItemIds = [];
  for (const base of craftedIds) {
    for (const tier of TIERS) {
      for (const enchant of ENCHANTS) {
        craftedItemIds.push(buildCraftedItemId(base, tier, enchant));
      }
    }
  }

  console.log(`[${region}] fetching material prices for ${materialItemIds.length} ids`);
  const materialPrices = await fetchAllPrices(host, materialItemIds, CITIES);
  console.log(`[${region}] fetching special component prices for ${specialItemIds.length} ids`);
  const specialPrices = await fetchAllPrices(host, specialItemIds, CITIES);
  console.log(`[${region}] fetching crafted item prices for ${craftedItemIds.length} ids`);
  const craftedPrices = await fetchAllPrices(host, craftedItemIds, CITIES);

  await writeJson(`materials-cities-${region}.json`, buildMaterialsCitiesPayload(region, materialItemIds, materialPrices));
  await writeJson(`materials-${region}.json`, buildMaterialsAnyPayload(region, materialItemIds, materialPrices));
  await writeJson(`artefacts-${region}.json`, buildArtefactsPayload(region, specialItemIds, specialPrices));
  await writeJson(`crafting-results-${region}.json`, buildCraftingResultsPayload(region, craftedItemIds, craftedPrices));
  await writeLegacyResults(region, craftedItemIds, craftedPrices);

  console.log(`[${region}] refresh complete`);
}

const requested = process.argv.slice(2);
const invalidRegions = requested.filter((region) => !(region in REGIONS));
if (invalidRegions.length) throw new Error(`unknown region: ${invalidRegions.join(", ")}`);
const regions = requested.length ? requested : Object.keys(REGIONS);

for (const region of regions) {
  await refreshRegion(region);
  const hasMore = region !== regions[regions.length - 1];
  if (hasMore) await sleep(REGION_DELAY_MS);
}
