import type { BmMarketItem, BmRecipe, MarketRegion } from "../domain";

export type DataKind = "bm" | "materials" | "artefacts" | "recipes";

export interface PriceEntry {
  itemId: string;
  price: number;
  city?: string;
}

export interface BmCrafterMarketData {
  region: MarketRegion;
  generatedAt: string | null;
  items: BmMarketItem[];
}

export interface BmCrafterPriceData {
  region: MarketRegion;
  generatedAt: string | null;
  items: PriceEntry[];
  byItemId: Map<string, number>;
}

export interface BmCrafterRecipesData {
  generatedAt: string | null;
  items: BmRecipe[];
  byItemId: Map<string, BmRecipe>;
}

export interface BmCrafterDataBundle {
  region: MarketRegion;
  market: BmCrafterMarketData;
  materials: BmCrafterPriceData;
  artefacts: BmCrafterPriceData;
  recipes: BmCrafterRecipesData;
}

export interface LoadJsonOptions {
  cacheBust?: boolean;
}
