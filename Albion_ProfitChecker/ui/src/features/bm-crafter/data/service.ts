import { fetchJson } from "@shared/api/apiClient";
import type { MarketRegion } from "../domain";
import type { BmCrafterDataBundle, DataKind, LoadJsonOptions } from "./types";
import { buildDataPaths } from "./paths";
import { normalizeCityMaterialsPayload, normalizeMarketPayload, normalizePricePayload, normalizeRecipesPayload } from "./normalizers";

interface FetchWithFallbackArgs {
  paths: string[];
  dedupeKeyBase: string;
  options?: LoadJsonOptions;
}

async function fetchWithFallback<T = unknown>(args: FetchWithFallbackArgs): Promise<T> {
  const { paths, dedupeKeyBase, options } = args;
  let lastError: unknown = null;

  for (let i = 0; i < paths.length; i += 1) {
    const path = paths[i];
    const url = options?.cacheBust ? `${path}${path.includes("?") ? "&" : "?"}v=${Date.now()}` : path;
    try {
      return await fetchJson<T>(url, {
        retries: 0,
        dedupeKey: `${dedupeKeyBase}:${i}`
      });
    } catch (error) {
      lastError = error;
    }
  }

  throw lastError ?? new Error("Failed to load JSON data from all fallback paths.");
}

function getLocationHref(): string | undefined {
  if (typeof window === "undefined" || !window.location?.href) return undefined;
  return window.location.href;
}

function getPaths(kind: DataKind, region: MarketRegion): string[] {
  return buildDataPaths(kind, region, getLocationHref());
}

export class BmCrafterDataService {
  async loadMarket(region: MarketRegion, options?: LoadJsonOptions) {
    const payload = await fetchWithFallback({
      paths: getPaths("bm", region),
      dedupeKeyBase: `bm-crafter-market:${region}`,
      options
    });
    return normalizeMarketPayload(payload, region);
  }

  async loadMaterials(region: MarketRegion, options?: LoadJsonOptions) {
    const payload = await fetchWithFallback({
      paths: getPaths("materials", region),
      dedupeKeyBase: `bm-crafter-materials:${region}`,
      options
    });
    return normalizePricePayload(payload, region);
  }

  async loadCityMaterials(region: MarketRegion, options?: LoadJsonOptions) {
    const payload = await fetchWithFallback({
      paths: getPaths("materials-cities", region),
      dedupeKeyBase: `bm-crafter-city-materials:${region}`,
      options
    });
    return normalizeCityMaterialsPayload(payload);
  }

  async loadArtefacts(region: MarketRegion, options?: LoadJsonOptions) {
    const payload = await fetchWithFallback({
      paths: getPaths("artefacts", region),
      dedupeKeyBase: `bm-crafter-artefacts:${region}`,
      options
    });
    return normalizePricePayload(payload, region);
  }

  async loadRecipes(options?: LoadJsonOptions) {
    const payload = await fetchWithFallback({
      paths: getPaths("recipes", "eu"),
      dedupeKeyBase: "bm-crafter-recipes",
      options
    });
    return normalizeRecipesPayload(payload);
  }

  async loadAll(region: MarketRegion, options?: LoadJsonOptions): Promise<BmCrafterDataBundle> {
    const [market, materials, cityMaterials, artefacts, recipes] = await Promise.all([
      this.loadMarket(region, options),
      this.loadMaterials(region, options),
      this.loadCityMaterials(region, options),
      this.loadArtefacts(region, options),
      this.loadRecipes(options)
    ]);

    return {
      region,
      market,
      materials,
      cityMaterials,
      artefacts,
      recipes
    };
  }
}

export { fetchWithFallback };
