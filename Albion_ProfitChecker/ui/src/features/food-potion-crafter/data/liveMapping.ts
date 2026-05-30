import { normalizeCityPricePayload, normalizeSoldPayload, readGeneratedAt } from "./normalizers";

export type ConsumablePriceSnapshot = {
  priceByItemId: Record<string, number>;
  soldByItemId: Record<string, number>;
  generatedAt: string | null;
};

function applyCityPrices(
  target: Record<string, number>,
  map: Map<string, Record<string, number>>,
  city: string,
): void {
  for (const [itemId, prices] of map) {
    const price = prices[city];
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      target[itemId] = price;
    }
  }
}

/**
 * Resolve ingredient prices at the buy city and output prices at the sell city into one
 * flat itemId -> price map. Tolerant of missing / malformed payloads; never throws.
 */
export function buildConsumablePriceSnapshot(
  ingredientPayload: unknown,
  outputPayload: unknown,
  buyCity: string,
  sellCity: string,
): ConsumablePriceSnapshot {
  const ingredientMap = normalizeCityPricePayload(ingredientPayload);
  const outputMap = normalizeCityPricePayload(outputPayload);

  const priceByItemId: Record<string, number> = {};
  applyCityPrices(priceByItemId, ingredientMap, buyCity);
  applyCityPrices(priceByItemId, outputMap, sellCity);

  const soldByItemId: Record<string, number> = {};
  for (const [itemId, sold] of normalizeSoldPayload(outputPayload)) {
    soldByItemId[itemId] = sold;
  }

  return {
    priceByItemId,
    soldByItemId,
    generatedAt: readGeneratedAt(outputPayload) ?? readGeneratedAt(ingredientPayload),
  };
}
