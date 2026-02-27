import { describe, expect, it } from "vitest";
import {
  applyBonuses,
  calculateRefining,
  computeProfit,
  computeReturnRate,
  computeStationFee,
  createRefiningInput,
  getReturnRatePresetConfig,
  makeRefiner
} from "../core";
import { DEFAULT_RAW_BY_TIER, REFINE_VARIANTS } from "../data";

describe("refining core", () => {
  it("is deterministic for same input", () => {
    const profile = getReturnRatePresetConfig("bonus_city_focus");
    const input = createRefiningInput({
      variant: REFINE_VARIANTS[0],
      tierInputs: [{ materialKey: REFINE_VARIANTS[0].materialKey, tier: 8, unitRawPrice: DEFAULT_RAW_BY_TIER[8] }],
      usageFeePer100: 400,
      city: "Bridgewatch",
      baseReturnRate: profile.baseReturnRate,
      cityBonusRate: profile.cityBonusRate,
      refiningBonusRate: profile.refiningBonusRate,
      focusEnabled: profile.focusEnabled,
      focusReturnRate: profile.focusReturnRate
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

  it("computeReturnRate respects focus toggle", () => {
    const profile = getReturnRatePresetConfig("bonus_city");
    const base = createRefiningInput({
      variant: REFINE_VARIANTS[1],
      tierInputs: [{ materialKey: REFINE_VARIANTS[1].materialKey, tier: 8, unitRawPrice: 12000 }],
      usageFeePer100: 400,
      city: "Bridgewatch",
      baseReturnRate: profile.baseReturnRate,
      cityBonusRate: profile.cityBonusRate,
      refiningBonusRate: profile.refiningBonusRate,
      focusEnabled: false,
      focusReturnRate: 0.172
    });
    const withFocus = { ...base, bonuses: { ...base.bonuses, focusEnabled: true } };
    expect(computeReturnRate(withFocus)).toBeGreaterThan(computeReturnRate(base));
  });

  it("applyBonuses is immutable", () => {
    const profile = getReturnRatePresetConfig("bonus_city_focus");
    const input = createRefiningInput({
      variant: REFINE_VARIANTS[2],
      tierInputs: [{ materialKey: REFINE_VARIANTS[2].materialKey, tier: 7, unitRawPrice: 4800 }],
      usageFeePer100: 400,
      city: "Bridgewatch",
      baseReturnRate: profile.baseReturnRate,
      cityBonusRate: profile.cityBonusRate,
      refiningBonusRate: profile.refiningBonusRate,
      focusEnabled: profile.focusEnabled,
      focusReturnRate: profile.focusReturnRate
    });
    const original = calculateRefining(input);
    const updated = applyBonuses(original, { ...input.bonuses, cityBonusRate: 0.1 });
    expect(updated).not.toBe(original);
    expect(original.returnRate).not.toBe(updated.returnRate);
  });

  it("runs full composition pipeline through makeRefiner closure", () => {
    const profile = getReturnRatePresetConfig("bonus_city_focus");
    const mk = makeRefiner({
      city: "Bridgewatch",
      baseReturnRate: profile.baseReturnRate,
      cityBonusRate: profile.cityBonusRate,
      refiningBonusRate: profile.refiningBonusRate,
      focusEnabled: profile.focusEnabled,
      focusReturnRate: profile.focusReturnRate
    });
    const result = mk(
      REFINE_VARIANTS[0],
      [
        { materialKey: REFINE_VARIANTS[0].materialKey, tier: 4, unitRawPrice: DEFAULT_RAW_BY_TIER[4] },
        { materialKey: REFINE_VARIANTS[0].materialKey, tier: 5, unitRawPrice: DEFAULT_RAW_BY_TIER[5] },
        { materialKey: REFINE_VARIANTS[0].materialKey, tier: 6, unitRawPrice: DEFAULT_RAW_BY_TIER[6] },
        { materialKey: REFINE_VARIANTS[0].materialKey, tier: 7, unitRawPrice: DEFAULT_RAW_BY_TIER[7] },
        { materialKey: REFINE_VARIANTS[0].materialKey, tier: 8, unitRawPrice: DEFAULT_RAW_BY_TIER[8] }
      ],
      400
    );
    expect(result.totalCost).toBeGreaterThan(0);
    expect(result.revenue).toBeGreaterThan(0);
    expect(result.grossMaterialCost).toBeGreaterThan(result.effectiveMaterialCost);
    expect(result.profitPercent).toBeTypeOf("number");
  });
});
