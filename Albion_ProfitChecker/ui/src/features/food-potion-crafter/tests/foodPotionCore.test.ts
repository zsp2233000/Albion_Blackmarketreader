import { describe, expect, it } from "vitest";
import {
  calculateConsumable,
  computeConsumableStationFee,
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
    // Caerleon: 18 + 15 = 33 -> 0.2481 ; Martlock: 18 -> 0.1525
    expect(inCaerleon).toBeCloseTo(computeReturnRateFromBonusPercent(33), 6);
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
    // City bonus only (no focus) -> 18 + 15 = 33% -> returnRate 0.2481...
    const bonuses = makeBonuses({ focusEnabled: false });
    const result = calculateConsumable({
      recipe,
      ingredientPrices,
      outputMarketPrice: 500,
      amount: 2,
      itemValue: 800,
      usageFee: 100,
      marketTaxRate: 0.065,
      demandPerDay: 0,
      bonuses,
    });

    const gross = (100 * 4 + 250 * 2) * 2; // 1800
    expect(result.grossIngredientCost).toBe(gross);

    const rate = computeReturnRateFromBonusPercent(33);
    expect(result.returnRate).toBeCloseTo(rate, 6);
    expect(result.returnedIngredientCost).toBeCloseTo(gross * rate, 6);
    expect(result.effectiveIngredientCost).toBeCloseTo(gross - gross * rate, 6);

    expect(result.stationFee).toBe(computeConsumableStationFee(800, 100) * result.outputAmount);
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
      itemValue: 800,
      usageFee: 100,
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
      itemValue: 0,
      usageFee: 0,
      marketTaxRate: 0.065,
      demandPerDay: 50,
      bonuses: makeBonuses(),
    });
    expect(result.dailyPotential).toBeCloseTo(result.profitPerOutput * 50, 6);
  });

  it("excludes non-returnable ingredients (e.g. Avalonian Energy) from the return rate", () => {
    const recipe = makeRecipe({
      ingredients: [
        { itemId: "T5_A", name: "Ingredient A", qty: 4, tier: 5 },
        { itemId: "QUESTITEM_TOKEN_AVALON", name: "Avalonian Energy", qty: 10, tier: 6, returnable: false },
      ],
    });
    const ingredientPrices = new Map<string, number>([["T5_A", 100], ["QUESTITEM_TOKEN_AVALON", 50]]);
    const bonuses = makeBonuses({ focusEnabled: false }); // 18+15=33% -> rr 0.2481
    const result = calculateConsumable({
      recipe, ingredientPrices, outputMarketPrice: 500, amount: 1,
      itemValue: 0, usageFee: 0, marketTaxRate: 0, demandPerDay: 0, bonuses,
    });
    const rate = computeReturnRateFromBonusPercent(33);
    const returnableGross = 100 * 4; // only Ingredient A; avalon token excluded
    const totalGross = 100 * 4 + 50 * 10;
    expect(result.grossIngredientCost).toBe(totalGross);
    expect(result.returnedIngredientCost).toBeCloseTo(returnableGross * rate, 6);
    expect(result.effectiveIngredientCost).toBeCloseTo(totalGross - returnableGross * rate, 6);
  });
});

describe("computeConsumableStationFee", () => {
  // Workbook formula: usageFee × (itemValue × 0.1125) / 100, rounded up.
  it("matches the workbook (T8 Meal Stew: itemValue 576, usageFee 300 -> 195)", () => {
    expect(computeConsumableStationFee(576, 300)).toBe(195);
  });

  it("scales linearly with item value and usage fee", () => {
    expect(computeConsumableStationFee(1000, 100)).toBe(Math.ceil(1000 * 0.1125)); // 113
    expect(computeConsumableStationFee(1000, 200)).toBe(Math.ceil(1000 * 0.1125 * 2)); // 225
  });

  it("is zero when item value or usage fee is zero", () => {
    expect(computeConsumableStationFee(0, 300)).toBe(0);
    expect(computeConsumableStationFee(576, 0)).toBe(0);
  });
});
