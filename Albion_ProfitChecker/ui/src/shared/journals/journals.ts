/**
 * Crafting-journal ("book") profit model.
 *
 * When you craft gear you earn crafting fame; if you slot an empty artisan journal it soaks up
 * that fame and, once full, sells for more than the empty one cost. The extra silver per craft
 * can turn a break-even craft profitable — this module computes it.
 *
 * Constants are cross-verified against ao-bin-dumps items.xml (journal `maxfame`) and the
 * community reference workbook (fame-per-resource and the tax treatment). See computeJournalProfit.
 */

export type JournalProfession = "warrior" | "hunter" | "mage" | "toolmaker";

/** Human labels + the in-game journal item-id stem per profession. */
export const JOURNAL_PROFESSIONS: Record<JournalProfession, { label: string; journalName: string; stem: string }> = {
  warrior: { label: "Warrior (Blacksmith)", journalName: "Blacksmith's Journal", stem: "JOURNAL_WARRIOR" },
  hunter: { label: "Hunter (Fletcher)", journalName: "Fletcher's Journal", stem: "JOURNAL_HUNTER" },
  mage: { label: "Mage (Imbuer)", journalName: "Imbuer's Journal", stem: "JOURNAL_MAGE" },
  toolmaker: { label: "Toolmaker (Tinker)", journalName: "Tinker's Journal", stem: "JOURNAL_TOOLMAKER" },
};

/** Fame capacity of one journal, by tier — items.xml `maxfame` (identical across professions). */
export const JOURNAL_CAPACITY: Record<number, number> = {
  2: 900,
  3: 1800,
  4: 3600,
  5: 7200,
  6: 14400,
  7: 28380,
  8: 58590,
};

/**
 * Crafting fame earned per unit of resource consumed, by tier (doubles per tier, like item value).
 * Hard-coded in the reference workbook (T4 = 22.5); lower tiers extrapolated by the same doubling.
 */
export const FAME_PER_RESOURCE: Record<number, number> = {
  2: 5.625,
  3: 11.25,
  4: 22.5,
  5: 45,
  6: 90,
  7: 180,
  8: 360,
};

/** Full-journal sales tax kept by the crafter: 6.5% premium sales tax (0.935), per the workbook. */
export const JOURNAL_SALE_KEEP = 0.935;

/**
 * Crafting station → journal mapping (Albion Destiny Board). Item categories are keyed by the
 * project's category-key vocabulary (see items-categorized-crafting.json). Armor is resolved from
 * the item id (plate/leather/cloth) since one armor category spans all three professions.
 *
 * If any assignment is ever disputed, this is the single place to correct it.
 */
const PROFESSION_BY_CATEGORY: Record<string, JournalProfession> = {
  // Warrior's Forge (Blacksmith)
  swords: "warrior",
  axes: "warrior",
  maces: "warrior",
  hammers: "warrior",
  crossbows: "warrior",
  daggers: "warrior",
  quarterstaffs: "warrior",
  gloves: "warrior",
  // Hunter's Lodge (Fletcher)
  bows: "hunter",
  spears: "hunter",
  nature: "hunter",
  // Mage's Tower (Imbuer)
  arcane: "mage",
  cursed: "mage",
  fire: "mage",
  frost: "mage",
  holy: "mage",
  shapeshifter: "mage",
  // Toolmaker (Tinker)
  offhand: "toolmaker",
  bags: "toolmaker",
  capes: "toolmaker",
  tools: "toolmaker",
  "gathering-gear": "toolmaker",
};

/** Resolve the journal profession an item's crafting fame feeds into. Returns null if unknown. */
export function professionForItem(categoryKey: string | null | undefined, itemId: string): JournalProfession | null {
  const key = String(categoryKey ?? "").trim();
  if (key === "armor-head" || key === "armor-chest" || key === "armor-shoes") {
    const id = itemId.toUpperCase();
    if (id.includes("PLATE")) return "warrior";
    if (id.includes("LEATHER")) return "hunter";
    if (id.includes("CLOTH")) return "mage";
    return null;
  }
  return PROFESSION_BY_CATEGORY[key] ?? null;
}

/** Artifact fame multiplier from an artifact item id (items.xml `craftfamefactor`). Plain = 1.0. */
export function resolveCraftFameFactor(artifactId: string | null | undefined): number {
  const id = String(artifactId ?? "").toUpperCase();
  if (!id) return 1;
  if (/AVALON|CRYSTAL/.test(id)) return 1.4;
  if (/RELIC|MORGANA/.test(id)) return 1.3;
  if (/SOUL|HELL|DEMON|UNDEAD/.test(id)) return 1.2;
  if (/RUNE|KEEPER/.test(id)) return 1.1;
  return 1;
}

/** In-game item ids of the empty (buy) and full (sell) journal for a profession + tier. */
export function journalItemIds(profession: JournalProfession, tier: number): { empty: string; full: string } {
  const stem = JOURNAL_PROFESSIONS[profession].stem;
  return { empty: `T${tier}_${stem}_EMPTY`, full: `T${tier}_${stem}_FULL` };
}

export interface JournalProfitInput {
  tier: number;
  /** Total count of resources consumed by the recipe for one craft (Σ material quantities). */
  totalResourceCount: number;
  /** Artifact fame multiplier (see resolveCraftFameFactor); 1 for plain items. */
  craftFameFactor?: number;
  /** Market price of the empty journal (what you pay to slot it). */
  journalEmptyBuy: number;
  /** Market price of the full journal (what you sell it for). */
  journalFullSell: number;
}

export interface JournalProfitResult {
  /** Crafting fame produced by one craft. */
  famePerCraft: number;
  /** Fraction of a journal filled by one craft (fame / capacity). */
  journalsFilled: number;
  /** Net silver from selling one full journal minus buying one empty (tax applied to the sale). */
  profitPerJournal: number;
  /** Extra profit attributable to one craft: journalsFilled × profitPerJournal. */
  journalProfit: number;
  /** False when the tier has no journal or prices are missing/non-positive. */
  available: boolean;
}

const EMPTY_RESULT: JournalProfitResult = {
  famePerCraft: 0,
  journalsFilled: 0,
  profitPerJournal: 0,
  journalProfit: 0,
  available: false,
};

/**
 * Extra profit per single craft from filling journals with the fame that craft generates.
 *
 *   famePerCraft      = totalResourceCount × famePerResource[tier] × craftFameFactor
 *   journalsFilled    = famePerCraft / journalCapacity[tier]
 *   profitPerJournal  = fullSell × 0.935 − emptyBuy
 *   journalProfit     = journalsFilled × profitPerJournal
 */
export function computeJournalProfit(input: JournalProfitInput): JournalProfitResult {
  const tier = Math.floor(input.tier);
  const capacity = JOURNAL_CAPACITY[tier];
  const famePerResource = FAME_PER_RESOURCE[tier];
  const resources = Math.max(0, input.totalResourceCount);
  const factor = input.craftFameFactor && input.craftFameFactor > 0 ? input.craftFameFactor : 1;

  if (!capacity || !famePerResource || resources <= 0) return EMPTY_RESULT;

  const emptyBuy = Math.max(0, input.journalEmptyBuy);
  const fullSell = Math.max(0, input.journalFullSell);
  if (emptyBuy <= 0 || fullSell <= 0) {
    const famePerCraft = resources * famePerResource * factor;
    return { ...EMPTY_RESULT, famePerCraft, journalsFilled: famePerCraft / capacity };
  }

  const famePerCraft = resources * famePerResource * factor;
  const journalsFilled = famePerCraft / capacity;
  const profitPerJournal = fullSell * JOURNAL_SALE_KEEP - emptyBuy;
  // Filling a journal is optional: if a full journal sells for less than the empty one costs,
  // you simply don't fill it, so it never subtracts from the craft's profit.
  const journalProfit = journalsFilled * Math.max(0, profitPerJournal);

  return { famePerCraft, journalsFilled, profitPerJournal, journalProfit, available: true };
}
