import { describe, expect, it } from "vitest";
import { REFINE_VARIANTS, buildRefiningLiveSnapshot } from "../data";

describe("refining live mapping", () => {
  it("maps live market prices and tier base values", () => {
    const payload = {
      generatedAt: "2026-02-27T09:00:00.000Z",
      items: [
        { itemId: "T8_METALBAR_LEVEL3@3", prices: { Bridgewatch: 700000, Lymhurst: 710000 } },
        { itemId: "T8_METALBAR_LEVEL1@1", prices: { Bridgewatch: 80000 } },
        { itemId: "T7_METALBAR_LEVEL3@3", prices: { Bridgewatch: 250000 } },
        { itemId: "T4_METALBAR", prices: { Bridgewatch: 300 } },
        { itemId: "T5_METALBAR", prices: { Bridgewatch: 900 } },
        { itemId: "T6_METALBAR", prices: { Bridgewatch: 3500 } },
        { itemId: "T7_METALBAR", prices: { Bridgewatch: 8000 } },
        { itemId: "T8_METALBAR", prices: { Bridgewatch: 30000 } }
      ]
    };

    const result = buildRefiningLiveSnapshot(payload, REFINE_VARIANTS, "Bridgewatch");
    expect(result.generatedAt).toBe("2026-02-27T09:00:00.000Z");
    expect(result.marketByVariantId["T8.3 Metal Bar"]).toBe(700000);
    expect(result.marketByVariantId["T8.4 Metal Bar"]).toBe(700000);
    expect(result.tierBaseRawByMaterial.metal[8]).toBe(30000);
    expect(result.tierBaseRawByMaterial.metal[4]).toBe(300);
  });
});
