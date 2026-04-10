import type { Enchant, MaterialKey, RefineVariant, Tier } from "../core";
import { MATERIAL_DEFINITIONS } from "./refiningData";

type CityPriceMap = Record<string, number | undefined>;

type LiveMaterialEntry = {
  itemId?: string;
  prices?: CityPriceMap;
  price?: number;
};

type LiveMaterialsPayload = {
  generatedAt?: string;
  items?: LiveMaterialEntry[];
};

export type RefiningLiveSnapshot = {
  generatedAt: string | null;
  marketByVariantId: Record<string, number>;
  rawByMaterialTierEnchant: Record<MaterialKey, Record<Tier, Record<Enchant, number>>>;
};

const TOKEN_BY_MATERIAL: Record<MaterialKey, "METALBAR" | "PLANKS" | "CLOTH" | "LEATHER"> = MATERIAL_DEFINITIONS.reduce(
  (acc, material) => {
    acc[material.key] = material.token;
    return acc;
  },
  {} as Record<MaterialKey, "METALBAR" | "PLANKS" | "CLOTH" | "LEATHER">
);

const RAW_TOKEN_BY_MATERIAL: Record<MaterialKey, "ORE" | "WOOD" | "FIBER" | "HIDE"> = {
  metal: "ORE",
  wood: "WOOD",
  fiber: "FIBER",
  hide: "HIDE",
};

function refinedItemIdFor(materialKey: MaterialKey, tier: Tier, enchant: Enchant): string {
  const token = TOKEN_BY_MATERIAL[materialKey];
  if (enchant <= 0) return `T${tier}_${token}`;
  return `T${tier}_${token}_LEVEL${enchant}@${enchant}`;
}

function rawItemIdFor(materialKey: MaterialKey, tier: Tier, enchant: Enchant): string {
  const token = RAW_TOKEN_BY_MATERIAL[materialKey];
  if (enchant <= 0) return `T${tier}_${token}`;
  return `T${tier}_${token}_LEVEL${enchant}@${enchant}`;
}

function resolvePriceByCity(entry: LiveMaterialEntry | undefined, selectedCity: string): number {
  if (!entry) return 0;
  if (entry.prices && typeof entry.prices === "object") {
    const cityPrice = Number(entry.prices[selectedCity] || 0);
    return cityPrice > 0 ? cityPrice : 0;
  }
  const single = Number(entry.price || 0);
  return single > 0 ? single : 0;
}

function byId(items: ReadonlyArray<LiveMaterialEntry>, itemId: string, selectedCity: string): number | null {
  const hit = items.find((entry) => entry.itemId === itemId);
  const price = resolvePriceByCity(hit, selectedCity);
  return price > 0 ? price : null;
}

function resolveVariantMarket(variant: RefineVariant, items: ReadonlyArray<LiveMaterialEntry>, selectedCity: string): number {
  const direct = byId(items, variant.itemId, selectedCity);
  if (direct !== null) return direct;

  if (variant.enchant === 4) {
    const lvl3 = byId(items, refinedItemIdFor(variant.materialKey, variant.tier, 3), selectedCity);
    if (lvl3 !== null) return lvl3;
    const lvl2 = byId(items, refinedItemIdFor(variant.materialKey, variant.tier, 2), selectedCity);
    if (lvl2 !== null) return lvl2;
  }

  return variant.market;
}

function resolveRawPrice(materialKey: MaterialKey, tier: Tier, enchant: Enchant, items: ReadonlyArray<LiveMaterialEntry>, selectedCity: string): number {
  const rawPrice = byId(items, rawItemIdFor(materialKey, tier, enchant), selectedCity);
  return rawPrice !== null ? rawPrice : 0;
}

export function buildRefiningLiveSnapshot(
  refinedPayload: LiveMaterialsPayload,
  rawPayload: LiveMaterialsPayload,
  variants: ReadonlyArray<RefineVariant>,
  selectedCity: string
): RefiningLiveSnapshot {
  const refinedItems = Array.isArray(refinedPayload.items) ? refinedPayload.items : [];
  const rawItems = Array.isArray(rawPayload.items) ? rawPayload.items : [];

  const marketByVariantId = variants.reduce<Record<string, number>>((acc, variant) => {
    acc[variant.id] = resolveVariantMarket(variant, refinedItems, selectedCity);
    return acc;
  }, {});

  const rawByMaterialTierEnchant = (Object.keys(TOKEN_BY_MATERIAL) as MaterialKey[]).reduce<Record<MaterialKey, Record<Tier, Record<Enchant, number>>>>(
    (acc, materialKey) => {
      acc[materialKey] = ([4, 5, 6, 7, 8] as const).reduce<Record<Tier, Record<Enchant, number>>>((tierAcc, tier) => {
        tierAcc[tier] = ([0, 1, 2, 3, 4] as const).reduce<Record<Enchant, number>>((enchantAcc, enchant) => {
          enchantAcc[enchant] = resolveRawPrice(materialKey, tier, enchant, rawItems, selectedCity);
          return enchantAcc;
        }, { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 });
        return tierAcc;
      }, {
        4: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        5: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        6: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        7: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
        8: { 0: 0, 1: 0, 2: 0, 3: 0, 4: 0 },
      });
      return acc;
    },
    {} as Record<MaterialKey, Record<Tier, Record<Enchant, number>>>
  );

  return {
    generatedAt: typeof rawPayload.generatedAt === "string"
      ? rawPayload.generatedAt
      : typeof refinedPayload.generatedAt === "string"
        ? refinedPayload.generatedAt
        : null,
    marketByVariantId,
    rawByMaterialTierEnchant
  };
}

