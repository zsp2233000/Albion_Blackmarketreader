export type MarketRegion = "eu" | "us";

export interface BmMarketItem {
  id: string;
  bm: number | null;
  sold: number | null;
}

export interface MaterialRequirement {
  itemId: string;
  qty: number;
}

export interface BmRecipe {
  itemId: string;
  name?: string;
  materials: MaterialRequirement[];
  artifactId?: string | null;
  artifact?: string;
}

export interface MaterialCostResult {
  sum: number;
  hasPrice: boolean;
}

export interface ItemEconomics {
  craftCost: number;
  stationFee: number;
  profit: number;
  dailyPotential: number | null;
  profitPct: number | null;
  focusCost: number | null;
  profitPerFocus: number | null;
}

export interface CalculateItemEconomicsInput {
  item: BmMarketItem;
  recipe: BmRecipe | null;
  returnRate: number;
  usageFeePer100: number;
  getMaterialPrice: (materialId: string, tier: number, enchant: number) => number | null;
  getArtefactPrice: (artefactId: string, tier: number) => number | null;
}
