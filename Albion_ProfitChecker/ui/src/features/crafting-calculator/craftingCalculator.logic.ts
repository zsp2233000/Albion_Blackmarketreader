export type CraftingItemLike = {
  id: string;
  categoryKey?: string;
};

export type ResultPriceEntry = {
  city?: string;
  id?: string;
  itemId?: string;
  price?: number;
  prices?: Record<string, number>;
  lym?: number;
  bm?: number;
  sold?: number;
};

export type EconomyCalculationInput = {
  mat1: number;
  mat2: number;
  artefact: number;
  market: number;
  requiresMat1: boolean;
  requiresMat2: boolean;
  requiresArtefact: boolean;
  returnRate: number;
  itemValue: number;
  stationFee: number;
  setupFeePercent: number;
  transactionTaxPercent: number;
};

export const MATERIAL_BASES = new Set(["METALBAR", "PLANKS", "CLOTH", "LEATHER", "STONEBLOCK"]);
export const KNOWN_CITIES = ["Lymhurst", "Caerleon", "Bridgewatch", "Martlock", "Fort Sterling", "Thetford", "Brecilien"];
export const CRAFTING_FEE_FACTOR = 0.1125;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function toFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return undefined;
}

export function clampNumber(value: number, min: number, max: number): number {
  if (!Number.isFinite(value)) return min;
  return Math.max(min, Math.min(max, value));
}

export function productionBonusToReturnRate(productionBonusPercent: number): number {
  if (!Number.isFinite(productionBonusPercent) || productionBonusPercent <= 0) return 0;
  return 1 - 1 / (1 + productionBonusPercent / 100);
}

export function calculateCraftingUsageFee(itemValue: number, stationFee: number): number {
  const safeItemValue = Math.max(0, Number(itemValue) || 0);
  const safeStationFee = Math.max(0, Number(stationFee) || 0);
  return ((safeItemValue * CRAFTING_FEE_FACTOR) * safeStationFee) / 100;
}

export function getBonusCityForItem(item: CraftingItemLike | null): string | null {
  if (!item) return null;

  const id = String(item.id || "").trim().toUpperCase();

  if (id === "BAG" || id === "BAG_INSIGHT" || id === "CAPE") return "Brecilien";

  // All gathering tools (Pickaxe, Sickle, Hammer, Axe, Knife, Fishingrod)
  // and all gathering gear (HEAD/ARMOR/SHOES/BACKPACK_GATHERER_*) have their
  // Local Production Bonus in Caerleon, regardless of resource type.
  if (/^2H_TOOL_(PICK|KNIFE|HAMMER|AXE|SICKLE|FISHINGROD)$/.test(id)) return "Caerleon";
  if (/GATHERER_(FIBER|HIDE|ORE|ROCK|WOOD|FISH)$/.test(id)) return "Caerleon";

  switch (item.categoryKey) {
    case "swords":
    case "bows":
    case "arcane":
      return "Lymhurst";
    case "axes":
    case "quarterstaffs":
    case "frost":
    case "offhand":
      return "Martlock";
    case "maces":
    case "fire":
    case "nature":
      return "Thetford";
    case "hammers":
    case "spears":
    case "holy":
      return "Fort Sterling";
    case "crossbows":
    case "daggers":
    case "cursed":
      return "Bridgewatch";
    case "gloves":
    case "shapeshifter":
      return "Caerleon";
    case "bags":
    case "capes":
      return "Brecilien";
    case "armor-head":
      if (item.id.startsWith("HEAD_PLATE")) return "Fort Sterling";
      if (item.id.startsWith("HEAD_LEATHER")) return "Lymhurst";
      if (item.id.startsWith("HEAD_CLOTH")) return "Thetford";
      return null;
    case "armor-chest":
      if (item.id.startsWith("ARMOR_PLATE")) return "Bridgewatch";
      if (item.id.startsWith("ARMOR_LEATHER")) return "Thetford";
      if (item.id.startsWith("ARMOR_CLOTH")) return "Fort Sterling";
      return null;
    case "armor-shoes":
      if (item.id.startsWith("SHOES_PLATE")) return "Martlock";
      if (item.id.startsWith("SHOES_LEATHER")) return "Lymhurst";
      if (item.id.startsWith("SHOES_CLOTH")) return "Bridgewatch";
      return null;
    case "gathering-gear":
    case "tools":
      return "Caerleon";
    default:
      return null;
  }
}

export function calculateEconomics(input: EconomyCalculationInput) {
  const {
    mat1,
    mat2,
    artefact,
    market,
    requiresMat1,
    requiresMat2,
    requiresArtefact,
    returnRate,
    itemValue,
    stationFee,
    setupFeePercent,
    transactionTaxPercent
  } = input;

  const grossResourceCost = mat1 + mat2 + artefact;
  const missingRequiredPrices =
    (requiresMat1 && mat1 <= 0) ||
    (requiresMat2 && mat2 <= 0) ||
    (requiresArtefact && artefact <= 0);
  const hasMarketValue = Number.isFinite(market) && market > 0;
  const canCalculate = !missingRequiredPrices && hasMarketValue;

  const netResourceCost = canCalculate ? (mat1 + mat2) * (1 - returnRate) + artefact : null;
  const craftingUsageFee = canCalculate ? calculateCraftingUsageFee(itemValue, stationFee) : null;
  const marketSetupFee = canCalculate ? (market * clampNumber(setupFeePercent, 0, 100)) / 100 : null;
  const marketTransactionTax = canCalculate ? (market * clampNumber(transactionTaxPercent, 0, 100)) / 100 : null;
  const totalFees = canCalculate && craftingUsageFee !== null && marketSetupFee !== null && marketTransactionTax !== null
    ? craftingUsageFee + marketSetupFee + marketTransactionTax
    : null;
  const totalCost = canCalculate && netResourceCost !== null && totalFees !== null ? netResourceCost + totalFees : null;
  const profit = canCalculate && totalCost !== null ? market - totalCost : null;
  const roi = canCalculate && totalCost && profit !== null ? (profit / totalCost) * 100 : null;

  return {
    canCalculate,
    grossResourceCost,
    netResourceCost,
    craftingUsageFee,
    marketSetupFee,
    marketTransactionTax,
    totalFees,
    totalCost,
    profit,
    roi
  };
}

export function buildMaterialItemId(base: string, tier: number, enchant: number): string | null {
  if (!MATERIAL_BASES.has(base)) return null;
  if (base === "STONEBLOCK") return `T${tier}_STONEBLOCK`;
  if (enchant > 0) return `T${tier}_${base}_LEVEL${enchant}@${enchant}`;
  return `T${tier}_${base}`;
}

export function normalizeResultPriceEntry(entry: unknown): ResultPriceEntry | null {
  if (Array.isArray(entry)) {
    const city = String(entry[0] || "").trim();
    const id = String(entry[1] || "").trim();
    if (!city || !id) return null;
    return {
      city,
      id,
      itemId: id,
      lym: toFiniteNumber(entry[2]),
      bm: toFiniteNumber(entry[3]),
      sold: toFiniteNumber(entry[4])
    };
  }

  if (!isRecord(entry)) return null;
  const itemId = String(entry.id || entry.itemId || "").trim();
  const city = typeof entry.city === "string" ? entry.city.trim() : undefined;
  if (!itemId && !entry.prices) return null;

  const prices = isRecord(entry.prices)
    ? Object.fromEntries(
      Object.entries(entry.prices)
        .map(([key, value]) => [key, toFiniteNumber(value) || 0])
    )
    : undefined;

  return {
    city,
    id: itemId || undefined,
    itemId: itemId || undefined,
    price: toFiniteNumber(entry.price),
    prices,
    lym: toFiniteNumber(entry.lym),
    bm: toFiniteNumber(entry.bm),
    sold: toFiniteNumber(entry.sold)
  };
}

export function resolvePriceByCity(prices: Record<string, number> | undefined, city: string): number {
  if (!prices) return 0;
  if (city !== "ALL") return Number(prices[city] || 0);
  const values = KNOWN_CITIES.map((name) => Number(prices[name] || 0)).filter((value) => value > 0);
  return values.length ? Math.min(...values) : 0;
}

export function resolveArtefactPriceByCity(prices: Record<string, number> | undefined, city: string): number {
  if (!prices) return 0;
  if (city !== "ALL") {
    const strict = Number(prices[city] || 0);
    if (strict > 0) return strict;
    return Number(prices.ALL || 0);
  }
  const values = [...KNOWN_CITIES, "ALL"].map((name) => Number(prices[name] || 0)).filter((value) => value > 0);
  return values.length ? Math.min(...values) : 0;
}

export function resolveResultPrice(entries: ResultPriceEntry[], city: string): number {
  const mappedValues = city === "ALL"
    ? entries.flatMap((entry) =>
      KNOWN_CITIES
        .map((name) => Number(entry.prices?.[name] || 0))
        .filter((value) => Number.isFinite(value) && value > 0)
    )
    : entries
      .map((entry) => Number(entry.prices?.[city] || 0))
      .filter((value) => Number.isFinite(value) && value > 0);
  if (mappedValues.length) return Math.min(...mappedValues);

  const source = city !== "ALL"
    ? entries.filter((entry) => String(entry.city || "").toLowerCase() === city.toLowerCase())
    : entries;
  if (!source.length) return 0;

  const values = source
    .map((entry) => Number(entry.price || entry.bm || entry.lym || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.min(...values) : 0;
}

export function resolveBlackMarketPrice(entries: ResultPriceEntry[]): number {
  if (!entries.length) return 0;
  const values = entries
    .map((entry) => Number(entry.bm || 0))
    .filter((value) => Number.isFinite(value) && value > 0);
  return values.length ? Math.max(...values) : 0;
}
