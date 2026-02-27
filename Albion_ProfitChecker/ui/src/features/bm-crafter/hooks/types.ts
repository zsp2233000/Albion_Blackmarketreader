import type { BmMarketItem, BmRecipe, ItemEconomics } from "../domain";

export interface BmCrafterRow {
  rowKey: string;
  item: BmMarketItem;
  recipe: BmRecipe;
  economics: ItemEconomics;
  tier: number | null;
  enchant: number;
  displayName: string;
}

export interface BmCrafterFilters {
  selectedTier: number | null;
  selectedEnchant: number | null;
  minSold: number;
  searchTerm: string;
  returnRate: number;
  sortByDailyTop: boolean;
  showOnlyProfitable: boolean;
}
