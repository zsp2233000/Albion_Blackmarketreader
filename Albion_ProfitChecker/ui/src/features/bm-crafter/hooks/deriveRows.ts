import {
  calculateItemEconomics,
  getArtefactPriceFromMap,
  getMaterialPriceFromMap,
  normalizeItemId,
  parseEnchant,
  parseTier
} from "../domain";
import type { BmCrafterDataBundle } from "../data";
import type { BmCrafterFilters, BmCrafterRow } from "./types";

const MIN_PROFIT_PCT = 20;

function toSearchKey(value: string): string {
  return String(value || "").toLowerCase().replace(/\s+/g, " ").trim();
}

function toDisplayName(itemId: string, recipeName?: string): string {
  if (recipeName) return recipeName;
  const base = normalizeItemId(itemId).replace(/_/g, " ").trim();
  return base || itemId;
}

export function deriveBmCrafterRows(bundle: BmCrafterDataBundle | null, filters: BmCrafterFilters): BmCrafterRow[] {
  if (!bundle) return [];

  const recipeMap = bundle.recipes.byItemId;
  const rows: BmCrafterRow[] = [];
  const search = toSearchKey(filters.searchTerm);

  const cityEntries = bundle.cityMaterials ? Array.from(bundle.cityMaterials.entries()) : [];
  const cityMaterialsFlat: Map<string, number> = cityEntries.length > 0
    ? new Map(cityEntries.map(([itemId, prices]) => [itemId, prices[filters.craftCity] ?? 0]))
    : bundle.materials.byItemId;
  let rowCounter = 0;

  for (const item of bundle.market.items) {
    const id = item.id || "";
    if (/_ROYAL(\b|_)/i.test(id)) continue;
    if (/SHAPESHIFTER/i.test(id)) continue;

    const tier = parseTier(id);
    const enchant = parseEnchant(id);

    if (filters.selectedTier !== null && tier !== filters.selectedTier) continue;
    if (filters.selectedEnchant !== null && enchant !== filters.selectedEnchant) continue;

    const sold = Number(item.sold || 0);
    if (sold < filters.minSold) continue;

    const baseId = normalizeItemId(id);
    const recipe = recipeMap.get(baseId);
    if (!recipe) continue;

    const displayName = toDisplayName(id, recipe.name);
    if (search) {
      const idKey = toSearchKey(baseId.replace(/_/g, " "));
      const nameKey = toSearchKey(displayName);
      if (!idKey.includes(search) && !nameKey.includes(search)) continue;
    }

    const materialMap = cityMaterialsFlat;
    const economics = calculateItemEconomics({
      item,
      recipe,
      returnRate: filters.returnRate,
      usageFeePer100: filters.usageFeePer100,
      getMaterialPrice: (materialId, t, e) => getMaterialPriceFromMap(materialMap, materialId, t, e),
      getArtefactPrice: (artefactId, t) => getArtefactPriceFromMap(bundle.artefacts.byItemId, artefactId, t)
    });

    if (!economics) continue;
    if (filters.showOnlyProfitable && economics.profit < 0) continue;
    if (!Number.isFinite(economics.profitPct) || (economics.profitPct as number) < MIN_PROFIT_PCT) continue;

    rows.push({
      rowKey: `${item.id}#${rowCounter}`,
      item,
      recipe,
      economics,
      tier,
      enchant,
      displayName
    });
    rowCounter += 1;
  }

  return rows.sort((a, b) => {
    if (filters.sortByDailyTop) {
      const aDaily = Number.isFinite(a.economics.dailyPotential) ? (a.economics.dailyPotential as number) : -Infinity;
      const bDaily = Number.isFinite(b.economics.dailyPotential) ? (b.economics.dailyPotential as number) : -Infinity;
      return bDaily - aDaily;
    }
    const aPct = Number.isFinite(a.economics.profitPct) ? (a.economics.profitPct as number) : -Infinity;
    const bPct = Number.isFinite(b.economics.profitPct) ? (b.economics.profitPct as number) : -Infinity;
    return bPct - aPct;
  });
}
