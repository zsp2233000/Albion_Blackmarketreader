import { describe, expect, it } from "vitest";
import {
  buildMaterialItemId,
  calculateCraftingUsageFee,
  calculateEconomics,
  getBonusCityForItem,
  normalizeResultPriceEntry,
  productionBonusToReturnRate,
  resolveBlackMarketPrice,
  resolveResultPrice
} from "./craftingCalculator.logic";

describe("crafting station usage fee (matches workbook CEILING)", () => {
  it("computes itemValue × 0.1125 × usageFee/100, rounded up", () => {
    // 256 × 0.1125 × 1000/100 = 288 exactly
    expect(calculateCraftingUsageFee(256, 1000)).toBe(288);
    // 255 × 0.1125 × 1000/100 = 286.875 -> ceil 287
    expect(calculateCraftingUsageFee(255, 1000)).toBe(287);
    // 720 × 0.1125 × 700/100 = 567 exactly
    expect(calculateCraftingUsageFee(720, 700)).toBe(567);
  });

  it("is zero when item value or station fee is zero", () => {
    expect(calculateCraftingUsageFee(0, 1000)).toBe(0);
    expect(calculateCraftingUsageFee(256, 0)).toBe(0);
  });
});

describe("crafting calculator city and id helpers", () => {
  it("maps special categories to the expected bonus city", () => {
    expect(getBonusCityForItem({ id: "BAG", categoryKey: "bags" })).toBe("Brecilien");
    expect(getBonusCityForItem({ id: "BAG_INSIGHT", categoryKey: "bags" })).toBe("Brecilien");
    expect(getBonusCityForItem({ id: "CAPE", categoryKey: "capes" })).toBe("Brecilien");
    // All gathering tools have their Local Production Bonus in Caerleon
    expect(getBonusCityForItem({ id: "2H_TOOL_HAMMER" })).toBe("Caerleon");
    expect(getBonusCityForItem({ id: "2H_TOOL_PICK" })).toBe("Caerleon");
    expect(getBonusCityForItem({ id: "2H_TOOL_SICKLE" })).toBe("Caerleon");
    expect(getBonusCityForItem({ id: "2H_TOOL_FISHINGROD" })).toBe("Caerleon");
    // All gathering gear (regardless of resource) also Caerleon
    expect(getBonusCityForItem({ id: "HEAD_GATHERER_FISH" })).toBe("Caerleon");
    expect(getBonusCityForItem({ id: "ARMOR_GATHERER_FIBER" })).toBe("Caerleon");
    expect(getBonusCityForItem({ id: "BACKPACK_GATHERER_ORE" })).toBe("Caerleon");
  });

  it("builds normal material ids and stone block ids correctly", () => {
    expect(buildMaterialItemId("PLANKS", 6, 2)).toBe("T6_PLANKS_LEVEL2@2");
    expect(buildMaterialItemId("STONEBLOCK", 6, 3)).toBe("T6_STONEBLOCK");
    expect(buildMaterialItemId("UNKNOWN", 6, 0)).toBeNull();
  });
});

describe("crafting calculator pricing helpers", () => {
  it("converts production bonus into a return rate decimal", () => {
    expect(productionBonusToReturnRate(15.25)).toBeCloseTo(0.132321, 6);
    expect(productionBonusToReturnRate(0)).toBe(0);
  });

  it("prefers structured city prices and falls back to legacy entries", () => {
    const structured = [
      {
        prices: {
          Lymhurst: 19000,
          Caerleon: 23000
        },
        bm: 50000
      },
      {
        prices: {
          Lymhurst: 17000,
          Caerleon: 21000
        },
        bm: 54000
      }
    ];

    expect(resolveResultPrice(structured, "Lymhurst")).toBe(17000);

    const legacy = [
      { city: "Lymhurst", price: 29000 },
      { city: "Lymhurst", price: 25000 },
      { city: "Caerleon", price: 27000 }
    ];

    expect(resolveResultPrice(legacy, "Lymhurst")).toBe(25000);
    expect(resolveBlackMarketPrice(structured)).toBe(54000);
  });

  it("normalizes legacy tuple rows so black market values remain usable", () => {
    const normalized = normalizeResultPriceEntry([
      "Lymhurst",
      "T4_2H_BOW",
      4895,
      12569,
      206.8,
      156.8,
      "14d"
    ]);

    expect(normalized).toEqual({
      city: "Lymhurst",
      id: "T4_2H_BOW",
      itemId: "T4_2H_BOW",
      lym: 4895,
      bm: 12569,
      sold: 206.8
    });
  });
});

describe("crafting calculator economics", () => {
  it("includes artefact, return rate, crafting fee and market fees", () => {
    const result = calculateEconomics({
      mat1: 100000,
      mat2: 50000,
      artefact: 60000,
      market: 300000,
      requiresMat1: true,
      requiresMat2: true,
      requiresArtefact: true,
      returnRate: 0.2481,
      itemValue: 256,
      stationFee: 1000,
      setupFeePercent: 2.5,
      transactionTaxPercent: 4
    });

    expect(result.canCalculate).toBe(true);
    expect(result.grossResourceCost).toBe(210000);
    // materials only: (100000 + 50000) * (1 - 0.2481) = 150000 * 0.7519 = 112785
    // + artefact (no return): 60000 = 172785
    expect(result.netResourceCost).toBeCloseTo(172785, 3);
    expect(result.craftingUsageFee).toBeCloseTo(288, 3);
    expect(result.totalFees).toBeCloseTo(19788, 3);
    expect(result.totalCost).toBeCloseTo(192573, 3);
    expect(result.profit).toBeCloseTo(107427, 3);
    expect(result.roi).toBeCloseTo(55.78508, 3);
  });

  it("refuses to calculate when a required price is missing", () => {
    const result = calculateEconomics({
      mat1: 100000,
      mat2: 0,
      artefact: 0,
      market: 300000,
      requiresMat1: true,
      requiresMat2: true,
      requiresArtefact: false,
      returnRate: 0.1525,
      itemValue: 256,
      stationFee: 1000,
      setupFeePercent: 2.5,
      transactionTaxPercent: 4
    });

    expect(result.canCalculate).toBe(false);
    expect(result.totalCost).toBeNull();
    expect(result.profit).toBeNull();
  });
});
