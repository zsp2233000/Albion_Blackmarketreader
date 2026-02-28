import type {
  BmRecipe,
  CalculateItemEconomicsInput,
  ItemEconomics,
  MaterialCostResult
} from "./types";

export function parseTier(id: string): number | null {
  const match = String(id || "").match(/^T(\d+)_/);
  return match ? Number(match[1]) : null;
}

export function parseEnchant(id: string): number {
  const match = String(id || "").match(/@(\d+)/);
  return match ? Number(match[1]) : 0;
}

export function normalizeItemId(id: string): string {
  return String(id || "").replace(/^T\d+_/, "").replace(/@\d+$/, "");
}

export function buildMaterialId(base: string, tier: number, enchant: number): string | null {
  if (!base || !tier) return null;
  if (Number.isFinite(enchant) && enchant > 0) {
    return `T${tier}_${base}_LEVEL${enchant}@${enchant}`;
  }
  return `T${tier}_${base}`;
}

export function buildArtefactId(artefactId: string, tier: number): string | null {
  if (!artefactId || !tier) return null;
  return `T${tier}_${artefactId}`;
}

export function normalizeReturnRatePercent(rawPercent: number, min = 15.25, max = 60): number {
  if (!Number.isFinite(rawPercent)) return min;
  return Math.max(min, Math.min(max, rawPercent));
}

export function returnRatePercentToDecimal(rawPercent: number): number {
  return normalizeReturnRatePercent(rawPercent) / 100;
}

export function getMaterialPriceFromMap(
  materialMap: Map<string, number>,
  name: string,
  tier: number,
  enchant: number
): number | null {
  if (!name) return null;
  const fullKey = buildMaterialId(name, tier, enchant);
  if (fullKey && materialMap.has(fullKey)) return materialMap.get(fullKey) ?? null;
  if (materialMap.has(name)) return materialMap.get(name) ?? null;
  return null;
}

export function getArtefactPriceFromMap(
  artefactMap: Map<string, number>,
  artefactId: string,
  tier: number
): number | null {
  const key = buildArtefactId(artefactId, tier);
  if (!key) return null;
  return artefactMap.get(key) ?? null;
}

export function calculateMaterialCost(
  recipe: BmRecipe,
  tier: number,
  enchant: number,
  getMaterialPrice: (materialId: string, tier: number, enchant: number) => number | null
): MaterialCostResult {
  let sum = 0;
  let hasPrice = false;

  for (const mat of recipe.materials) {
    const unit = getMaterialPrice(mat.itemId, tier, enchant);
    if (typeof unit === "number") {
      sum += unit * Number(mat.qty || 0);
      hasPrice = true;
    }
  }

  return { sum, hasPrice };
}

export function calculateItemEconomics(input: CalculateItemEconomicsInput): ItemEconomics | null {
  const { item, recipe, returnRate, getMaterialPrice, getArtefactPrice } = input;
  if (!recipe || !Array.isArray(recipe.materials)) return null;
  const bmPrice = item.bm;
  if (typeof bmPrice !== "number" || !Number.isFinite(bmPrice)) return null;

  const tier = parseTier(item.id);
  if (!tier) return null;
  const enchant = parseEnchant(item.id);

  const materialCost = calculateMaterialCost(recipe, tier, enchant, getMaterialPrice);
  if (!materialCost.hasPrice) return null;

  let craftCost = materialCost.sum;
  if (recipe.artifactId) {
    const artefactPrice = getArtefactPrice(recipe.artifactId, tier);
    if (typeof artefactPrice !== "number" || !Number.isFinite(artefactPrice)) return null;
    craftCost += artefactPrice;
  }
  craftCost = craftCost * (1 - returnRate);

  const profit = bmPrice - craftCost;
  if (!Number.isFinite(profit)) return null;

  const dailyPotential = Number.isFinite(item.sold) ? profit * Number(item.sold) : null;
  const profitPct = craftCost > 0 ? (profit / craftCost) * 100 : null;

  return {
    craftCost,
    profit,
    dailyPotential,
    profitPct: Number.isFinite(profitPct) ? profitPct : null
  };
}
