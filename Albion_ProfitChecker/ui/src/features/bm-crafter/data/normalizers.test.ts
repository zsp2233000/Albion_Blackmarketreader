import { describe, expect, it } from "vitest";
import { normalizeMarketPayload, normalizePricePayload, normalizeRecipesPayload } from "./normalizers";

describe("bm crafter data normalizers", () => {
  it("normalizes market payload", () => {
    const payload = {
      region: "us",
      generatedAt: "2026-01-01T00:00:00Z",
      items: [
        { id: "T4_MAIN_SWORD", bm: 12345, sold: 99.2 },
        { id: "", bm: 1, sold: 1 },
        { id: "T5_MAIN_AXE", bm: "1000", sold: "10.5" }
      ]
    };

    const normalized = normalizeMarketPayload(payload, "eu");
    expect(normalized.region).toBe("us");
    expect(normalized.items).toHaveLength(2);
    expect(normalized.items[1]).toEqual({
      id: "T5_MAIN_AXE",
      bm: 1000,
      sold: 10.5,
      source: "api",
      observedAt: "2026-01-01T00:00:00Z"
    });
  });

  it("normalizes compact market tuple payload", () => {
    const payload = {
      region: "eu",
      generatedAt: "2026-01-01T00:00:00Z",
      items: [
        ["T4_MAIN_SWORD", 12345, 99.2],
        ["", 1, 1],
        ["T5_MAIN_AXE", "1000", "10.5"]
      ]
    };

    const normalized = normalizeMarketPayload(payload, "us");
    expect(normalized.region).toBe("eu");
    expect(normalized.items).toHaveLength(2);
    expect(normalized.items[0]).toEqual({
      id: "T4_MAIN_SWORD",
      bm: 12345,
      sold: 99.2,
      source: "api",
      observedAt: "2026-01-01T00:00:00Z"
    });
    expect(normalized.items[1]).toEqual({
      id: "T5_MAIN_AXE",
      bm: 1000,
      sold: 10.5,
      source: "api",
      observedAt: "2026-01-01T00:00:00Z"
    });
  });

  it("deduplicates market items by item id and keeps the best bm row", () => {
    const payload = {
      region: "eu",
      generatedAt: "2026-01-01T00:00:00Z",
      items: [
        ["T4_MAIN_SWORD", 1000, 20],
        ["T4_MAIN_SWORD", 1200, 10],
        ["T4_MAIN_SWORD", 1200, 30],
        ["T5_MAIN_AXE", 900, 15]
      ]
    };

    const normalized = normalizeMarketPayload(payload, "us");
    expect(normalized.items).toHaveLength(2);
    expect(normalized.items[0]).toMatchObject({ id: "T4_MAIN_SWORD", bm: 1200, sold: 30, source: "api" });
    expect(normalized.items[1]).toMatchObject({ id: "T5_MAIN_AXE", bm: 900, sold: 15, source: "api" });
  });

  it("keeps per-entry local source and observation time metadata", () => {
    const normalized = normalizeMarketPayload({
      region: "eu",
      generatedAt: "2026-01-01T00:00:00Z",
      items: [{
        id: "T4_MAIN_SWORD",
        bm: 12345,
        sold: 99.2,
        source: "local",
        observedAt: "2026-01-02T12:00:00Z"
      }]
    }, "eu");

    expect(normalized.items[0]).toMatchObject({
      source: "local",
      observedAt: "2026-01-02T12:00:00Z"
    });
  });

  it("normalizes price payload into list and map", () => {
    const payload = {
      region: "eu",
      generatedAt: "2026-01-01T00:00:00Z",
      items: [
        { itemId: "T4_PLANKS", price: 250, city: "Fort Sterling" },
        { itemId: "T4_METALBAR", price: "300" },
        { itemId: "T4_BAD", price: null }
      ]
    };

    const normalized = normalizePricePayload(payload, "us");
    expect(normalized.region).toBe("eu");
    expect(normalized.items).toHaveLength(2);
    expect(normalized.byItemId.get("T4_PLANKS")).toBe(250);
    expect(normalized.byItemId.get("T4_METALBAR")).toBe(300);
  });

  it("normalizes recipe categories and handles itemId/name material keys", () => {
    const payload = {
      categories: [
        {
          key: "weapons",
          items: [
            {
              id: "MAIN_SWORD",
              name: "Broadsword",
              materials: [
                { itemId: "METALBAR", qty: 16 },
                { name: "LEATHER", qty: 8 }
              ],
              artifactId: null
            }
          ]
        }
      ]
    };

    const normalized = normalizeRecipesPayload(payload);
    expect(normalized.items).toHaveLength(1);
    expect(normalized.byItemId.get("MAIN_SWORD")?.materials).toEqual([
      { itemId: "METALBAR", qty: 16 },
      { itemId: "LEATHER", qty: 8 }
    ]);
  });
});
