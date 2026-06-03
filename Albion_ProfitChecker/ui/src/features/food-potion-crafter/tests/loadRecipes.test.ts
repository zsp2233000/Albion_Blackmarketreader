import { afterEach, describe, expect, it, vi } from "vitest";
import { loadRecipes } from "../data";

function mockFetchOnce(payload: unknown) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => ({ ok: true, json: async () => payload })) as unknown as typeof fetch
  );
}

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("loadRecipes field preservation", () => {
  it("keeps fishSauceQty / enchantable so food enchant variants can be built", async () => {
    mockFetchOnce({
      recipes: [
        {
          itemId: "T8_MEAL_STEW",
          name: "Beef Stew",
          tier: 8,
          category: "food",
          outputQty: 10,
          fishSauceQty: 45,
          enchantable: true,
          ingredients: [{ itemId: "T8_A", name: "A", qty: 4, tier: 8 }],
        },
      ],
    });
    const [recipe] = await loadRecipes("food");
    expect(recipe.fishSauceQty).toBe(45);
    expect(recipe.enchantable).toBe(true);
    expect(recipe.arcaneExtractQty).toBeUndefined();
  });

  it("keeps arcaneExtractQty so potion enchant variants can be built", async () => {
    mockFetchOnce({
      recipes: [
        {
          itemId: "T6_POTION_HEAL",
          name: "Major Healing Potion",
          tier: 6,
          category: "potion",
          outputQty: 5,
          arcaneExtractQty: 45,
          enchantable: true,
          ingredients: [{ itemId: "T6_FOXGLOVE", name: "Foxglove", qty: 72, tier: 6 }],
        },
      ],
    });
    const [recipe] = await loadRecipes("potion");
    expect(recipe.arcaneExtractQty).toBe(45);
    expect(recipe.enchantable).toBe(true);
  });

  it("derives enchantable from a positive enchant quantity even without the flag", async () => {
    mockFetchOnce({
      recipes: [
        {
          itemId: "T4_POTION_HEAL",
          name: "Minor Healing Potion",
          tier: 4,
          category: "potion",
          outputQty: 5,
          arcaneExtractQty: 15,
          ingredients: [{ itemId: "T4_BURDOCK", name: "Burdock", qty: 24, tier: 4 }],
        },
      ],
    });
    const [recipe] = await loadRecipes("potion");
    expect(recipe.enchantable).toBe(true);
  });

  it("preserves the non-returnable flag (Avalonian Energy) on ingredients", async () => {
    mockFetchOnce({
      recipes: [
        {
          itemId: "T8_MEAL_STEW_AVALON",
          name: "Avalonian Beef Stew",
          tier: 8,
          category: "food",
          outputQty: 10,
          ingredients: [
            { itemId: "T8_A", name: "A", qty: 4, tier: 8 },
            { itemId: "QUESTITEM_TOKEN_AVALON", name: "Avalonian Energy", qty: 10, tier: 6, returnable: false },
          ],
        },
      ],
    });
    const [recipe] = await loadRecipes("food");
    const token = recipe.ingredients.find((i) => i.itemId === "QUESTITEM_TOKEN_AVALON");
    expect(token?.returnable).toBe(false);
  });
});
