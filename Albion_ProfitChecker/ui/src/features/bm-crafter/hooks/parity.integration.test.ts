import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { normalizeItemId, parseEnchant, parseTier } from "../domain";
import { normalizeMarketPayload, normalizePricePayload, normalizeRecipesPayload } from "../data";
import { deriveBmCrafterRows } from "./deriveRows";

function loadJson(relativePathFromRepoRoot: string): unknown {
  const fullPath = path.resolve(process.cwd(), relativePathFromRepoRoot);
  return JSON.parse(readFileSync(fullPath, "utf8")) as unknown;
}

function buildRealBundle(region: "eu" | "us") {
  const marketPayload = loadJson(`public/data/bm-crafter-${region}.json`);
  const materialsPayload = loadJson(`public/data/materials-${region}.json`);
  const artefactsPayload = loadJson(`public/data/artefacts-${region}.json`);
  const recipesPayload = loadJson("public/items-categorized-crafting.json");

  return {
    region,
    market: normalizeMarketPayload(marketPayload, region),
    materials: normalizePricePayload(materialsPayload, region),
    artefacts: normalizePricePayload(artefactsPayload, region),
    recipes: normalizeRecipesPayload(recipesPayload)
  };
}

describe("bm crafter parity integration", () => {
  it("derives stable profitable rows from real US dataset", () => {
    const bundle = buildRealBundle("us");
    const rows = deriveBmCrafterRows(bundle, {
      selectedTier: null,
      selectedEnchant: null,
      minSold: 0,
      searchTerm: "",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: true
    });

    expect(rows.length).toBeGreaterThan(100);

    for (const row of rows.slice(0, 200)) {
      expect(Number.isFinite(row.economics.craftCost)).toBe(true);
      expect(Number.isFinite(row.economics.profit)).toBe(true);
      expect(row.economics.profit).toBeGreaterThanOrEqual(0);
    }

    for (let i = 1; i < rows.length; i += 1) {
      const prev = rows[i - 1].economics.profitPct ?? Number.NEGATIVE_INFINITY;
      const curr = rows[i].economics.profitPct ?? Number.NEGATIVE_INFINITY;
      expect(prev).toBeGreaterThanOrEqual(curr);
    }
  });

  it("matches legacy formula for a sampled row with fully available pricing", () => {
    const bundle = buildRealBundle("eu");
    const rows = deriveBmCrafterRows(bundle, {
      selectedTier: null,
      selectedEnchant: null,
      minSold: 0,
      searchTerm: "",
      returnRate: 0.1525,
      sortByDailyTop: false,
      showOnlyProfitable: false
    });

    const sample = rows.find((row) => {
      const tier = parseTier(row.item.id);
      if (!tier) return false;
      return row.recipe.materials.every((m) => {
        const key = row.enchant > 0 ? `T${tier}_${m.itemId}_LEVEL${row.enchant}@${row.enchant}` : `T${tier}_${m.itemId}`;
        return bundle.materials.byItemId.has(key);
      });
    });

    expect(sample).toBeTruthy();
    if (!sample) return;

    const tier = parseTier(sample.item.id);
    const enchant = parseEnchant(sample.item.id);
    const recipe = bundle.recipes.byItemId.get(normalizeItemId(sample.item.id));
    expect(tier).toBeTruthy();
    expect(recipe).toBeTruthy();
    if (!tier || !recipe) return;

    let materialSum = 0;
    for (const mat of recipe.materials) {
      const matKey = enchant > 0 ? `T${tier}_${mat.itemId}_LEVEL${enchant}@${enchant}` : `T${tier}_${mat.itemId}`;
      const unit = bundle.materials.byItemId.get(matKey);
      expect(unit).toBeTypeOf("number");
      materialSum += (unit as number) * mat.qty;
    }

    let craftCost = materialSum;
    if (recipe.artifactId) {
      const artefactKey = `T${tier}_${recipe.artifactId}`;
      const artefactPrice = bundle.artefacts.byItemId.get(artefactKey);
      if (typeof artefactPrice === "number") {
        craftCost += artefactPrice;
      }
    }
    craftCost = craftCost * (1 - 0.1525);

    expect(sample.economics.craftCost).toBeCloseTo(craftCost, 6);
    expect(sample.economics.profit).toBeCloseTo((sample.item.bm as number) - craftCost, 6);
  });
});
