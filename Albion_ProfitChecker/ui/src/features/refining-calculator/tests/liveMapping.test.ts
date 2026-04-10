import { describe, expect, it } from "vitest";
import { REFINE_VARIANTS, buildRefiningLiveSnapshot } from "../data";

describe("refining live mapping", () => {
  it("maps live market prices and enchanted raw material prices", () => {
    const payload = {
      generatedAt: "2026-02-27T09:00:00.000Z",
      items: [
        { itemId: "T8_METALBAR_LEVEL3@3", prices: { Bridgewatch: 700000, Lymhurst: 710000 } },
        { itemId: "T8_METALBAR_LEVEL1@1", prices: { Bridgewatch: 80000 } },
        { itemId: "T7_METALBAR_LEVEL3@3", prices: { Bridgewatch: 250000 } },
        { itemId: "T4_ORE", prices: { Bridgewatch: 300 } },
        { itemId: "T5_ORE", prices: { Bridgewatch: 900 } },
        { itemId: "T6_ORE", prices: { Bridgewatch: 3500 } },
        { itemId: "T7_ORE", prices: { Bridgewatch: 8000 } },
        { itemId: "T8_ORE", prices: { Bridgewatch: 30000 } },
        { itemId: "T8_ORE_LEVEL1@1", prices: { Bridgewatch: 42000 } },
        { itemId: "T8_ORE_LEVEL3@3", prices: { Bridgewatch: 160000 } }
      ]
    };

    const result = buildRefiningLiveSnapshot(payload, REFINE_VARIANTS, "Bridgewatch");
    expect(result.generatedAt).toBe("2026-02-27T09:00:00.000Z");
    expect(result.marketByVariantId["T8.3 Metal Bar"]).toBe(700000);
    expect(result.marketByVariantId["T8.4 Metal Bar"]).toBe(700000);
    expect(result.rawByMaterialTierEnchant.metal[8][0]).toBe(30000);
    expect(result.rawByMaterialTierEnchant.metal[8][1]).toBe(42000);
    expect(result.rawByMaterialTierEnchant.metal[8][3]).toBe(160000);
    expect(result.rawByMaterialTierEnchant.metal[4][0]).toBe(300);
  });
});
