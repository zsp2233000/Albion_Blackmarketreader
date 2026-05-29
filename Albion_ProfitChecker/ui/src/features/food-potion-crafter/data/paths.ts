import type { ConsumableCategory, MarketRegion } from "../core";

/** Per-region manual/live ingredient price file. May 404 — prices are entered manually. */
export function ingredientPricesPath(region: MarketRegion): string {
  return `/data/consumable-ingredient-prices-${region}.json`;
}

/** Per-category, per-region crafted output price file. May 404 — prices are entered manually. */
export function outputPricesPath(category: ConsumableCategory, region: MarketRegion): string {
  return `/data/${category}-prices-${region}.json`;
}
