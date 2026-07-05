import type { ConsumableCategory, ConsumableRecipe, RecipeIngredient } from "../core";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

// Intermediate cooking/alchemy goods that the source data flags as enchantable
// (fishSauceQty/arcaneExtractQty > 0) but which have NO enchant variants in-game.
// Force them non-enchantable so no bogus .1/.2/.3 rows or focus values are produced.
const NON_ENCHANTABLE_BASES = new Set(["FLOUR", "MEAT", "BREAD", "ALCOHOL"]);

function recipeBaseKey(itemId: string): string {
  return itemId.replace(/^T\d+_/, "").replace(/@\d+$/, "").toUpperCase();
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
    ...(entry.rare === true ? { rare: true } : {}),
    // Preserve the no-return flag (e.g. Avalonian Energy) so the return rate excludes it.
    ...(entry.returnable === false ? { returnable: false } : {}),
  };
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
  const itemValue = toFiniteNumber(entry.itemValue, 0);
  const focus = Array.isArray(entry.focus)
    ? entry.focus.map((value) => Math.max(0, toFiniteNumber(value, 0)))
    : undefined;
  // Enchant material requirement (fish sauce for food, arcane extract for potions).
  // Must be preserved here or the scanner/crafter can never build the .1/.2/.3 enchant variants.
  const forcedNonEnchant = NON_ENCHANTABLE_BASES.has(recipeBaseKey(itemId));
  const fishSauceQty = forcedNonEnchant ? 0 : Math.max(0, toFiniteNumber(entry.fishSauceQty, 0));
  const arcaneExtractQty = forcedNonEnchant ? 0 : Math.max(0, toFiniteNumber(entry.arcaneExtractQty, 0));
  const enchantable = !forcedNonEnchant && (entry.enchantable === true || fishSauceQty > 0 || arcaneExtractQty > 0);

  return {
    itemId,
    name: typeof entry.name === "string" ? entry.name : itemId,
    tier: toFiniteNumber(entry.tier, 1),
    category,
    outputQty: Math.max(1, toFiniteNumber(entry.outputQty, 1)),
    isAvalonian: entry.isAvalonian === true,
    baseFocus: baseFocus > 0 ? baseFocus : undefined,
    itemValue: itemValue > 0 ? itemValue : undefined,
    focus: focus && focus.length ? focus : undefined,
    fishSauceQty: fishSauceQty > 0 ? fishSauceQty : undefined,
    arcaneExtractQty: arcaneExtractQty > 0 ? arcaneExtractQty : undefined,
    enchantable: enchantable ? true : undefined,
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
