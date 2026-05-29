import {
  calculateConsumable,
  getReturnRatePresetConfig,
  PRODUCTION_BONUS_CITY,
} from "../core";
import type { BonusConfig, ConsumableRecipe, PriceMap } from "../core";
import type { FoodPotionFilters, FoodPotionRow } from "./types";

function toSearchKey(value: string): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function buildIngredientPrices(recipe: ConsumableRecipe, priceByItemId: Map<string, number>): PriceMap {
  const prices: PriceMap = new Map();
  for (const ingredient of recipe.ingredients) {
    const price = priceByItemId.get(ingredient.itemId);
    if (typeof price === "number" && Number.isFinite(price) && price > 0) {
      prices.set(ingredient.itemId, price);
    }
  }
  return prices;
}

function matchesSearch(recipe: ConsumableRecipe, search: string): boolean {
  if (!search) return true;
  if (toSearchKey(recipe.name).includes(search)) return true;
  if (toSearchKey(recipe.itemId.replace(/_/g, " ")).includes(search)) return true;
  return recipe.ingredients.some((ingredient) => toSearchKey(ingredient.name).includes(search));
}

export function deriveFoodPotionRows(
  recipes: ConsumableRecipe[],
  filters: FoodPotionFilters,
  priceByItemId: Map<string, number>
): FoodPotionRow[] {
  const search = toSearchKey(filters.searchTerm);
  const presetConfig = getReturnRatePresetConfig(filters.returnRatePreset);
  const productionBonusCity = PRODUCTION_BONUS_CITY[filters.category];
  const rows: FoodPotionRow[] = [];

  for (const recipe of recipes) {
    if (recipe.category !== filters.category) continue;
    if (filters.selectedTier !== null && recipe.tier !== filters.selectedTier) continue;
    if (!matchesSearch(recipe, search)) continue;

    const ingredientPrices = buildIngredientPrices(recipe, priceByItemId);
    const outputMarketPrice = priceByItemId.get(recipe.itemId) ?? 0;

    const bonuses: BonusConfig = {
      city: filters.craftCity,
      productionBonusCity,
      royalBonusPercent: presetConfig.royalBonusPercent,
      materialBonusPercent: presetConfig.materialBonusPercent,
      focusEnabled: presetConfig.focusEnabled,
      focusBonusPercent: presetConfig.focusBonusPercent,
      dailyBonusPercent: 0,
      stationKind: filters.stationKind,
      hideoutBonusPercent: 0,
    };

    const result = calculateConsumable({
      recipe,
      ingredientPrices,
      outputMarketPrice,
      amount: filters.amount,
      stationFeePerCraft: filters.stationFeePerCraft,
      marketTaxRate: filters.marketTaxRate,
      demandPerDay: filters.demandPerDay,
      bonuses,
    });

    if (filters.showOnlyProfitable && result.profit < 0) continue;

    rows.push({
      rowKey: recipe.itemId,
      recipe,
      result,
    });
  }

  return rows.sort((a, b) => b.result.profit - a.result.profit);
}
