export type DashboardMarketSource = "local" | "api";

export interface DashboardResultItem {
  city: string;
  id: string;
  lym: number;
  bm: number;
  sold: number;
  profit: number;
  span: string;
  source: DashboardMarketSource;
  observedAt: string | null;
}

export interface DashboardMarketItem {
  id: string;
  bm: number | null;
  source?: DashboardMarketSource;
  observedAt?: string | null;
}

export interface DashboardMarketSnapshot {
  generatedAt: string | null;
  items: DashboardMarketItem[];
}

export function mergeDashboardResults(
  results: DashboardResultItem[],
  snapshot: DashboardMarketSnapshot | null
): DashboardResultItem[] {
  if (!snapshot) return results.map((item) => ({ ...item, source: "api", observedAt: null }));

  const byItemId = new Map(snapshot.items.map((item) => [item.id, item]));
  return results.map((item) => {
    const marketItem = byItemId.get(item.id);
    const localPrice = marketItem?.source === "local" && typeof marketItem.bm === "number" && Number.isFinite(marketItem.bm)
      ? marketItem.bm
      : null;
    if (localPrice !== null) {
      const profit = item.lym > 0 ? ((localPrice - item.lym) / item.lym) * 100 : item.profit;
      return {
        ...item,
        bm: localPrice,
        profit: Number.isFinite(profit) ? profit : item.profit,
        source: "local",
        observedAt: marketItem?.observedAt ?? snapshot.generatedAt
      };
    }

    return {
      ...item,
      source: "api",
      observedAt: marketItem?.observedAt ?? snapshot.generatedAt
    };
  });
}

export function filterDashboardResults(
  results: DashboardResultItem[],
  sourceFilter: "all" | DashboardMarketSource
): DashboardResultItem[] {
  if (sourceFilter === "all") return results;
  return results.filter((item) => item.source === sourceFilter);
}

