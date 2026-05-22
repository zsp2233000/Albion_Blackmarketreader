import type { City, Enchant, MaterialKey, RefineIngredient, RefineVariant, Tier } from "../core";

type RefinedToken = "METALBAR" | "PLANKS" | "CLOTH" | "LEATHER" | "STONEBLOCK";
type RawToken = "ORE" | "WOOD" | "FIBER" | "HIDE" | "ROCK";

export type MaterialDefinition = {
  key: MaterialKey;
  rawToken: RawToken;
  refinedToken: RefinedToken;
  rawLabel: string;
  refinedLabel: string;
  bonusCity: City;
  defaultRaw: Record<Tier, number>;
  defaultRefined: Record<Tier, number>;
};

export const TIERS = [2, 3, 4, 5, 6, 7, 8] as const;
export const ENCHANTS = [0, 1, 2, 3, 4] as const;

export const FOCUS_BONUS_PERCENT = 59;
export const ROYAL_REFINING_BONUS_PERCENT = 18;
export const MATERIAL_REFINING_BONUS_PERCENT = 40;

const ENCHANT_PRICE_MULTIPLIER: Record<Enchant, number> = {
  0: 1,
  1: 1.5,
  2: 4,
  3: 12,
  4: 35,
};

const ENCHANT_ITEM_VALUE_MULTIPLIER: Record<Enchant, number> = {
  0: 1,
  1: 1.4,
  2: 2.6,
  3: 4.8,
  4: 7.2,
};

const STONE_OUTPUT_MULTIPLIER: Record<Enchant, number> = {
  0: 1,
  1: 2,
  2: 4,
  3: 8,
  4: 16,
};

const BASE_ITEM_VALUE_BY_TIER: Record<Tier, number> = {
  2: 18,
  3: 90,
  4: 600,
  5: 1200,
  6: 2600,
  7: 5800,
  8: 12000,
};

const BASE_FOCUS_COST_BY_POWER = [18, 31, 54, 94, 164, 287, 503, 880, 1539, 2694, 4714] as const;

export const MATERIAL_DEFINITIONS: ReadonlyArray<MaterialDefinition> = [
  {
    key: "metal",
    rawToken: "ORE",
    refinedToken: "METALBAR",
    rawLabel: "Ore",
    refinedLabel: "Metal Bar",
    bonusCity: "Thetford",
    defaultRaw: { 2: 16, 3: 44, 4: 142, 5: 450, 6: 1240, 7: 4800, 8: 12400 },
    defaultRefined: { 2: 20, 3: 70, 4: 260, 5: 900, 6: 3400, 7: 9000, 8: 29000 },
  },
  {
    key: "wood",
    rawToken: "WOOD",
    refinedToken: "PLANKS",
    rawLabel: "Wood",
    refinedLabel: "Planks",
    bonusCity: "Fort Sterling",
    defaultRaw: { 2: 15, 3: 40, 4: 130, 5: 390, 6: 1100, 7: 4300, 8: 11000 },
    defaultRefined: { 2: 20, 3: 65, 4: 260, 5: 760, 6: 3100, 7: 11000, 8: 32000 },
  },
  {
    key: "fiber",
    rawToken: "FIBER",
    refinedToken: "CLOTH",
    rawLabel: "Fiber",
    refinedLabel: "Cloth",
    bonusCity: "Lymhurst",
    defaultRaw: { 2: 15, 3: 42, 4: 125, 5: 400, 6: 1180, 7: 4550, 8: 11600 },
    defaultRefined: { 2: 20, 3: 65, 4: 280, 5: 950, 6: 3300, 7: 9500, 8: 29000 },
  },
  {
    key: "hide",
    rawToken: "HIDE",
    refinedToken: "LEATHER",
    rawLabel: "Hide",
    refinedLabel: "Leather",
    bonusCity: "Martlock",
    defaultRaw: { 2: 18, 3: 48, 4: 150, 5: 470, 6: 1320, 7: 5200, 8: 13200 },
    defaultRefined: { 2: 22, 3: 75, 4: 330, 5: 1150, 6: 5000, 7: 15000, 8: 36000 },
  },
  {
    key: "stone",
    rawToken: "ROCK",
    refinedToken: "STONEBLOCK",
    rawLabel: "Stone",
    refinedLabel: "Stone Block",
    bonusCity: "Bridgewatch",
    defaultRaw: { 2: 8, 3: 24, 4: 80, 5: 250, 6: 780, 7: 2900, 8: 8600 },
    defaultRefined: { 2: 12, 3: 42, 4: 160, 5: 520, 6: 1800, 7: 6800, 8: 21000 },
  },
];

export const MATERIAL_BY_KEY = MATERIAL_DEFINITIONS.reduce<Record<MaterialKey, MaterialDefinition>>((acc, material) => {
  acc[material.key] = material;
  return acc;
}, {} as Record<MaterialKey, MaterialDefinition>);

export function itemIdForToken(token: RawToken | RefinedToken, tier: Tier, enchant: Enchant): string {
  if (enchant <= 0) return `T${tier}_${token}`;
  return `T${tier}_${token}_LEVEL${enchant}@${enchant}`;
}

export function rawItemIdFor(materialKey: MaterialKey, tier: Tier, enchant: Enchant): string {
  return itemIdForToken(MATERIAL_BY_KEY[materialKey].rawToken, tier, enchant);
}

export function refinedItemIdFor(materialKey: MaterialKey, tier: Tier, enchant: Enchant): string {
  const refinedEnchant = materialKey === "stone" ? 0 : enchant;
  return itemIdForToken(MATERIAL_BY_KEY[materialKey].refinedToken, tier, refinedEnchant);
}

export function isEnchantAvailable(tier: Tier, enchant: Enchant): boolean {
  return tier >= 4 || enchant === 0;
}

export function enchantsForTier(tier: Tier): ReadonlyArray<Enchant> {
  return ENCHANTS.filter((enchant) => isEnchantAvailable(tier, enchant));
}

function iconFor(materialKey: MaterialKey, tier: Tier, enchant: Enchant): string {
  return `https://render.albiononline.com/v1/item/${refinedItemIdFor(materialKey, tier, enchant)}.png`;
}

function labelFor(tier: Tier, enchant: Enchant): string {
  return `T${tier}.${enchant}`;
}

function recipeRawQuantity(tier: Tier): number {
  if (tier <= 2) return 1;
  if (tier <= 4) return 2;
  if (tier === 5) return 3;
  if (tier === 6) return 4;
  return 5;
}

function outputQuantityFor(materialKey: MaterialKey, enchant: Enchant): number {
  return materialKey === "stone" ? STONE_OUTPUT_MULTIPLIER[enchant] : 1;
}

export function createRefiningIngredients(materialKey: MaterialKey, tier: Tier, enchant: Enchant): ReadonlyArray<RefineIngredient> {
  const outputQuantity = outputQuantityFor(materialKey, enchant);
  const raw: RefineIngredient = {
    materialKey,
    kind: "raw",
    tier,
    enchant,
    itemId: rawItemIdFor(materialKey, tier, enchant),
    quantity: recipeRawQuantity(tier),
  };

  if (tier === 2) return [raw];

  const previousTier = (tier - 1) as Tier;
  let previousEnchant: Enchant;
  if (materialKey === "stone" || enchant === 0 || !isEnchantAvailable(previousTier, enchant)) {
    previousEnchant = 0;
  } else {
    previousEnchant = enchant;
  }
  return [
    raw,
    {
      materialKey,
      kind: "refined",
      tier: previousTier,
      enchant: previousEnchant,
      itemId: refinedItemIdFor(materialKey, previousTier, previousEnchant),
      quantity: materialKey === "stone" ? outputQuantity : 1,
    },
  ];
}

function baseFocusCost(tier: Tier, enchant: Enchant): number {
  return BASE_FOCUS_COST_BY_POWER[(tier - 2) + enchant] ?? BASE_FOCUS_COST_BY_POWER[BASE_FOCUS_COST_BY_POWER.length - 1];
}

function trendFor(enchant: Enchant): string {
  if (enchant === 0) return "M0,18 Q20,8 40,16 T80,6 T100,14";
  if (enchant === 1) return "M0,14 Q20,11 40,6 T80,16 T100,10";
  if (enchant === 2) return "M0,24 L20,14 L40,19 L60,8 L80,14 L100,9";
  if (enchant === 3) return "M0,20 Q20,5 40,20 T80,7 T100,12";
  return "M0,26 L20,16 L40,22 L60,9 L80,17 L100,12";
}

function buildVariant(material: MaterialDefinition, tier: Tier, enchant: Enchant): RefineVariant {
  const outputQuantity = outputQuantityFor(material.key, enchant);
  const id = material.key === "stone" && enchant > 0
    ? `${labelFor(tier, enchant)} Stone -> ${outputQuantity}x T${tier} Stone Block`
    : `${labelFor(tier, enchant)} ${material.refinedLabel}`;
  const refinedPriceMultiplier = material.key === "stone" ? 1 : ENCHANT_PRICE_MULTIPLIER[enchant];
  const marketSeed = material.defaultRefined[tier] * refinedPriceMultiplier;
  return {
    id,
    itemId: refinedItemIdFor(material.key, tier, enchant),
    rawItemId: rawItemIdFor(material.key, tier, enchant),
    materialKey: material.key,
    label: labelFor(tier, enchant),
    tier,
    enchant,
    outputQuantity,
    ingredients: createRefiningIngredients(material.key, tier, enchant),
    baseFocusCost: baseFocusCost(tier, enchant),
    market: Math.round(marketSeed),
    itemValue: Math.round(BASE_ITEM_VALUE_BY_TIER[tier] * ENCHANT_ITEM_VALUE_MULTIPLIER[enchant]),
    icon: iconFor(material.key, tier, enchant),
    trend: trendFor(enchant),
  };
}

export const DEFAULT_PRICE_BY_ITEM_ID: Record<string, number> = MATERIAL_DEFINITIONS.reduce<Record<string, number>>((acc, material) => {
  TIERS.forEach((tier) => {
    enchantsForTier(tier).forEach((enchant) => {
      acc[rawItemIdFor(material.key, tier, enchant)] = Math.round(material.defaultRaw[tier] * ENCHANT_PRICE_MULTIPLIER[enchant]);
      if (material.key !== "stone" || enchant === 0) {
        const refinedMultiplier = material.key === "stone" ? 1 : ENCHANT_PRICE_MULTIPLIER[enchant];
        acc[refinedItemIdFor(material.key, tier, enchant)] = Math.round(material.defaultRefined[tier] * refinedMultiplier);
      }
    });
  });
  return acc;
}, {});

export const DEFAULT_RAW_BY_TIER: Record<Tier, number> = MATERIAL_BY_KEY.metal.defaultRaw;

export const REFINE_VARIANTS: ReadonlyArray<RefineVariant> = MATERIAL_DEFINITIONS.flatMap((material) =>
  TIERS.flatMap((tier) => enchantsForTier(tier).map((enchant) => buildVariant(material, tier, enchant))),
);
