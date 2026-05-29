import { describe, expect, it } from "vitest";
import {
  calculateConsumable,
  computeReturnRate,
  computeReturnRateFromBonusPercent,
  getReturnRatePresetConfig,
  PRODUCTION_BONUS_CITY,
} from "../core";
import type { BonusConfig, ConsumableRecipe } from "../core";

function makeRecipe(overrides: Partial<ConsumableRecipe> = {}): ConsumableRecipe {
  return {
    itemId: "T5_MEAL_TEST",
    name: "Test Meal",
    tier: 5,
    category: "food",
    outputQty: 10,
    isAvalonian: false,
    ingredients: [
      { itemId: "T5_A", name: "Ingredient A", qty: 4, tier: 5 },
      { itemId: "T5_B", name: "Ingredient B", qty: 2, tier: 5 },
    ],
    ...overrides,
  };
}

function makeBonuses(overrides: Partial<BonusConfig> = {}): BonusConfig {
  const preset = getReturnRatePresetConfig("focus");
  return {
    city: "Caerleon",
    productionBonusCity: PRODUCTION_BONUS_CITY.food,
    royalBonusPercent: preset.royalBonusPercent,
    materialBonusPercent: preset.materialBonusPercent,
    focusEnabled: preset.focusEnabled,
    focusBonusPercent: preset.focusBonusPercent,
    dailyBonusPercent: 0,
    stationKind: "city",
    hideoutBonusPercent: 0,
    ...overrides,
  };
}

describe("food/potion return rate", () => {
  it("matches Albion formula for plain bonus percentages", () => {
    expect(computeReturnRateFromBonusPercent(18)).toBeCloseTo(0.1525, 3);
    expect(computeReturnRateFromBonusPercent(58)).toBeCloseTo(0.3671, 3);
  });

  it("island stations grant no return", () => {
    expect(computeReturnRate(makeBonuses({ stationKind: "island" }))).toBe(0);
  });

  it("applies the city specialty bonus only in the production-bonus city", () => {
    const inCaerleon = computeReturnRate(makeBonuses({ city: "Caerleon", focusEnabled: false }));
    const elsewhere = computeReturnRate(makeBonuses({ city: "Martlock", focusEnabled: false }));
    // Caerleon: 18 + 40 = 58 -> 0.3671 ; Martlock: 18 -> 0.1525
    expect(inCaerleon).toBeCloseTo(computeReturnRateFromBonusPercent(58), 6);
    expect(elsewhere).toBeCloseTo(computeReturnRateFromBonusPercent(18), 6);
    expect(inCaerleon).toBeGreaterThan(elsewhere);
  });

  it("focus increases the return rate", () => {
    const withFocus = computeReturnRate(makeBonuses({ focusEnabled: true }));
    const withoutFocus = computeReturnRate(makeBonuses({ focusEnabled: false }));
    expect(withFocus).toBeGreaterThan(withoutFocus);
  });
});

describe("calculateConsumable", () => {
  it("computes costs, fee, revenue and profit exactly", () => {
    const recipe = makeRecipe();
    const ingredientPrices = new Map<string, number>([
      ["T5_A", 100],
      ["T5_B", 250],
    ]);
    // City bonus only (no focus) -> 18 + 40 = 58% -> returnRate 0.36708...
    const bonuses = makeBonuses({ focusEnabled: false });
    const result = calculateConsumable({
      recipe,
      ingredientPrices,
      outputMarketPrice: 500,
      amount: 2,
      stationFeePerCraft: 300,
      marketTaxRate: 0.065,
      demandPerDay: 0,
      bonuses,
    });

    const gross = (100 * 4 + 250 * 2) * 2; // 1800
    expect(result.grossIngredientCost).toBe(gross);

    const rate = computeReturnRateFromBonusPercent(58);
    expect(result.returnRate).toBeCloseTo(rate, 6);
    expect(result.returnedIngredientCost).toBeCloseTo(gross * rate, 6);
    expect(result.effectiveIngredientCost).toBeCloseTo(gross - gross * rate, 6);

    expect(result.stationFee).toBe(600); // 300 * 2
    expect(result.outputAmount).toBe(20); // 10 * 2

    const revenue = 500 * 20; // 10000
    expect(result.revenue).toBe(revenue);
    expect(result.marketTax).toBeCloseTo(revenue * 0.065, 6);
    expect(result.netRevenue).toBeCloseTo(revenue - revenue * 0.065, 6);

    const totalCost = result.effectiveIngredientCost + result.stationFee;
    expect(result.totalCost).toBeCloseTo(totalCost, 6);
    expect(result.profit).toBeCloseTo(result.netRevenue - totalCost, 6);
    expect(result.profitPerOutput).toBeCloseTo(result.profit / 20, 6);
  });

  it("flags missing ingredient cost when a price is absent", () => {
    const result = calculateConsumable({
      recipe: makeRecipe(),
      ingredientPrices: new Map<string, number>([["T5_A", 100]]),
      outputMarketPrice: 500,
      amount: 1,
      stationFeePerCraft: 300,
      marketTaxRate: 0.065,
      demandPerDay: 0,
      bonuses: makeBonuses(),
    });
    expect(result.missingIngredientCost).toBe(true);
  });

  it("derives daily potential from demand per day", () => {
    const result = calculateConsumable({
      recipe: makeRecipe(),
      ingredientPrices: new Map<string, number>([["T5_A", 10], ["T5_B", 10]]),
      outputMarketPrice: 500,
      amount: 1,
      stationFeePerCraft: 100,
      marketTaxRate: 0.065,
      demandPerDay: 50,
      bonuses: makeBonuses(),
    });
    expect(result.dailyPotential).toBeCloseTo(result.profitPerOutput * 50, 6);
  });
});
