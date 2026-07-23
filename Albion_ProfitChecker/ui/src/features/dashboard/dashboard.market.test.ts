import { describe, expect, it } from "vitest";
import { filterDashboardResults, mergeDashboardResults, type DashboardResultItem } from "./dashboard.market";

const results: DashboardResultItem[] = [
  { city: "Lymhurst", id: "T4_MAIN_SWORD", lym: 1000, bm: 1500, sold: 10, profit: 50, span: "14d", source: "api", observedAt: null },
  { city: "Martlock", id: "T4_MAIN_AXE", lym: 1000, bm: 1600, sold: 8, profit: 60, span: "14d", source: "api", observedAt: null }
];

describe("dashboard market source merge", () => {
  it("overlays fresh local BM prices and recalculates profit", () => {
    const merged = mergeDashboardResults(results, {
      generatedAt: "2026-01-01T00:00:00Z",
      items: [{ id: "T4_MAIN_SWORD", bm: 2000, source: "local", observedAt: "2026-01-01T00:05:00Z" }]
    });

    expect(merged[0]).toMatchObject({ bm: 2000, profit: 100, source: "local", observedAt: "2026-01-01T00:05:00Z" });
    expect(merged[1]).toMatchObject({ bm: 1600, profit: 60, source: "api" });
  });

  it("filters dashboard cards by source", () => {
    const merged = mergeDashboardResults(results, {
      generatedAt: "2026-01-01T00:00:00Z",
      items: [{ id: "T4_MAIN_SWORD", bm: 2000, source: "local" }]
    });

    expect(filterDashboardResults(merged, "local").map((item) => item.id)).toEqual(["T4_MAIN_SWORD"]);
    expect(filterDashboardResults(merged, "api").map((item) => item.id)).toEqual(["T4_MAIN_AXE"]);
  });
});
