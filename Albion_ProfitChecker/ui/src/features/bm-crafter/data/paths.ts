import type { DataKind } from "./types";
import type { MarketRegion } from "../domain";

function routeLocalUrl(file: string, locationHref?: string): string | null {
  if (!locationHref) return null;
  const base = locationHref.endsWith("/") ? locationHref : `${locationHref}/`;
  try {
    return new URL(file, base).toString();
  } catch {
    return null;
  }
}

function regionFile(kind: Exclude<DataKind, "recipes">, region: MarketRegion): string {
  const suffix = region === "us" ? "us" : "eu";
  if (kind === "bm") return `bm-crafter-${suffix}.json`;
  if (kind === "materials") return `materials-${suffix}.json`;
  return `artefacts-${suffix}.json`;
}

export function buildDataPaths(kind: DataKind, region: MarketRegion, locationHref?: string): string[] {
  if (kind === "recipes") {
    const file = "items-categorized-crafting.json";
    const paths = [
      `/${file}`,
      routeLocalUrl(file, locationHref),
      `./${file}`
    ];
    return paths.filter((v): v is string => Boolean(v));
  }

  const file = regionFile(kind, region);
  const rootDataPath = `/data/${file}`;
  const relativePath = `./data/${file}`;
  const routeLocalPath = routeLocalUrl(`data/${file}`, locationHref);
  const paths = [rootDataPath, routeLocalPath, relativePath];
  return paths.filter((v): v is string => Boolean(v));
}
