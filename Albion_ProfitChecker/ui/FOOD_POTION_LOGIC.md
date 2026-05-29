# Food & Potion Crafter — Specification

**Status:** Spec only. **Nothing implemented yet.** This document is the source of truth for the next implementation step.

Two new tools, twin-structure (siblings to the existing Refining Calculator):
- **Food Crafter** at `/food-crafter`
- **Potion Crafter** at `/potion-crafter`

OR a combined `/consumable-crafter` with a Food/Potion toggle — to be decided (see [Open Questions](#open-questions)).

---

## 1. Source material reviewed

| Source | Used for |
|--|--|
| `try2blackmarket2222.xlsx` ("Food Crafting", "Potion Crafting", "Backend Food Crafting", "Backend Potion Crafting", "Focus & Fee" sheets) | Recipe data, UI layout, bonus stacking model, ingredient counts per recipe, price-per-city lookup pattern |
| ao-bin-dumps (`items.txt` / `craftingmodifiers.json`) | Item Value, base focus cost, exact ingredient quantities — **must be fetched, not hardcoded** |
| Albion Wiki — [Cooking](https://wiki.albiononline.com/wiki/Cooking), [Potions](https://wiki.albiononline.com/wiki/Potions), [Local Production Bonus](https://wiki.albiononline.com/wiki/Local_Production_Bonus), [Resource Return Rate](https://wiki.albiononline.com/wiki/Resource_return_rate) | Confirmed mechanics |
| Albion Codex — [Return Rate Explained](https://www.albioncodex.com/guides/albion-online-return-rate-explained), [Best City to Craft](https://www.albioncodex.com/guides/best-city-to-craft-albion-online) | Confirmed bonus city assignments |
| SBI Dev Tracker — [Usage Fee + Crafting Changes, Lands Awakened](https://devtrackers.gg/albion/p/510446ae-usage-fee-and-crafting-changes-lands-awakened-update) | Station fee formula |

---

## 2. Game mechanics (Albion-correct)

### 2.1 Craft locations & bonus cities

| Category | Station | Local Production Bonus city | Confirmed by |
|--|--|--|--|
| Food | Cook | **Caerleon** (+15% on top of +18% Royal base) | Wiki, Codex |
| Potions | Alchemist's Lab | **Brecilien** (+15% on top of +18% Royal base) | Wiki, Codex |

### 2.2 Return Rate (RRR) — same layered model as equipment

```
returnRate = 1 - 1 / (1 + bonusPercent/100)
```

Bonus stacking (additive on the percent side, multiplicative on the rate side via the formula above):
- **Royal base**: +18% → ~15.25% effective return
- **City crafting bonus**: +40% (only when crafting in the matching bonus city — Caerleon for food, Brecilien for potions)
- **Focus**: +59% (toggle)
- **Hideout (with hideout-power-based variant)**: see [§2.4](#24-hideout--island)
- **Island/own station**: 0% (no return at all)
- **Daily bonus**: +10% / +20% events (rare)

Same `1 - 1/(1+bonus/100)` formula as Refining Calculator. **Re-use that pure function.**

### 2.3 Focus cost

```
costPerRun = ceil(baseFocusCost / 2^(efficiency / 10000))
efficiency = mastery × 30 + tierSpec × 250
```

Same formula as Refining/Crafting. Specs:
- **Cooking Mastery** (single mastery skill for all food)
- **Cooking Tier Spec** (separate per tier T4-T8)
- **Alchemy Mastery** (single skill for all potions)
- **Alchemy Tier Spec** (separate per tier T4-T8)

`baseFocusCost` per (tier, enchant) **must come from `craftingmodifiers.json`** in ao-bin-dumps. There is no clean public table. Use the same `BASE_FOCUS_COST_BY_POWER` table pattern as in `refiningData.ts`.

### 2.4 Hideout & Island

From the xlsx (`Backend Food Crafting` rows 12–16, formulas `BE14`, `BD12+BI12`):
- **Hideout**: bonus depends on hideout power → multiplier `BD12+BI12` where `BI = IF(N3=TRUE, BE2, 0)` reads from a lookup table per power level. Need to derive hideout-power-to-bonus mapping (likely 0%/3%/6%/9%/12%/15% steps, to verify).
- **Island station**: `IFS(N2=TRUE AND CG3=TRUE, 0.10, N2=TRUE, 0.15, …)` — gives 10% or 15% depending on a secondary toggle (probably whether the island has a faction warp etc.).
- **City station**: full 18% city bonus + matching city's specialty +40%.

For v1 we can simplify to a three-option dropdown (City station / Hideout / Island) and treat hideout-power as a single number with a lookup table — same approach as the xlsx.

### 2.5 Station fee

Standard Lands-Awakened formula:
```
stationFee = itemValue × 0.1125 × usageFeePer100 / 100
```

**Critical difference vs. equipment**: `itemValue` for food/potions is **NOT a clean tier-based table**. It's the **sum of ingredient item values weighted by quantity**:
```
itemValue(recipe) = Σ (ingredient.qty × itemValue(ingredient))
```

Pull every ingredient's `itemvalue` attribute from `items.txt` once at build time and store as a flat lookup. Avalonian recipes will be significantly higher because Avalonian Energy is a high-value ingredient.

### 2.6 Output quantity

Food/Potion recipes craft a **batch** per action (`amountcrafted` in the bin-dumps, almost always **10**). Profit is then `(market_price_per_unit × output_qty) - costs`. Variance in observed yield (e.g. 49 vs 50 craft results) is **per-ingredient RRR rolls returning ingredients**, not output count varying.

### 2.7 No sub-materials

Food/potion ingredients are **direct raw farmables** (crops, meat, eggs, herbs, milk, butter, fish-sauce, animal/sylvian/spirit/werewolf parts). There is no Refining-style "tier-1 refined sub-material" step. Recipe data is therefore a flat list of `{ ingredientId, qty }` pairs.

### 2.8 Market tax

Same as Crafting Calculator:
- Premium Sell Order: 6.5% total (2.5% setup + 4% tax)
- Non-Premium: 10.5% (2.5% + 8%)
- Custom: user-defined

Black Market for food/potions: not relevant (BM doesn't buy these items in bulk like equipment).

---

## 3. Recipe data

### 3.1 Counts (from xlsx Backend sheets)

| Category | Total recipes | Per tier |
|--|--|--|
| **Food** | 68 | T1:7, T2:2, T3:11, T4:11, T5:10, T6:10, T7:8, T8:9 |
| **Potions** | 43 | T2:2, T3:6, T4:7, T5:6, T6:8, T7:7, T8:7 |

T1 food = `Basic Fish Sauce` (1-ingredient recipes, no enchanted variants).

### 3.2 Recipe shape — Food

Per recipe: 1–4 ingredients (Avalonian = 4 incl. `QUESTITEM_TOKEN_AVALON`).
```ts
type FoodRecipe = {
  itemId: string;        // T8_MEAL_SANDWICH_AVALON
  name: string;          // "Avalonian Beef Sandwich"
  tier: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  ingredients: Array<{ itemId: string; qty: number }>;  // length 1..4
  outputQty: number;     // typically 10
};
```

### 3.3 Recipe shape — Potion

Per recipe: 1–3 base ingredients + optional **"fine" ingredient** (animal parts / sylvian root, qty=1, T5-T8). The fine ingredient sits in a separate slot in the xlsx (cols P-R rather than D-O).
```ts
type PotionRecipe = {
  itemId: string;        // T5_POTION_ACID
  name: string;          // "Acid Potion"
  tier: 2 | 3 | 4 | 5 | 6 | 7 | 8;
  ingredients: Array<{ itemId: string; qty: number }>;  // base, length 1..3
  fineIngredient?: { itemId: string; qty: number };     // optional (Fine Spirit Paws etc.)
  outputQty: number;     // typically 10
};
```

For v1 we treat `fineIngredient` as just another entry in `ingredients` — keeps the UI uniform with food.

### 3.4 Recipe source

**Two options:**

**Option A (preferred): generate from ao-bin-dumps**
- Add a refresh script (`scripts/refresh-food-potion-recipes.mjs`) similar to existing data scripts.
- Pull from `items.txt` filtered by `craftingcategory="cooking"` / `"alchemy"`.
- Write to `public/data/recipes-food.json` and `public/data/recipes-potions.json`.

**Option B (faster bootstrap): extract from xlsx once, hardcode**
- One-shot conversion of `Backend Food Crafting` + `Backend Potion Crafting` rows → JSON.
- Quick to get started, but recipes will drift if Albion adds new ones.

Recommend **A long-term, but B to bootstrap the UI quickly** (the xlsx is verified Goldenium data).

### 3.5 Ingredient master list

We need item IDs for every ingredient. From the xlsx we have name→id mapping in the `Z` column. Examples:
- Bread → `T4_BREAD`
- Raw Beef → `T8_MEAT_LIVESTOCK` (assumed; verify)
- Avalonian Energy → `QUESTITEM_TOKEN_AVALON`
- Arcane Agaric → `T2_AGARIC`
- Dragon Teasel → `T5_DRAGONTEASEL`
- Fine Spirit Paws → `T5_ALCHEMY_RARE_SPIRIT`
- Carrots → `T1_CARROT`
- Goats Milk → `T4_MILK`
- ...

**Action**: derive a complete `ingredients-food.json` + `ingredients-potions.json` lookup with `{ name, itemId, itemValue }`. Could also be merged into the recipes file.

---

## 4. Price data

### 4.1 What we need

For every ingredient (raw farmable) and every output (cooked/brewed item), per region, per city:
- 7 cities: Brecilien, Bridgewatch, Caerleon, Fort Sterling, Lymhurst, Martlock, Thetford.
- Ingredients change rarely (farm output, stable supply).
- Outputs change with player crafting volume.

### 4.2 New data files

| File | Shape | Purpose |
|--|--|--|
| `public/data/food-ingredients-{eu\|us}.json` | `Map<itemId, Record<city, number>>` | Raw food ingredient prices |
| `public/data/potion-ingredients-{eu\|us}.json` | `Map<itemId, Record<city, number>>` | Herb / animal-part prices |
| `public/data/food-prices-{eu\|us}.json` | `Map<itemId, Record<city, number>>` | Cooked food sell prices |
| `public/data/potion-prices-{eu\|us}.json` | `Map<itemId, Record<city, number>>` | Potion sell prices |
| `public/data/recipes-food.json` | `FoodRecipe[]` | Recipe definitions |
| `public/data/recipes-potions.json` | `PotionRecipe[]` | Recipe definitions |

Same shape as the existing `materials-cities-{region}.json` to allow re-using normalizers.

### 4.3 Refresh workflow

Extend `scripts/refresh-crafting-data.mjs` (or new sibling) to also fetch food/potion ingredient + output prices from the same upstream data source (AODP — albion-online-data.com or similar). Same `--us` / `--eu` flags. Keep manual override support per cell, same as existing Refining/BM-Crafter pattern.

---

## 5. Calculation core

Pure function, fully unit-testable, **mirrors `refiningCore.ts`**:

```ts
type FoodPotionInput = {
  recipe: FoodRecipe | PotionRecipe;
  ingredientPrices: Map<string, number>;  // ingredientId → unit price in chosen buy city
  outputMarketPrice: number;              // sell-city unit price
  amount: number;                         // number of crafts
  bonuses: {
    city: City;                           // craft city
    productionBonusCity: City;            // Caerleon for food, Brecilien for potions
    royalBonusPercent: number;            // 18
    materialBonusPercent: number;         // 40 (only if city === productionBonusCity)
    focusEnabled: boolean;
    focusBonusPercent: number;            // 59
    focusEfficiency: number;              // mastery*30 + tierSpec*250
    focusBudget: number;
    stationKind: "city" | "hideout" | "island";
    hideoutPowerBonusPercent?: number;    // 0..15 in steps
    dailyBonusPercent?: number;           // 0 | 10 | 20
  };
  usageFeePer100: number;
  marketTaxRate: number;                  // 0.065 / 0.105 / custom
};

type FoodPotionResult = {
  outputAmount: number;                   // outputQty × amount
  grossIngredientCost: number;            // Σ qty × unit × amount
  returnRate: number;                     // 0..0.99
  returnedIngredientCost: number;         // grossIngredientCost × returnRate
  effectiveIngredientCost: number;        // gross - returned
  itemValue: number;                      // Σ ingredient_qty × ingredient_itemValue
  stationFee: number;                     // itemValue × 0.1125 × fee/100 × amount
  revenue: number;                        // outputMarketPrice × outputAmount
  marketTax: number;                      // revenue × marketTaxRate
  netRevenue: number;
  totalCost: number;                      // effective + stationFee
  focusCost: number;
  maxRunsByFocus: number;
  profit: number;
  profitPercent: number;
  profitPerFocus: number;
  missingIngredientCost: boolean;         // true if any ingredient has price 0
};
```

Reusable helpers from existing code:
- `computeReturnRateFromBonusPercent` (refiningCore)
- `computeStationFee` (bm-crafter calculations)
- Focus efficiency formula (refining UI)

**New helpers needed:**
- `computeRecipeItemValue(recipe, ingredientItemValues)` — sum-based
- `computeHideoutBonusFromPower(hideoutPower)` — lookup table, to extract from the xlsx

---

## 6. UI structure

### 6.1 Layout — same skeleton as Refining Calculator

```
+--------------------------------------------------------------+
| Header (brand + nav + region pill + account)                 |
+--------------------------------------------------------------+
| Top panel (collapsible)                                      |
|  - Recipe picker (search/dropdown of recipes for this tier) |
|  - Ingredient price table (per city, per ingredient slot)   |
|  - Filters: Amount, Usage Fee, Buy City, Craft City,         |
|    Sell City, Station Kind, Return Profile, Focus Specs,     |
|    Tax Mode, Daily Bonus, Hideout Power                     |
+--------------------------------------------------------------+
| Results table       | Side card (Insight)                    |
|  - Tier rows × enchants per recipe                          |
|  - Cols: Variant, Return, Ingredient cost, Return saved,   |
|    Fee, Tax, Net cost, Net revenue, Focus, Profit/Focus,    |
|    Profit, Profit %                                        |
|                     |  - Selected variant breakdown        |
|                     |  - Ingredient list with qty/unit/    |
|                     |    total per ingredient              |
|                     |  - All metrics                       |
+--------------------------------------------------------------+
```

### 6.2 Key UI differences vs Refining

| Aspect | Refining | Food/Potion |
|--|--|--|
| Materials | 5 fixed (metal/wood/fiber/hide/stone) | per-recipe ingredient list, up to 4 |
| Variants per material | 35 (7 tiers × 5 enchants) | 1 recipe → 5 enchants? (food/potion **don't have enchant variants** — single tier item only) |
| Sub-material | Yes (refined tier-1) | None |
| Output multiplier | Only stone (1/2/4/8/16) | All recipes (typically 10) |
| Focus specs | Per material × per tier | Per category (Cooking/Alchemy) × per tier |

**Important:** Food and potion items do **not have enchantment levels** (no `.0/.1/.2/.3/.4` variants like equipment or refined materials). One row per recipe only.

### 6.3 Reused components

- City selector pill (`.bm-city-field`)
- Usage-fee field (`.bm-fee-field`)
- Filter blocks (`.filter-block` + `.chip`)
- Side card structure (`.side-card` + `.side-metrics`)
- Material breakdown list (already used in Crafting Calculator side panel) → adapt to ingredient breakdown

---

## 7. File layout (proposed)

```
src/features/food-potion-crafter/
├── core/
│   ├── types.ts                  # FoodPotionRecipe, Bonuses, Result
│   ├── foodPotionCore.ts         # pure calculation
│   └── index.ts
├── data/
│   ├── recipes.ts                # static recipe definitions OR loader
│   ├── ingredients.ts            # ingredient master list + itemValue
│   ├── liveMapping.ts            # buildLiveSnapshot (mirrors refining)
│   ├── normalizers.ts
│   ├── paths.ts                  # data file paths per region/category
│   └── index.ts
├── hooks/
│   ├── useFoodPotionState.ts
│   ├── deriveRows.ts
│   └── types.ts
├── tests/
│   ├── foodPotionCore.test.ts
│   ├── recipes.test.ts
│   └── liveMapping.test.ts
└── ui/
    ├── FoodPotionCrafterPage.tsx
    └── foodPotionCrafter.css
```

Mirrors `src/features/refining-calculator/` exactly so contributors recognise the structure.

If we split into two pages (Food + Potion separately), each gets its own folder with shared `core/` and `data/` lifted up to `food-potion-crafter/shared/`.

---

## 8. Logic from xlsx — keep / discard / adapt

| xlsx behavior | Verdict | Notes |
|--|--|--|
| Per-city ingredient pricing (7 cities) | **Keep** | Same as our Refining Calculator |
| API price + Manual override per cell | **Keep** | Mirror Refining manual-override pattern |
| Demand Average input (30 days) | **Adapt** | Used to weight expected daily profit — optional v1 |
| `Refresh Data` toggle | **Discard** | We auto-refresh via the data refresh script |
| Hideout-power lookup table | **Keep** | Extract `BH1:BI10` from the xlsx and bake in |
| `Bonus City` boolean toggle | **Adapt** | Replaced by Craft City dropdown — bonus auto-detected |
| `Use Focus` boolean | **Keep** | Same as Refining preset toggle |
| `Quantity` (number of crafts) | **Keep** | Same as Refining `amount` |
| Hard-coded ingredient name→id resolution | **Replace** | Use clean ingredient master list |
| Spreadsheet's swapped tier/qty columns (Food cols H/I are swapped vs J/K/L) | **Discard** | xlsx bug — don't replicate. Use clean recipe JSON |
| Median price across cities (`MEDIAN(BB42:BB48)`) | **Optional v1** | Could add "fastest-sell city" hint |

---

## 8b. FINAL DECISIONS (locked 2026-05-29)

1. **One page** `/food-potion-crafter` with an internal **Food ⇄ Potion tab** (segmented control at top).
2. **Recipe data from xlsx** — extracted to `public/data/recipes-food.json` (68), `public/data/recipes-potions.json` (43), `public/data/consumable-ingredients.json` (85 unique ingredients). DONE.
3. **Avalonian Energy / rare "Fine" ingredients highlighted** in UI (`isAvalonian` flag on recipe, `rare` flag on ingredient).
4. **Recipe source = static JSON from xlsx** (already extracted).
5. **No merge** with BM-Crafter sold/day — own **Demand / Day** input per recipe (manual), used only for "daily potential" display.
6. **Station fee = direct numeric input** (default **300** food / **500** potion), `totalStationFee = stationFee × amount`. Matches the verified Goldenium xlsx exactly; avoids unreliable item-value tables. (NOT the itemValue×0.1125 model — food/potion item values aren't cleanly available.)
7. **T1 food included** (Basic Fish Sauce, outputQty 1).

Extracted data shapes:
```jsonc
// recipes-food.json / recipes-potions.json
{ "count": 68, "recipes": [
  { "itemId":"T8_MEAL_STEW", "name":"Beef Stew", "tier":8, "category":"food",
    "outputQty":10, "isAvalonian":false,
    "ingredients":[ {"itemId":"T8_PUMPKIN","name":"Pumpkin","qty":36,"tier":8}, ... ] }
]}
// consumable-ingredients.json
{ "count": 85, "ingredients": [ {"itemId":"T1_CARROT","name":"Carrots","tier":1,"rare":false}, ... ] }
```

Food/potion items have **no enchant levels** → one row per recipe. Bonus city: **Caerleon** (food), **Brecilien** (potion).

## 9. Open questions

1. **Single tool or two?** `/food-crafter` + `/potion-crafter` (cleaner UX, two nav tabs) or combined `/consumable-crafter` with category toggle (less nav clutter)? — **Default to two separate pages**, mirroring Refining/BM/Crafting Calculator pattern (one tool per nav tab).
2. **Hideout-power lookup**: extract numeric table from xlsx — do we already have access to a verified mapping, or should we derive from in-game?
3. **Avalonian Energy** as ingredient: confirmed regular RRR-eligible? (Research says yes — treat as normal ingredient.) Should we still flag it in UI as "rare ingredient" with a different colour?
4. **Recipe source**: Option A (refresh script from ao-bin-dumps) or Option B (one-shot extraction from xlsx)? Recommendation: **B for v1, A as a follow-up**.
5. **Demand Average**: pull from BM-Crafter's `sold/day` data? Or compute from a separate AODP endpoint?
6. **Item-value lookup**: do we extract `itemvalue` per ingredient from `items.txt` once into a static constant, or fetch dynamically?
7. **T1 food** (Basic Fish Sauce only): is it worth surfacing in UI? Almost no profit at T1 — could just start at T2.

---

## 10. Implementation order (proposed, when we say "go")

1. **Data bootstrap**: extract recipes + ingredient master list from xlsx → `recipes-food.json` + `recipes-potions.json` + `ingredients.json`.
2. **Pure core** with full test coverage (mirror `refiningCore.test.ts`).
3. **Hook + deriveRows** (one row per recipe — much simpler than refining).
4. **Refresh script** for ingredient + output prices.
5. **UI page** copy of `RefiningCalculatorPage.tsx` adapted.
6. **CSS** — reuse refining classes, add minimal new ones.
7. **Nav tab** in BM/Refining/Crafting Calc headers + landing/dashboard cards.
8. **README + this doc** updated to reflect implementation.

Total estimated diff: ~1500 lines (similar to Refining Calculator size).
