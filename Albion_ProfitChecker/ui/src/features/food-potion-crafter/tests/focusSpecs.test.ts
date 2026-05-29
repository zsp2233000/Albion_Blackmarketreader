import { describe, expect, it } from "vitest";
import {
  applyFocusEfficiency,
  computeFocusEfficiency,
  normalizeProgress,
  resolveSpecFamily,
} from "../specs/data";
import type { CraftingProgress } from "../specs/data";

function progress(food: Partial<{ mastery: number; specs: Record<string, number> }>): CraftingProgress {
  return normalizeProgress({ food: { mastery: food.mastery ?? 0, specs: food.specs ?? {} }, potion: { mastery: 0, specs: {} } });
}

describe("food/potion focus specs", () => {
  it("maps item ids to the correct spec family", () => {
    expect(resolveSpecFamily("T8_MEAL_STEW", "food")).toBe("stew");
    expect(resolveSpecFamily("T5_MEAL_SOUP", "food")).toBe("soup");
    expect(resolveSpecFamily("T8_MEAT", "food")).toBe("butcher");
    expect(resolveSpecFamily("T4_BREAD", "food")).toBe("ingredient");
    expect(resolveSpecFamily("T6_POTION_HEAL", "potion")).toBe("heal");
    expect(resolveSpecFamily("T8_POTION_STONESKIN", "potion")).toBe("resistance");
    expect(resolveSpecFamily("T6_ALCOHOL", "potion")).toBe("alcohol");
  });

  it("food active family gets 280/level, others 30/level, mastery 30/level", () => {
    // Active = stew at 100 -> 28000 ; +mastery 100 -> +3000 ; +another spec (soup 50) -> +1500
    const p = progress({ mastery: 100, specs: { stew: 100, soup: 50 } });
    const eff = computeFocusEfficiency(p, "food", "stew");
    expect(eff).toBe(100 * 280 + 100 * 30 + 50 * 30); // 28000 + 3000 + 1500 = 32500
  });

  it("workbook Beef Stew efficiency reproduces exactly (34810)", () => {
    // Backend Food Crafting spec levels: Butcher55, Ingredient61, Sandwich0, Stew94(active),
    // Omelette60, Roast0, Pie50, Salad27, Soup30 ; mastery 0.
    const p = progress({
      mastery: 0,
      specs: { butcher: 55, ingredient: 61, sandwich: 0, stew: 94, omelette: 60, roast: 0, pie: 50, salad: 27, soup: 30 },
    });
    const eff = computeFocusEfficiency(p, "food", "stew");
    expect(eff).toBe(34810);
    // base 551 -> 49.3 effective focus
    expect(applyFocusEfficiency(551, eff)).toBeCloseTo(49.35, 1);
  });

  it("potion active family gets 268/level, others 18/level", () => {
    const p = normalizeProgress({ food: { mastery: 0, specs: {} }, potion: { mastery: 100, specs: { heal: 100, energy: 100 } } });
    const eff = computeFocusEfficiency(p, "potion", "heal");
    expect(eff).toBe(100 * 268 + 100 * 18 + 100 * 30); // active 26800 + other 1800 + mastery 3000
  });
});
