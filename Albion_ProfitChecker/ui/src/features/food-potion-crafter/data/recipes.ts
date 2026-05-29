import type { ConsumableCategory, ConsumableRecipe, RecipeIngredient } from "../core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function normalizeIngredient(entry: unknown): RecipeIngredient | null {
  if (!isRecord(entry)) return null;
  const itemId = String(entry.itemId || "").trim();
  if (!itemId) return null;
  const ingredient: RecipeIngredient = {
    itemId,
    name: typeof entry.name === "string" ? entry.name : itemId,
    qty: Math.max(0, toFiniteNumber(entry.qty, 0)),
    tier: toFiniteNumber(entry.tier, 1),
  };
  if (entry.rare === true) {
    return { ...ingredient, rare: true };
  }
  return ingredient;
}

function normalizeRecipe(entry: unknown, fallbackCategory: ConsumableCategory): ConsumableRecipe | null {
  if (!isRecord(entry)) return null;
  const itemId = String(entry.itemId || "").trim();
  if (!itemId) return null;

  const ingredients = (Array.isArray(entry.ingredients) ? entry.ingredients : [])
    .map(normalizeIngredient)
    .filter((value): value is RecipeIngredient => value !== null);
  if (!ingredients.length) return null;

  const category: ConsumableCategory = entry.category === "potion" || entry.category === "food" ? entry.category : fallbackCategory;

  const baseFocus = toFiniteNumber(entry.baseFocus, 0);

  return {
    itemId,
    name: typeof entry.name === "string" ? entry.name : itemId,
    tier: toFiniteNumber(entry.tier, 1),
    category,
    outputQty: Math.max(1, toFiniteNumber(entry.outputQty, 1)),
    isAvalonian: entry.isAvalonian === true,
    baseFocus: baseFocus > 0 ? baseFocus : undefined,
    ingredients,
  };
}

function recipesFile(category: ConsumableCategory): string {
  return `/data/recipes-${category === "food" ? "food" : "potions"}.json`;
}

export async function loadRecipes(category: ConsumableCategory): Promise<ConsumableRecipe[]> {
  const payload = await fetch(recipesFile(category))
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  const root = isRecord(payload) ? payload : {};
  const list = Array.isArray(root.recipes) ? root.recipes : [];
  return list
    .map((entry) => normalizeRecipe(entry, category))
    .filter((value): value is ConsumableRecipe => value !== null);
}

export async function loadIngredients(): Promise<RecipeIngredient[]> {
  const payload = await fetch("/data/consumable-ingredients.json")
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null);

  const root = isRecord(payload) ? payload : {};
  const list = Array.isArray(root.ingredients) ? root.ingredients : [];
  return list
    .map(normalizeIngredient)
    .filter((value): value is RecipeIngredient => value !== null);
}
