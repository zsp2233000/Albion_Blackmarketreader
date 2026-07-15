// Generated from ao-bin-dumps' Albion game-data index. See scripts/refresh-item-locales.mjs.
import officialNames from "./itemNames.zh-TW.json";
import type { Locale } from "./i18n";

const BASE_NAMES: Record<string, string> = {
  CLOTH: "布料",
  FIBER: "纖維",
  HIDE: "皮革",
  LEATHER: "皮革",
  METALBAR: "金屬錠",
  ORE: "礦石",
  PLANKS: "木板",
  ROCK: "岩石",
  STONEBLOCK: "石磚",
  WOOD: "木材",
};

const EN_BASE_NAMES: Record<string, string> = {
  CLOTH: "Cloth",
  FIBER: "Fiber",
  HIDE: "Hide",
  LEATHER: "Leather",
  METALBAR: "Metal Bar",
  ORE: "Ore",
  PLANKS: "Planks",
  ROCK: "Rock",
  STONEBLOCK: "Stone Block",
  WOOD: "Wood",
};

function normalizeItemId(itemId: string): string {
  return String(itemId || "").trim().toUpperCase();
}

function withoutEnchantment(itemId: string): string {
  return normalizeItemId(itemId).replace(/@\d+$/, "");
}

function beautifyId(itemId: string): string {
  return withoutEnchantment(itemId).replace(/^T\d+_/, "").replace(/_/g, " ").trim();
}

export function getOfficialItemName(itemId: string): string | null {
  const normalized = withoutEnchantment(itemId);
  const direct = officialNames[normalized as keyof typeof officialNames];
  if (direct) return direct;

  const base = normalized.replace(/^T\d+_/, "");
  if (BASE_NAMES[base]) return BASE_NAMES[base];

  const tierMatch = normalized.match(/^T\d+_(.+)$/);
  if (tierMatch && BASE_NAMES[tierMatch[1]]) return BASE_NAMES[tierMatch[1]];
  return null;
}

export function getItemDisplayName(itemId: string, locale: Locale, fallbackName?: string): string {
  const normalized = withoutEnchantment(itemId);
  const tierMatch = normalized.match(/^T(\d+)_/);
  const enchantMatch = normalizeItemId(itemId).match(/@(\d+)$/);
  const tierLabel = tierMatch ? `${tierMatch[1]}.${enchantMatch?.[1] ?? "0"}` : "";

  if (locale === "en") {
    const fallback = fallbackName || getOfficialEnglishFallback(normalized) || beautifyId(normalized);
    return tierLabel ? `${tierLabel} ${fallback}` : fallback;
  }

  const officialName = getOfficialItemName(normalized) || fallbackName || beautifyId(normalized);
  return tierLabel ? `${tierLabel} ${officialName}` : officialName;
}

function getOfficialEnglishFallback(itemId: string): string | null {
  const normalized = withoutEnchantment(itemId);
  const base = normalized.replace(/^T\d+_/, "");
  if (EN_BASE_NAMES[base]) return EN_BASE_NAMES[base];
  return null;
}

export function getItemSearchNames(itemId: string, locale: Locale, fallbackName?: string): string[] {
  const localized = getItemDisplayName(itemId, locale, fallbackName);
  const english = getItemDisplayName(itemId, "en", fallbackName);
  return Array.from(new Set([localized, english, normalizeItemId(itemId), beautifyId(itemId)]));
}
