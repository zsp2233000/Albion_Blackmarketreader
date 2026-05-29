export * from "./recipes";
export * from "./paths";
export * from "./normalizers";
export * from "./liveMapping";

/** Flatten a per-city price map into a single PriceMap-shaped Map<itemId, price> for one city. */
export function flattenPricesForCity(map: Map<string, Record<string, number>>, city: string): Map<string, number> {
  const flat = new Map<string, number>();
  for (const [itemId, prices] of map) {
    const price = prices[city];
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      flat.set(itemId, price);
    }
  }
  return flat;
}
