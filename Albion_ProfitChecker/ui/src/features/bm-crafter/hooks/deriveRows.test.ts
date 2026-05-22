import { describe, expect, it } from "vitest";
import { deriveBmCrafterRows } from "./deriveRows";
import type { BmCrafterDataBundle } from "../data";

function buildBundle(): BmCrafterDataBundle {
  return {
    region: "us",
    market: {
      region: "us",
      generatedAt: null,
      items: [
        { id: "T4_MAIN_SWORD", bm: 10000, sold: 100 },
        { id: "T4_MAIN_AXE", bm: 7000, sold: 40 },
        { id: "T5_MAIN_SWORD@1", bm: 30000, sold: 10 }
      ]
    },
    materials: {
      region: "us",
      generatedAt: null,
      items: [],
      byItemId: new Map<string, number>([
        ["T4_METALBAR", 200],
        ["T4_LEATHER", 100],
        ["T5_METALBAR_LEVEL1@1", 900],
        ["T5_LEATHER_LEVEL1@1", 500]
      ])
    },
    artefacts: {
      region: "us",
      generatedAt: null,
      items: [],
      byItemId: new Map<string, number>()
    },
    recipes: {
      generatedAt: null,
      items: [
        {
          itemId: "MAIN_SWORD",
          name: "Broadsword",
          materials: [
            { itemId: "METALBAR", qty: 16 },
            { itemId: "LEATHER", qty: 8 }
          ],
          artifactId: null
        },
        {
          itemId: "MAIN_AXE",
          name: "Battleaxe",
          materials: [
            { itemId: "METALBAR", qty: 16 },
            { itemId: "LEATHER", qty: 8 }
          ],
          artifactId: null
        }
      ],
      byItemId: new Map()
    }
  } as unknown as BmCrafterDataBundle;
}

describe("deriveBmCrafterRows", () => {
  it("derives and sorts by profit pct by default", () => {
    const bundle = buildBundle();
    bundle.recipes.byItemId.set("MAIN_SWORD", bundle.recipes.items[0]);
    bundle.recipes.byItemId.set("MAIN_AXE", bundle.recipes.items[1]);

    const rows = deriveBmCrafterRows(bundle, {
      selectedTier: null,
      selectedEnchant: null,
      minSold: 0,
      searchTerm: "",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: true,
      craftCity: "Caerleon",
      usageFeePer100: 0
    });

    expect(rows).toHaveLength(3);
    expect(rows[0].item.id).toBe("T4_MAIN_SWORD");
    expect(rows[0].rowKey).toBeTruthy();
  });

  it("filters by tier and search", () => {
    const bundle = buildBundle();
    bundle.recipes.byItemId.set("MAIN_SWORD", bundle.recipes.items[0]);
    bundle.recipes.byItemId.set("MAIN_AXE", bundle.recipes.items[1]);

    const rows = deriveBmCrafterRows(bundle, {
      selectedTier: 5,
      selectedEnchant: 1,
      minSold: 0,
      searchTerm: "broad",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: true,
      craftCity: "Caerleon",
      usageFeePer100: 0
    });

    expect(rows).toHaveLength(1);
    expect(rows[0].item.id).toBe("T5_MAIN_SWORD@1");
  });
});
