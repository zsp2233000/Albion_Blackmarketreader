import type { ConsumableCategory } from "../core";

export const SPEC_LEVEL_MIN = 0;
export const SPEC_LEVEL_MAX = 100;

/**
 * Focus cost efficiency model — verified exactly against the community workbook
 * (Backend Food/Potion Crafting tabs).
 *
 *   focus = baseFocus * 0.5^(efficiency / 10000)
 *   efficiency = mastery * MASTERY_PER_LEVEL
 *              + activeSpecLevel * activePerLevel
 *              + Σ(otherSpecLevel * otherPerLevel)
 *
 * Food:   mastery 30, active spec 280, other specs 30  (Beef Stew lvls -> 34810 eff exact)
 * Potion: mastery 30, active spec 268, other specs 18  (all-100 set -> matches sheet)
 */
export const MASTERY_PER_LEVEL = 30;
export const FOCUS_EFFICIENCY_HALF_LIFE = 10000;

export const PER_LEVEL: Record<ConsumableCategory, { active: number; other: number }> = {
  food: { active: 280, other: 30 },
  potion: { active: 268, other: 18 },
};

export interface SpecFamily {
  key: string;
  label: string;
}

/** Cook specialization nodes (Chef mastery → these sub-specs). */
export const FOOD_FAMILIES: ReadonlyArray<SpecFamily> = [
  { key: "soup", label: "Soup" },
  { key: "salad", label: "Salad" },
  { key: "pie", label: "Pie" },
  { key: "omelette", label: "Omelette" },
  { key: "roast", label: "Roast" },
  { key: "stew", label: "Stew" },
  { key: "sandwich", label: "Sandwich" },
  { key: "butcher", label: "Butcher (Raw Meat)" },
  { key: "ingredient", label: "Ingredient (Flour/Bread/Butter/Sauce)" },
];

/** Alchemist specialization nodes. */
export const POTION_FAMILIES: ReadonlyArray<SpecFamily> = [
  { key: "heal", label: "Healing" },
  { key: "energy", label: "Energy" },
  { key: "resistance", label: "Resistance" },
  { key: "sticky", label: "Sticky / Slowfield" },
  { key: "poison", label: "Poison" },
  { key: "invisibility", label: "Invisibility" },
  { key: "cooldown", label: "Cooldown" },
  { key: "gathering", label: "Gathering" },
  { key: "acid", label: "Acid" },
  { key: "berserk", label: "Berserk" },
  { key: "hellfire", label: "Hellfire / Lava" },
  { key: "tornado", label: "Tornado" },
  { key: "revive", label: "Revive" },
  { key: "calming", label: "Calming" },
  { key: "cleansing", label: "Cleansing / Mob Reset" },
  { key: "alcohol", label: "Alcohol (Intermediate)" },
];

export function familiesForCategory(category: ConsumableCategory): ReadonlyArray<SpecFamily> {
  return category === "food" ? FOOD_FAMILIES : POTION_FAMILIES;
}

/** Map an item id to its spec family key (active node). Matches workbook REGEXMATCH logic. */
export function resolveSpecFamily(itemId: string, category: ConsumableCategory): string | null {
  const id = String(itemId || "").toUpperCase();
  if (category === "food") {
    if (/MEAT/.test(id)) return "butcher";
    if (/FLOUR|BREAD|BUTTER|FISHSAUCE/.test(id)) return "ingredient";
    if (/SANDWICH/.test(id)) return "sandwich";
    if (/STEW/.test(id)) return "stew";
    if (/OMELETTE/.test(id)) return "omelette";
    if (/ROAST/.test(id)) return "roast";
    if (/PIE/.test(id)) return "pie";
    if (/SALAD|SEAWEEDSALAD/.test(id)) return "salad";
    if (/SOUP|GRILLEDFISH/.test(id)) return "soup";
    return null;
  }
  if (/ALCOHOL|SCHNAPPS|HOOCH|MOONSHINE/.test(id)) return "alcohol";
  if (/HEAL/.test(id)) return "heal";
  if (/ENERGY/.test(id)) return "energy";
  if (/STONESKIN|RESIST/.test(id)) return "resistance";
  if (/SLOWFIELD|STICKY/.test(id)) return "sticky";
  if (/POISON/.test(id)) return "poison";
  if (/INVIS|STEALTH/.test(id)) return "invisibility";
  if (/COOLDOWN/.test(id)) return "cooldown";
  if (/GATHER/.test(id)) return "gathering";
  if (/ACID/.test(id)) return "acid";
  if (/BERSERK/.test(id)) return "berserk";
  if (/LAVA|HELLFIRE/.test(id)) return "hellfire";
  if (/TORNADO/.test(id)) return "tornado";
  if (/REVIVE/.test(id)) return "revive";
  if (/CLEANSE2|CALM/.test(id)) return "calming";
  if (/CLEANSE|MOB_RESET/.test(id)) return "cleansing";
  return null;
}

export interface CategoryProgress {
  mastery: number;
  specs: Record<string, number>;
}

export interface CraftingProgress {
  food: CategoryProgress;
  potion: CategoryProgress;
}

export const EMPTY_PROGRESS: CraftingProgress = {
  food: { mastery: 0, specs: {} },
  potion: { mastery: 0, specs: {} },
};

export function clampSpecLevel(value: unknown): number {
  const num = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(num)) return SPEC_LEVEL_MIN;
  return Math.max(SPEC_LEVEL_MIN, Math.min(SPEC_LEVEL_MAX, Math.round(num)));
}

function normalizeCategory(raw: unknown, families: ReadonlyArray<SpecFamily>): CategoryProgress {
  const obj = (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>;
  const specsRaw = (obj.specs && typeof obj.specs === "object" ? obj.specs : {}) as Record<string, unknown>;
  const specs: Record<string, number> = {};
  for (const fam of families) {
    const lvl = clampSpecLevel(specsRaw[fam.key] ?? 0);
    if (lvl > 0) specs[fam.key] = lvl;
  }
  return { mastery: clampSpecLevel(obj.mastery ?? 0), specs };
}

export function normalizeProgress(raw: unknown): CraftingProgress {
  if (!raw || typeof raw !== "object") return { food: { mastery: 0, specs: {} }, potion: { mastery: 0, specs: {} } };
  const obj = raw as Record<string, unknown>;
  return {
    food: normalizeCategory(obj.food, FOOD_FAMILIES),
    potion: normalizeCategory(obj.potion, POTION_FAMILIES),
  };
}

/**
 * Total focus cost efficiency for crafting a given item.
 * Active family node gets the high per-level value; all other nodes give the mutual value.
 */
export function computeFocusEfficiency(
  progress: CraftingProgress,
  category: ConsumableCategory,
  activeFamily: string | null
): number {
  const cat = progress[category];
  const families = familiesForCategory(category);
  const perLevel = PER_LEVEL[category];

  let eff = clampSpecLevel(cat.mastery) * MASTERY_PER_LEVEL;
  for (const fam of families) {
    const lvl = clampSpecLevel(cat.specs[fam.key] ?? 0);
    if (lvl <= 0) continue;
    eff += lvl * (fam.key === activeFamily ? perLevel.active : perLevel.other);
  }
  return eff;
}

export function applyFocusEfficiency(baseFocus: number, efficiency: number): number {
  if (!Number.isFinite(baseFocus) || baseFocus <= 0) return 0;
  return baseFocus * Math.pow(0.5, Math.max(0, efficiency) / FOCUS_EFFICIENCY_HALF_LIFE);
}
