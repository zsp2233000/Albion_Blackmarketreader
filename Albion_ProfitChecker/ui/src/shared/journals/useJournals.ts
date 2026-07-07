import { useEffect, useMemo, useState } from "react";
import { useSessionState } from "../hooks/useSessionState";
import {
  computeJournalProfit,
  JOURNAL_SALE_KEEP,
  professionForItem,
  resolveCraftFameFactor,
  type JournalProfession,
  type JournalProfitResult,
} from "./journals";

/** journals-{region}.json shape produced by scripts/refresh-journal-prices.mjs. */
export interface JournalData {
  region: string;
  cities: string[];
  tiers: number[];
  professions: JournalProfession[];
  journals: Record<string, Record<string, { empty: Record<string, number>; full: Record<string, number> }>>;
}

export type OwnedJournals = Record<JournalProfession, boolean>;

const ALL_OWNED: OwnedJournals = { warrior: true, hunter: true, mage: true, toolmaker: true };

/**
 * Pick a realistic empty-buy + full-sell price pair from a SINGLE city (you buy and sell the
 * journal at one place). Prefer the craft city; otherwise the single city that yields the best
 * empty→full margin among cities that list BOTH. Never mixes a cheap-empty city with a
 * different priced-full city, which would overstate the profit.
 */
function pickJournalPrices(
  empty: Record<string, number> | undefined,
  full: Record<string, number> | undefined,
  city: string
): { emptyBuy: number; fullSell: number } {
  const emptyAt = Number(empty?.[city] || 0);
  const fullAt = Number(full?.[city] || 0);
  if (emptyAt > 0 && fullAt > 0) return { emptyBuy: emptyAt, fullSell: fullAt };

  const cities = new Set<string>([...Object.keys(empty ?? {}), ...Object.keys(full ?? {})]);
  let best: { emptyBuy: number; fullSell: number; margin: number } | null = null;
  for (const c of cities) {
    const e = Number(empty?.[c] || 0);
    const f = Number(full?.[c] || 0);
    if (e <= 0 || f <= 0) continue;
    const margin = f * 0.935 - e;
    if (!best || margin > best.margin) best = { emptyBuy: e, fullSell: f, margin };
  }
  return best ? { emptyBuy: best.emptyBuy, fullSell: best.fullSell } : { emptyBuy: 0, fullSell: 0 };
}

/**
 * Loads journal price data for the region and holds the session-persistent journal settings
 * (whether journal profit is counted, and which profession journals the user fills).
 */
export function useJournals(region: "eu" | "us") {
  const [enabled, setEnabled] = useSessionState<boolean>("journals:enabled", false);
  const [owned, setOwned] = useSessionState<OwnedJournals>("journals:owned", ALL_OWNED);
  const [data, setData] = useState<JournalData | null>(null);

  useEffect(() => {
    let active = true;
    fetch(`/data/journals-${region}.json`)
      .then((res) => (res.ok ? res.json() : null))
      .then((json) => {
        if (active) setData(json && typeof json === "object" ? (json as JournalData) : null);
      })
      .catch(() => {
        if (active) setData(null);
      });
    return () => {
      active = false;
    };
  }, [region]);

  const toggleOwned = (profession: JournalProfession) =>
    setOwned((prev) => ({ ...ALL_OWNED, ...prev, [profession]: !(prev?.[profession] ?? true) }));

  // Stable merged reference so consumers memoising on `owned` don't recompute every render.
  const mergedOwned = useMemo(() => ({ ...ALL_OWNED, ...owned }), [owned]);

  return { enabled, setEnabled, owned: mergedOwned, toggleOwned, setOwned, data };
}

export interface JournalProfitQuery {
  categoryKey: string | null | undefined;
  itemId: string;
  tier: number;
  artifactId?: string | null;
  /** Σ of the recipe's material quantities for one craft. */
  totalResourceCount: number;
  /** City where journals are bought/sold (the craft city). */
  city: string;
}

/**
 * Resolve the per-craft journal profit for one item, or null when journals are disabled, the
 * item's profession is not owned, the tier has no journal, or no journal price is available.
 */
export function resolveJournalProfit(
  query: JournalProfitQuery,
  enabled: boolean,
  owned: OwnedJournals,
  data: JournalData | null
): (JournalProfitResult & { profession: JournalProfession }) | null {
  if (!enabled || !data) return null;
  const profession = professionForItem(query.categoryKey, query.itemId);
  if (!profession || !owned[profession]) return null;

  const tierData = data.journals?.[profession]?.[String(query.tier)];
  if (!tierData) return null;

  const { emptyBuy, fullSell } = pickJournalPrices(tierData.empty, tierData.full, query.city);

  const result = computeJournalProfit({
    tier: query.tier,
    totalResourceCount: query.totalResourceCount,
    craftFameFactor: resolveCraftFameFactor(query.artifactId),
    journalEmptyBuy: emptyBuy,
    journalFullSell: fullSell,
  });

  return result.available ? { ...result, profession } : null;
}

export interface JournalPriceRow {
  tier: number;
  empty: number;
  full: number;
  /** Profit from selling one full journal after tax, minus the empty buy (0 if a price is missing). */
  profit: number;
}

/**
 * Per-tier empty/full/profit table for one profession at a city (same single-city selection as the
 * profit calc). Mirrors the reference workbook's journal panel. Tiers 4–8.
 */
export function journalPriceTable(data: JournalData | null, profession: JournalProfession, city: string): JournalPriceRow[] {
  const profData = data?.journals?.[profession];
  return [4, 5, 6, 7, 8].map((tier) => {
    const tierData = profData?.[String(tier)];
    if (!tierData) return { tier, empty: 0, full: 0, profit: 0 };
    const { emptyBuy, fullSell } = pickJournalPrices(tierData.empty, tierData.full, city);
    const profit = emptyBuy > 0 && fullSell > 0 ? fullSell * JOURNAL_SALE_KEEP - emptyBuy : 0;
    return { tier, empty: emptyBuy, full: fullSell, profit };
  });
}
