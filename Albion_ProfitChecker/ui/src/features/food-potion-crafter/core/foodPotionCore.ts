import type {
  BonusConfig,
  ConsumableCategory,
  ConsumableInput,
  ConsumableResult,
  PriceMap,
} from "./types";

const clamp = (value: number, min: number, max: number): number => Math.max(min, Math.min(max, value));

export type ReturnRatePreset = "base" | "city" | "focus" | "custom";

export const ROYAL_BONUS_PERCENT = 18;
// Consumable (Cook/Alchemist) bonus-city specialty is +15% — NOT the +40% refining value.
// Verified against community workbook: potion in bonus city w/o focus = 18+15=33 -> RR 0.2481;
// food w/ focus only = 18+59=77 -> RR 0.4350 (both exact matches).
export const CITY_BONUS_PERCENT = 15;
export const FOCUS_BONUS_PERCENT = 59;

/** Default station usage fee (silver per 1000), by category (matches source workbook). */
export const DEFAULT_USAGE_FEE: Record<ConsumableCategory, number> = {
  food: 300,
  potion: 500,
};

/**
 * Station fee for ONE craft action, matching the in-game / workbook formula:
 *   fee = usageFee × (itemValue × 0.1125) / 100, rounded up.
 * itemValue is the output's item value (Σ ingredient item values / amount crafted, from
 * ao-bin-dumps); itemValue × 0.1125 is the nutrition consumed per craft.
 */
const STATION_FEE_NUTRITION_FACTOR = 0.1125;

export function computeConsumableStationFee(itemValue: number, usageFee: number): number {
  const fee = (Math.max(0, usageFee) * (Math.max(0, itemValue) * STATION_FEE_NUTRITION_FACTOR)) / 100;
  return Math.ceil(fee);
}

/** City that grants the Local Production specialty bonus per category. */
export const PRODUCTION_BONUS_CITY: Record<ConsumableCategory, BonusConfig["productionBonusCity"]> = {
  food: "Caerleon",
  potion: "Brecilien",
};

/**
 * Albion resource return rate from an additive bonus percentage.
 * returnRate = 1 - 1 / (1 + bonus/100), capped at 0.99.
 */
export function computeReturnRateFromBonusPercent(totalBonusPercent: number): number {
  const positive = Math.max(0, totalBonusPercent);
  return clamp(1 - 1 / (1 + positive / 100), 0, 0.99);
}

/**
 * Effective return rate from the bonus configuration.
 * - Island stations grant no return at all.
 * - The +40% city specialty bonus applies only in a public city station that matches the
 *   category's production-bonus city.
 * - Hideout stations use a power-derived bonus instead of the royal city base.
 */
export function computeReturnRate(bonuses: BonusConfig): number {
  if (bonuses.stationKind === "island") return 0;

  const specialtyBonus =
    bonuses.stationKind === "city" && bonuses.city === bonuses.productionBonusCity
      ? bonuses.materialBonusPercent
      : 0;
  const focusBonus = bonuses.focusEnabled ? bonuses.focusBonusPercent : 0;
  const cityBase = bonuses.stationKind === "hideout" ? bonuses.hideoutBonusPercent : bonuses.royalBonusPercent;

  return computeReturnRateFromBonusPercent(cityBase + specialtyBonus + focusBonus + bonuses.dailyBonusPercent);
}

export function getReturnRatePresetConfig(preset: ReturnRatePreset): {
  focusEnabled: boolean;
  royalBonusPercent: number;
  materialBonusPercent: number;
  focusBonusPercent: number;
} {
  if (preset === "focus") {
    return { focusEnabled: true, royalBonusPercent: ROYAL_BONUS_PERCENT, materialBonusPercent: CITY_BONUS_PERCENT, focusBonusPercent: FOCUS_BONUS_PERCENT };
  }
  if (preset === "city") {
    return { focusEnabled: false, royalBonusPercent: ROYAL_BONUS_PERCENT, materialBonusPercent: CITY_BONUS_PERCENT, focusBonusPercent: FOCUS_BONUS_PERCENT };
  }
  return { focusEnabled: false, royalBonusPercent: ROYAL_BONUS_PERCENT, materialBonusPercent: 0, focusBonusPercent: FOCUS_BONUS_PERCENT };
}

function getUnitPrice(prices: PriceMap, itemId: string): number {
  const value = prices.get(itemId);
  return typeof value === "number" && Number.isFinite(value) && value > 0 ? value : 0;
}

/**
 * Pure profit calculation for a single food/potion recipe.
 * Ingredient return only reduces ingredient cost; the flat station fee is never returned.
 */
export function calculateConsumable(input: ConsumableInput): ConsumableResult {
  const amount = Math.max(1, Math.floor(input.amount));
  const outputAmount = input.recipe.outputQty * amount;

  let grossIngredientCost = 0;
  let returnableGrossCost = 0;
  let missingIngredientCost = false;
  for (const ingredient of input.recipe.ingredients) {
    const unitPrice = getUnitPrice(input.ingredientPrices, ingredient.itemId);
    if (unitPrice <= 0) missingIngredientCost = true;
    const lineCost = unitPrice * ingredient.qty * amount;
    grossIngredientCost += lineCost;
    // Non-returnable ingredients (e.g. Avalonian Energy quest token) are paid for but
    // never refunded by the resource return rate.
    if (ingredient.returnable !== false) returnableGrossCost += lineCost;
  }

  const returnRate =
    typeof input.returnRateOverride === "number" && Number.isFinite(input.returnRateOverride)
      ? clamp(input.returnRateOverride, 0, 0.99)
      : computeReturnRate(input.bonuses);
  const returnedIngredientCost = returnableGrossCost * returnRate;
  const effectiveIngredientCost = grossIngredientCost - returnedIngredientCost;

  // The station fee is charged per produced item (itemValue is per-item), so it scales
  // with the total number of items crafted, not the number of craft actions.
  const stationFee = computeConsumableStationFee(input.itemValue, input.usageFee) * outputAmount;

  const revenue = Math.max(0, input.outputMarketPrice) * outputAmount;
  const marketTax = revenue * clamp(input.marketTaxRate, 0, 1);
  const netRevenue = revenue - marketTax;

  const totalCost = effectiveIngredientCost + stationFee;
  const profit = netRevenue - totalCost;
  const profitPercent = totalCost > 0 ? (profit / totalCost) * 100 : 0;
  const profitPerOutput = outputAmount > 0 ? profit / outputAmount : 0;
  const dailyPotential = input.demandPerDay > 0 ? profitPerOutput * input.demandPerDay : null;

  // Focus: base focus per craft reduced by spec/mastery efficiency (0.5 per 10k eff), times amount.
  const baseFocus = Math.max(0, input.focusPerCraft ?? input.recipe.baseFocus ?? 0);
  const efficiency = Math.max(0, input.focusEfficiency ?? 0);
  const focusCost = baseFocus > 0 ? baseFocus * Math.pow(0.5, efficiency / 10000) * amount : 0;
  const silverPerFocus = focusCost > 0 ? profit / focusCost : null;

  return {
    outputAmount,
    grossIngredientCost,
    returnRate,
    returnedIngredientCost,
    effectiveIngredientCost,
    stationFee,
    revenue,
    marketTax,
    netRevenue,
    totalCost,
    profit,
    profitPercent,
    profitPerOutput,
    dailyPotential,
    missingIngredientCost,
    focusCost,
    silverPerFocus,
  };
}
