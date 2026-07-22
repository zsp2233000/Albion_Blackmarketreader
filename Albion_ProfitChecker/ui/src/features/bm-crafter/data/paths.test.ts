import { describe, expect, it } from "vitest";
import { buildDataPaths } from "./paths";

describe("bm crafter data path builder", () => {
  it("builds bm/material paths with fallback order", () => {
    const paths = buildDataPaths("bm", "us", "https://blackmarketreader.com/Blackmarket-Crafter");
    expect(paths[0]).toBe("/data/bm-crafter-us.json");
    expect(paths).toContain("./data/bm-crafter-us.json");
  });

  it("builds recipe paths", () => {
    const paths = buildDataPaths("recipes", "eu", "https://blackmarketreader.com/Blackmarket-Crafter");
    expect(paths[0]).toBe("/items-categorized-crafting.json");
    expect(paths).toContain("./items-categorized-crafting.json");
  });

  it("builds Asia data paths without falling back to Europe", () => {
    const paths = buildDataPaths("bm", "asia", "https://blackmarketreader.com/Blackmarket-Crafter");
    expect(paths[0]).toBe("/data/bm-crafter-asia.json");
    expect(paths).toContain("./data/bm-crafter-asia.json");
    expect(paths.every((path) => !path.includes("bm-crafter-eu.json"))).toBe(true);
  });

  it("prefers the local capture endpoint on localhost", () => {
    const paths = buildDataPaths("bm", "eu", "http://localhost:5173/bm-crafter");
    expect(paths[0]).toBe("http://localhost:5173/api/local/bm-crafter-eu.json");
    expect(paths).toContain("/data/bm-crafter-eu.json");
  });
});
