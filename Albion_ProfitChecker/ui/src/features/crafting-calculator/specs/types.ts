export type SpecStation = "warrior" | "hunter" | "mage" | "toolmaker";

/** Spec level per individual item id (0-100). */
export type CraftingSpecMap = Record<string, number>;

/** Mastery level per mastery group key (0-100). One mastery per category/group. */
export type CraftingMasteryMap = Record<string, number>;

export interface CraftingProgress {
  specs: CraftingSpecMap;
  masteries: CraftingMasteryMap;
}
