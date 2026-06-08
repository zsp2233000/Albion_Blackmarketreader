import type {
  City,
  ConsumableCategory,
  ConsumableRecipe,
  ConsumableResult,
  StationKind,
} from "../core";
import type { ReturnRatePreset } from "../core";
import type { CraftingProgress } from "../specs/data";

export interface FoodPotionRow {
  rowKey: string;
  recipe: ConsumableRecipe;
  result: ConsumableResult;
}

export interface FoodPotionFilters {
  category: ConsumableCategory;
  selectedTier: number | null;
  searchTerm: string;
  craftCity: City;
  buyCity: City;
  sellCity: City;
  stationKind: StationKind;
  returnRatePreset: ReturnRatePreset;
  customReturnRatePct: number;
  amount: number;
  usageFee: number;
  marketTaxRate: number;
  demandPerDay: number;
  showOnlyProfitable: boolean;
  /** Optional spec progress for focus calc. */
  specProgress?: CraftingProgress;
}
