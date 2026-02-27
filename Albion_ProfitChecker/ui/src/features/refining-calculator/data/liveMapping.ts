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
  tierBaseRawByMaterial: Record<MaterialKey, Record<Tier, number>>;
};

const KNOWN_CITIES = ["Lymhurst", "Caerleon", "Bridgewatch", "Martlock", "Fort Sterling", "Thetford"] as const;

const TOKEN_BY_MATERIAL: Record<MaterialKey, "METALBAR" | "PLANKS" | "CLOTH" | "LEATHER"> = MATERIAL_DEFINITIONS.reduce(
  (acc, material) => {
    acc[material.key] = material.token;
    return acc;
  },
  {} as Record<MaterialKey, "METALBAR" | "PLANKS" | "CLOTH" | "LEATHER">
);

function itemIdFor(materialKey: MaterialKey, tier: Tier, enchant: Enchant): string {
  const token = TOKEN_BY_MATERIAL[materialKey];
  if (enchant <= 0) return `T${tier}_${token}`;
  return `T${tier}_${token}_LEVEL${enchant}@${enchant}`;
}

function resolvePriceByCity(entry: LiveMaterialEntry | undefined, selectedCity: string): number {
  if (!entry) return 0;
  if (entry.prices && typeof entry.prices === "object") {
    if (selectedCity !== "ALL") {
      const cityPrice = Number(entry.prices[selectedCity] || 0);
      return cityPrice > 0 ? cityPrice : 0;
    }
    const values = KNOWN_CITIES.map((city) => Number(entry.prices?.[city] || 0)).filter((value) => value > 0);
    return values.length ? Math.min(...values) : 0;
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
    const lvl3 = byId(items, itemIdFor(variant.materialKey, variant.tier, 3), selectedCity);
    if (lvl3 !== null) return lvl3;
    const lvl2 = byId(items, itemIdFor(variant.materialKey, variant.tier, 2), selectedCity);
    if (lvl2 !== null) return lvl2;
  }

  return variant.market;
}

function resolveTierBase(materialKey: MaterialKey, tier: Tier, items: ReadonlyArray<LiveMaterialEntry>, selectedCity: string): number {
  const base = byId(items, itemIdFor(materialKey, tier, 0), selectedCity);
  return base !== null ? base : 0;
}

export function buildRefiningLiveSnapshot(
  payload: LiveMaterialsPayload,
  variants: ReadonlyArray<RefineVariant>,
  selectedCity: string
): RefiningLiveSnapshot {
  const items = Array.isArray(payload.items) ? payload.items : [];

  const marketByVariantId = variants.reduce<Record<string, number>>((acc, variant) => {
    acc[variant.id] = resolveVariantMarket(variant, items, selectedCity);
    return acc;
  }, {});

  const tierBaseRawByMaterial = (Object.keys(TOKEN_BY_MATERIAL) as MaterialKey[]).reduce<Record<MaterialKey, Record<Tier, number>>>(
    (acc, materialKey) => {
      acc[materialKey] = ([4, 5, 6, 7, 8] as const).reduce<Record<Tier, number>>((tierAcc, tier) => {
        tierAcc[tier] = resolveTierBase(materialKey, tier, items, selectedCity);
        return tierAcc;
      }, { 4: 0, 5: 0, 6: 0, 7: 0, 8: 0 });
      return acc;
    },
    {} as Record<MaterialKey, Record<Tier, number>>
  );

  return {
    generatedAt: typeof payload.generatedAt === "string" ? payload.generatedAt : null,
    marketByVariantId,
    tierBaseRawByMaterial
  };
}

