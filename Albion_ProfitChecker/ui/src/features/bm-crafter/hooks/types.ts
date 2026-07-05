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
  // Empty array = no restriction (show all tiers / all enchants). Multiple values allowed.
  selectedTiers: number[];
  selectedEnchants: number[];
  minSold: number;
  searchTerm: string;
  returnRate: number;
  sortByDailyTop: boolean;
  showOnlyProfitable: boolean;
  nonArtefactOnly: boolean;
  craftCity: string;
  usageFeePer100: number;
}
