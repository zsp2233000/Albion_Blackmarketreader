import type { Enchant, MaterialKey, RefineVariant, Tier } from "../core";

type MaterialDefinition = {
  key: MaterialKey;
  token: "METALBAR" | "PLANKS" | "CLOTH" | "LEATHER";
  label: string;
  defaultTierBaseRaw: Record<Tier, number>;
};

const ENCHANT_MULTIPLIER: Record<Enchant, number> = {
  0: 1,
  1: 1.5,
  2: 4,
  3: 12,
  4: 35
};

const ENCHANT_ITEM_VALUE_MULTIPLIER: Record<Enchant, number> = {
  0: 1,
  1: 1.4,
  2: 2.6,
  3: 4.8,
  4: 7.2
};

const BASE_ITEM_VALUE_BY_TIER: Record<Tier, number> = {
  4: 600,
  5: 1200,
  6: 2600,
  7: 5800,
  8: 12000
};

export const MATERIAL_DEFINITIONS: ReadonlyArray<MaterialDefinition> = [
  {
    key: "metal",
    token: "METALBAR",
    label: "Metal Bar",
    defaultTierBaseRaw: { 4: 142, 5: 450, 6: 1240, 7: 4800, 8: 12400 }
  },
  {
    key: "wood",
    token: "PLANKS",
    label: "Planks",
    defaultTierBaseRaw: { 4: 130, 5: 390, 6: 1100, 7: 4300, 8: 11000 }
  },
  {
    key: "fiber",
    token: "CLOTH",
    label: "Cloth",
    defaultTierBaseRaw: { 4: 125, 5: 400, 6: 1180, 7: 4550, 8: 11600 }
  },
  {
    key: "hide",
    token: "LEATHER",
    label: "Leather",
    defaultTierBaseRaw: { 4: 150, 5: 470, 6: 1320, 7: 5200, 8: 13200 }
  }
];

function itemIdFor(token: MaterialDefinition["token"], tier: Tier, enchant: Enchant): string {
  if (enchant <= 0) return `T${tier}_${token}`;
  return `T${tier}_${token}_LEVEL${enchant}@${enchant}`;
}

function iconFor(token: MaterialDefinition["token"], tier: Tier, enchant: Enchant): string {
  return `https://render.albiononline.com/v1/item/${itemIdFor(token, tier, enchant)}.png`;
}

function labelFor(tier: Tier, enchant: Enchant): string {
  return `T${tier}.${enchant}`;
}

function trendFor(enchant: Enchant): string {
  if (enchant === 0) return "M0,18 Q20,8 40,16 T80,6 T100,14";
  if (enchant === 1) return "M0,14 Q20,11 40,6 T80,16 T100,10";
  if (enchant === 2) return "M0,24 L20,14 L40,19 L60,8 L80,14 L100,9";
  if (enchant === 3) return "M0,20 Q20,5 40,20 T80,7 T100,12";
  return "M0,26 L20,16 L40,22 L60,9 L80,17 L100,12";
}

function buildVariant(material: MaterialDefinition, tier: Tier, enchant: Enchant): RefineVariant {
  const id = `${labelFor(tier, enchant)} ${material.label}`;
  const itemValue = BASE_ITEM_VALUE_BY_TIER[tier] * ENCHANT_ITEM_VALUE_MULTIPLIER[enchant];
  const marketSeed = material.defaultTierBaseRaw[tier] * ENCHANT_MULTIPLIER[enchant] * 2.2;

  return {
    id,
    itemId: itemIdFor(material.token, tier, enchant),
    materialKey: material.key,
    label: labelFor(tier, enchant),
    tier,
    enchant,
    multiplier: ENCHANT_MULTIPLIER[enchant],
    market: Math.round(marketSeed),
    itemValue: Math.round(itemValue),
    icon: iconFor(material.token, tier, enchant),
    trend: trendFor(enchant)
  };
}

export const DEFAULT_RAW_BY_MATERIAL_TIER: Record<MaterialKey, Record<Tier, number>> = MATERIAL_DEFINITIONS.reduce(
  (acc, material) => {
    acc[material.key] = material.defaultTierBaseRaw;
    return acc;
  },
  {} as Record<MaterialKey, Record<Tier, number>>
);

export const DEFAULT_RAW_BY_TIER: Record<Tier, number> = DEFAULT_RAW_BY_MATERIAL_TIER.metal;

export const REFINE_VARIANTS: ReadonlyArray<RefineVariant> = MATERIAL_DEFINITIONS.flatMap((material) =>
  ([4, 5, 6, 7, 8] as const).flatMap((tier) => ([0, 1, 2, 3, 4] as const).map((enchant) => buildVariant(material, tier, enchant)))
);
