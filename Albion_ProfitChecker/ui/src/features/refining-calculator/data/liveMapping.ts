import type { RefineVariant } from "../core";
import { DEFAULT_PRICE_BY_ITEM_ID } from "./refiningData";

type CityPriceMap = Record<string, number | undefined>;

type LiveMaterialEntry = {
  itemId?: string;
  prices?: CityPriceMap;
  price?: number;
};

type LiveMaterialsPayload = {
  generatedAt?: string;
  items?: LiveMaterialEntry[];
};

export type RefiningLiveSnapshot = {
  generatedAt: string | null;
  priceByItemId: Record<string, number>;
  missingRawItemIds: string[];
};

function resolvePriceByCity(entry: LiveMaterialEntry | undefined, selectedCity: string): number {
  if (!entry) return 0;
  if (entry.prices && typeof entry.prices === "object") {
    const cityPrice = Number(entry.prices[selectedCity] || 0);
    return cityPrice > 0 ? cityPrice : 0;
  }
  const single = Number(entry.price || 0);
  return single > 0 ? single : 0;
}

function indexById(payloads: ReadonlyArray<LiveMaterialsPayload>): Map<string, LiveMaterialEntry> {
  const map = new Map<string, LiveMaterialEntry>();
  payloads.forEach((payload) => {
    const items = Array.isArray(payload.items) ? payload.items : [];
    items.forEach((entry) => {
      if (entry.itemId) map.set(entry.itemId, entry);
    });
  });
  return map;
}

export function buildRefiningLiveSnapshot(
  refinedPayload: LiveMaterialsPayload,
  rawPayload: LiveMaterialsPayload,
  variants: ReadonlyArray<RefineVariant>,
  selectedBuyCity: string,
  selectedSellCity: string,
): RefiningLiveSnapshot {
  const refinedIndex = indexById([refinedPayload]);
  const rawIndex = indexById([rawPayload]);
  const priceByItemId: Record<string, number> = { ...DEFAULT_PRICE_BY_ITEM_ID };
  const missingRaw = new Set<string>();

  variants.forEach((variant) => {
    const sellPrice = resolvePriceByCity(refinedIndex.get(variant.itemId), selectedSellCity);
    if (sellPrice > 0) priceByItemId[variant.itemId] = sellPrice;

    variant.ingredients.forEach((ingredient) => {
      const source = ingredient.kind === "raw" ? rawIndex : refinedIndex;
      const livePrice = resolvePriceByCity(source.get(ingredient.itemId), selectedBuyCity);
      if (livePrice > 0) {
        priceByItemId[ingredient.itemId] = livePrice;
      } else if (ingredient.kind === "raw") {
        missingRaw.add(ingredient.itemId);
      }
    });
  });

  return {
    generatedAt: typeof rawPayload.generatedAt === "string"
      ? rawPayload.generatedAt
      : typeof refinedPayload.generatedAt === "string"
        ? refinedPayload.generatedAt
        : null,
    priceByItemId,
    missingRawItemIds: Array.from(missingRaw),
  };
}
