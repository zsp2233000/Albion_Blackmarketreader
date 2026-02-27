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
});
