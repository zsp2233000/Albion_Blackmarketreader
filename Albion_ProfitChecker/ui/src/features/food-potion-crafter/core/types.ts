export type City = "Bridgewatch" | "Lymhurst" | "Fort Sterling" | "Martlock" | "Thetford" | "Caerleon" | "Brecilien";
export type MarketRegion = "eu" | "us";
export type ConsumableCategory = "food" | "potion";
export type StationKind = "city" | "hideout" | "island";

/** One ingredient line of a recipe. Quantities are per single craft action. */
export interface RecipeIngredient {
  readonly itemId: string;
  readonly name: string;
  readonly qty: number;
  readonly tier: number;
  /** Rare alchemy "Fine/Excellent" part or Avalonian token — highlighted in UI. */
  readonly rare?: boolean;
  /** False = not eligible for resource return (e.g. Avalonian Energy quest token). Defaults to true. */
  readonly returnable?: boolean;
}

/** A food or potion recipe as extracted from the source workbook. */
export interface ConsumableRecipe {
  readonly itemId: string;
  readonly name: string;
  readonly tier: number;
  readonly category: ConsumableCategory;
  /** Items produced per single craft action (food/potion craft in batches, usually 10). */
  readonly outputQty: number;
  readonly isAvalonian: boolean;
  /** Base focus cost per single craft action at 0 mastery / 0 spec. */
  readonly baseFocus?: number;
  /** Output item value (drives station fee = itemValue × 0.1125 × usageFee/100). Source: ao-bin-dumps. */
  readonly itemValue?: number;
  /** Crafting focus per enchant level [E0, E1, E2, E3]. Source: ao-bin-dumps. */
  readonly focus?: ReadonlyArray<number>;
  /** Fish sauce units required to enchant this food (0 = not enchantable). */
  readonly fishSauceQty?: number;
  /** Arcane extract units required to enchant this potion (0 = not enchantable). */
  readonly arcaneExtractQty?: number;
  /** True when the consumable can be enchanted (food via fish sauce, potion via arcane extract). */
  readonly enchantable?: boolean;
  readonly ingredients: ReadonlyArray<RecipeIngredient>;
}

/** Flat per-region unit price map: itemId -> silver. */
export type PriceMap = Map<string, number>;

export interface BonusConfig {
  /** City the craft happens in. */
  readonly city: City;
  /** City that grants the Local Production specialty bonus (Caerleon=food, Brecilien=potion). */
  readonly productionBonusCity: City;
  readonly royalBonusPercent: number;      // 18
  readonly materialBonusPercent: number;   // 40 (applied only when city === productionBonusCity and stationKind === "city")
  readonly focusEnabled: boolean;
  readonly focusBonusPercent: number;      // 59
  readonly dailyBonusPercent: number;      // 0 | 10 | 20
  readonly stationKind: StationKind;
  /** Hideout return bonus percent when stationKind === "hideout" (power-derived). */
  readonly hideoutBonusPercent: number;
}

export interface ConsumableInput {
  readonly recipe: ConsumableRecipe;
  /** Unit prices for ingredients, keyed by itemId (already resolved to the buy city). */
  readonly ingredientPrices: PriceMap;
  /** Sell-city unit price of the crafted output. */
  readonly outputMarketPrice: number;
  /** Number of craft actions. */
  readonly amount: number;
  /** Output item value of the craft (drives the station fee). */
  readonly itemValue: number;
  /** Station usage fee setting (silver per 1000); fee = itemValue × 0.1125 × usageFee/100. */
  readonly usageFee: number;
  /** Crafting focus for the selected enchant level (overrides recipe.baseFocus). */
  readonly focusPerCraft?: number;
  /** Combined market tax rate as a fraction (e.g. 0.065). */
  readonly marketTaxRate: number;
  /** Optional manual demand/day for daily-potential display (does not affect profit). */
  readonly demandPerDay: number;
  readonly bonuses: BonusConfig;
  /** Total focus cost efficiency from mastery + specs (0 = no spec). */
  readonly focusEfficiency?: number;
  /** When set (0..1), overrides the computed return rate (manual profile). */
  readonly returnRateOverride?: number | null;
}

export interface ConsumableResult {
  readonly outputAmount: number;
  readonly grossIngredientCost: number;
  readonly returnRate: number;
  readonly returnedIngredientCost: number;
  readonly effectiveIngredientCost: number;
  readonly stationFee: number;
  readonly revenue: number;
  readonly marketTax: number;
  readonly netRevenue: number;
  readonly totalCost: number;
  readonly profit: number;
  readonly profitPercent: number;
  readonly profitPerOutput: number;
  readonly dailyPotential: number | null;
  readonly missingIngredientCost: boolean;
  /** Effective focus cost for the whole craft batch (base * 0.5^(eff/10000) * amount). */
  readonly focusCost: number;
  /** Profit per focus point (silver per focus); null when focus is unknown/zero. */
  readonly silverPerFocus: number | null;
}
