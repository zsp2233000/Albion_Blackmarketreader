import { describe, expect, it } from "vitest";
import {
  applyBonuses,
  calculateRefining,
  computeProfit,
  computeReturnRate,
  computeReturnRateFromBonusPercent,
  computeStationFee,
  createRefiningInput,
  getReturnRatePresetConfig,
  makeRefiner,
  sumRepeatedValue
} from "../core";
import { DEFAULT_PRICE_BY_ITEM_ID, MATERIAL_BY_KEY, REFINE_VARIANTS } from "../data";

function inputsForVariant(variant = REFINE_VARIANTS[0]) {
  return variant.ingredients.map((ingredient) => ({
    materialKey: ingredient.materialKey,
    kind: ingredient.kind,
    tier: ingredient.tier,
    enchant: ingredient.enchant,
    itemId: ingredient.itemId,
    unitPrice: DEFAULT_PRICE_BY_ITEM_ID[ingredient.itemId] || 100
  }));
}

describe("refining core", () => {
  it("is deterministic for same input", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 4 && entry.enchant === 0 && entry.materialKey === "metal")!;
    const profile = getReturnRatePresetConfig("focus");
    const input = createRefiningInput({
      variant,
      tierInputs: inputsForVariant(variant),
      usageFeePer100: 400,
      city: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...profile
    });
    expect(calculateRefining(input)).toEqual(calculateRefining(input));
  });

  it("computeProfit handles negative case", () => {
    expect(computeProfit(1000, 800)).toBe(-200);
  });

  it("computeStationFee follows usage fee per 100 and nutrition factor", () => {
    const fee = computeStationFee(10000, 400, 0.1125);
    expect(fee).toBe(4500);
  });

  it("computes Albion-style return rate from bonus percent", () => {
    expect(computeReturnRateFromBonusPercent(18)).toBeCloseTo(0.1525, 3);
    expect(computeReturnRateFromBonusPercent(58)).toBeCloseTo(0.3671, 3);
  });

  it("focus increases return rate and focus cost", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 5 && entry.enchant === 1 && entry.materialKey === "hide")!;
    const cityProfile = getReturnRatePresetConfig("city");
    const focusedProfile = getReturnRatePresetConfig("focus");
    const base = createRefiningInput({
      variant,
      tierInputs: inputsForVariant(variant),
      usageFeePer100: 400,
      city: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...cityProfile
    });
    const focused = createRefiningInput({
      variant,
      tierInputs: inputsForVariant(variant),
      usageFeePer100: 400,
      city: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...focusedProfile
    });
    expect(computeReturnRate(focused)).toBeGreaterThan(computeReturnRate(base));
    expect(calculateRefining(focused).focusCost).toBeGreaterThan(0);
  });

  it("uses full recipe cost including previous refined input", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 6 && entry.enchant === 2 && entry.materialKey === "wood")!;
    const result = makeRefiner({
      city: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...getReturnRatePresetConfig("focus")
    })(variant, inputsForVariant(variant), 400);
    expect(variant.ingredients.length).toBe(2);
    expect(result.grossMaterialCost).toBeGreaterThan(0);
    expect(result.grossMaterialCost).toBeGreaterThan(result.effectiveMaterialCost);
    expect(result.profitPercent).toBeTypeOf("number");
  });

  it("flags missing ingredient prices", () => {
    const variant = REFINE_VARIANTS.find((entry) => entry.tier === 4 && entry.enchant === 0 && entry.materialKey === "stone")!;
    const result = makeRefiner({
      city: "Bridgewatch",
      materialBonusCity: "Bridgewatch",
      ...getReturnRatePresetConfig("city")
    })(variant, [], 400);
    expect(result.missingInputCost).toBe(true);
  });

  it("uses recursion for repeated value without mutating state", () => {
    expect(sumRepeatedValue(125, 4)).toBe(500);
    expect(sumRepeatedValue(125, 0)).toBe(0);
  });

  it("applyBonuses is immutable", () => {
    const variant = REFINE_VARIANTS[0];
    const input = createRefiningInput({
      variant,
      tierInputs: inputsForVariant(variant),
      usageFeePer100: 400,
      city: "Martlock",
      materialBonusCity: MATERIAL_BY_KEY[variant.materialKey].bonusCity,
      ...getReturnRatePresetConfig("city")
    });
    const original = calculateRefining(input);
    const updated = applyBonuses(original, { ...input.bonuses, city: MATERIAL_BY_KEY[variant.materialKey].bonusCity });
    expect(updated).not.toBe(original);
    expect(original.returnRate).not.toBe(updated.returnRate);
  });
});
