import type {
  City,
  ConsumableCategory,
  ConsumableRecipe,
  ConsumableResult,
  StationKind,
} from "../core";
import type { ReturnRatePreset } from "../core";

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
  amount: number;
  stationFeePerCraft: number;
  marketTaxRate: number;
  demandPerDay: number;
  showOnlyProfitable: boolean;
}
