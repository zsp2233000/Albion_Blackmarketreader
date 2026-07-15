import type { Region } from "../types";

export const MARKET_REGIONS = ["us", "eu", "asia"] as const satisfies readonly Region[];

export function isRegion(value: unknown): value is Region {
  return typeof value === "string" && MARKET_REGIONS.includes(value.toLowerCase() as Region);
}

export function normalizeRegion(value: unknown): Region | null {
  const normalized = typeof value === "string" ? value.toLowerCase() : "";
  return isRegion(normalized) ? normalized : null;
}
