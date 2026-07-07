import type { BmMarketItem, BmRecipe, ItemEconomics } from "../domain";
import type { JournalData, JournalProfession, OwnedJournals } from "../../../shared";

export interface BmCrafterRow {
  rowKey: string;
  item: BmMarketItem;
  recipe: BmRecipe;
  economics: ItemEconomics;
  tier: number | null;
  enchant: number;
  displayName: string;
  /** Per-craft journal profit already folded into economics.profit (0 when journals are off). */
  journalProfit?: number;
  journalProfession?: JournalProfession | null;
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
  /** When enabled, crafting-journal profit is folded into each row's profit before filtering. */
  journal?: {
    enabled: boolean;
    owned: OwnedJournals;
    data: JournalData | null;
  };
}
