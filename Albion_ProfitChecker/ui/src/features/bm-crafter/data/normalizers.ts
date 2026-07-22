import type { BmMarketItem, BmRecipe, MarketRegion, BmMarketSource } from "../domain";
import type { BmCrafterMarketData, BmCrafterPriceData, BmCrafterRecipesData, PriceEntry } from "./types";
import { normalizeRegion as normalizeSharedRegion } from "@shared/region/regions";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function normalizeRegion(raw: unknown, fallback: MarketRegion): MarketRegion {
  return normalizeSharedRegion(raw) ?? fallback;
}

function normalizeSource(value: unknown): BmMarketSource {
  return value === "local" ? "local" : "api";
}

function normalizeObservedAt(value: unknown, fallback: string | null): string | null {
  return typeof value === "string" && value.trim() ? value : fallback;
}

function normalizeMarketItem(entry: unknown, generatedAt: string | null): BmMarketItem | null {
  if (Array.isArray(entry)) {
    const id = String(entry[0] || "").trim();
    if (!id) return null;
    return {
      id,
      bm: toFiniteNumber(entry[1]),
      sold: toFiniteNumber(entry[2]),
      source: "api",
      observedAt: generatedAt
    };
  }

  if (!isRecord(entry)) return null;
  const id = String(entry.id || "").trim();
  if (!id) return null;
  const normalized: BmMarketItem = {
    id,
    bm: toFiniteNumber(entry.bm),
    sold: toFiniteNumber(entry.sold),
    source: normalizeSource(entry.source),
    observedAt: normalizeObservedAt(entry.observedAt, generatedAt)
  };
  return normalized;
}

export function normalizeMarketPayload(payload: unknown, fallbackRegion: MarketRegion): BmCrafterMarketData {
  const root = isRecord(payload) ? payload : {};
  const list = Array.isArray(root.items) ? root.items : [];
  const generatedAt = typeof root.generatedAt === "string" ? root.generatedAt : null;

  const byItemId = new Map<string, BmMarketItem>();
  for (const entry of list) {
    const item = normalizeMarketItem(entry, generatedAt);
    if (!item) continue;
    const current = byItemId.get(item.id);
    if (!current) {
      byItemId.set(item.id, item);
      continue;
    }

    const currentBm = current.bm ?? -Infinity;
    const nextBm = item.bm ?? -Infinity;
    if (nextBm > currentBm) {
      byItemId.set(item.id, item);
      continue;
    }

    if (nextBm === currentBm) {
      const currentSold = current.sold ?? -Infinity;
      const nextSold = item.sold ?? -Infinity;
      if (nextSold > currentSold) {
        byItemId.set(item.id, item);
        continue;
      }

      if (nextSold === currentSold && item.source === "local" && current.source !== "local") {
        byItemId.set(item.id, item);
      }
    }
  }

  return {
    region: normalizeRegion(root.region, fallbackRegion),
    generatedAt,
    items: Array.from(byItemId.values())
  };
}

export function normalizePricePayload(payload: unknown, fallbackRegion: MarketRegion): BmCrafterPriceData {
  const root = isRecord(payload) ? payload : {};
  const list = Array.isArray(root.items) ? root.items : [];
  const items: PriceEntry[] = [];
  const byItemId = new Map<string, number>();

  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const itemId = String(entry.itemId || "").trim();
    const price = toFiniteNumber(entry.price);
    if (!itemId || !Number.isFinite(price)) continue;
    const city = typeof entry.city === "string" ? entry.city : undefined;
    items.push({ itemId, price: price as number, city });
    byItemId.set(itemId, price as number);
  }

  return {
    region: normalizeRegion(root.region, fallbackRegion),
    generatedAt: typeof root.generatedAt === "string" ? root.generatedAt : null,
    items,
    byItemId
  };
}

function normalizeRecipeItem(entry: unknown): BmRecipe | null {
  if (!isRecord(entry)) return null;
  const itemId = String(entry.id || "").trim();
  if (!itemId) return null;

  const rawMaterials = Array.isArray(entry.materials) ? entry.materials : [];
  const materials = rawMaterials
    .map((mat): BmRecipe["materials"][number] | null => {
      if (!isRecord(mat)) return null;
      const materialId = String(mat.itemId || mat.name || "").trim();
      const qty = toFiniteNumber(mat.qty);
      if (!materialId || !Number.isFinite(qty)) return null;
      return { itemId: materialId, qty: qty as number };
    })
    .filter((v): v is BmRecipe["materials"][number] => Boolean(v));

  if (!materials.length) return null;

  const artifactId =
    typeof entry.artifactId === "string" && entry.artifactId.trim()
      ? entry.artifactId.trim()
      : null;

  const recipe: BmRecipe = {
    itemId,
    name: typeof entry.name === "string" ? entry.name : undefined,
    materials,
    artifactId,
    artifact: typeof entry.artifact === "string" ? entry.artifact : undefined
  };

  return recipe;
}

export function normalizeCityMaterialsPayload(payload: unknown): Map<string, Record<string, number>> {
  const root = isRecord(payload) ? payload : {};
  const list = Array.isArray(root.items) ? root.items : [];
  const map = new Map<string, Record<string, number>>();

  for (const entry of list) {
    if (!isRecord(entry)) continue;
    const itemId = String(entry.itemId || "").trim();
    if (!itemId || !isRecord(entry.prices)) continue;
    const prices: Record<string, number> = {};
    for (const [city, val] of Object.entries(entry.prices)) {
      const price = toFiniteNumber(val);
      if (price !== null) prices[city] = price;
    }
    if (Object.keys(prices).length) map.set(itemId, prices);
  }

  return map;
}

export function normalizeRecipesPayload(payload: unknown): BmCrafterRecipesData {
  const root = isRecord(payload) ? payload : {};
  const categories = Array.isArray(root.categories) ? root.categories : [];

  const items: BmRecipe[] = [];
  const byItemId = new Map<string, BmRecipe>();

  for (const category of categories) {
    if (!isRecord(category)) continue;
    const categoryKey = typeof category.key === "string" ? category.key : typeof category.name === "string" ? category.name : undefined;
    const list = Array.isArray(category.items) ? category.items : [];
    for (const entry of list) {
      const recipe = normalizeRecipeItem(entry);
      if (!recipe) continue;
      if (categoryKey) recipe.categoryKey = categoryKey;
      items.push(recipe);
      if (!byItemId.has(recipe.itemId)) {
        byItemId.set(recipe.itemId, recipe);
      }
    }
  }

  return {
    generatedAt: null,
    items,
    byItemId
  };
}
