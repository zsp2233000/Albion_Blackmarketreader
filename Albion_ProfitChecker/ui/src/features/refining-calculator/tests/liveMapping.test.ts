import { describe, expect, it } from "vitest";
import { REFINE_VARIANTS, buildRefiningLiveSnapshot } from "../data";

describe("refining live mapping", () => {
  it("maps live refined prices and raw ingredient prices by city", () => {
    const refinedPayload = {
      generatedAt: "2026-02-27T09:00:00.000Z",
      items: [
        { itemId: "T8_METALBAR_LEVEL3@3", prices: { Bridgewatch: 700000, Lymhurst: 710000 } },
        { itemId: "T8_METALBAR_LEVEL2@2", prices: { Bridgewatch: 250000 } },
      ]
    };

    const rawPayload = {
      generatedAt: "2026-02-27T09:05:00.000Z",
      items: [
        { itemId: "T8_ORE_LEVEL3@3", prices: { Lymhurst: 160000, Bridgewatch: 170000 } }
      ]
    };

    const result = buildRefiningLiveSnapshot(refinedPayload, rawPayload, REFINE_VARIANTS, "Lymhurst", "Bridgewatch");
    expect(result.generatedAt).toBe("2026-02-27T09:05:00.000Z");
    expect(result.priceByItemId["T8_METALBAR_LEVEL3@3"]).toBe(710000);
    expect(result.priceByItemId["T8_ORE_LEVEL3@3"]).toBe(160000);
  });

  it("reports missing raw live prices while keeping defaults", () => {
    const result = buildRefiningLiveSnapshot({ items: [] }, { items: [] }, REFINE_VARIANTS.slice(0, 1), "Bridgewatch", "Bridgewatch");
    expect(result.missingRawItemIds.length).toBeGreaterThan(0);
    expect(result.priceByItemId[REFINE_VARIANTS[0].itemId]).toBeGreaterThan(0);
  });
});
