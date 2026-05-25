export const ASSET_BASE = "/";

export function assetUrl(path: string): string {
  const clean = String(path || "").replace(/^\/+/, "");
  return `${ASSET_BASE}${clean}`;
}

export const assets = {
  logo: assetUrl("picture/testo ohne background.png"),
  avatarFallback: assetUrl("picture/accountsymbol.png"),
  bmCrafterPreview: assetUrl("picture/bm-crafter-table.png"),
  craftingCalcPreview: assetUrl("picture/crafting-calc-preview.png"),
  refiningCalcPreview: assetUrl("picture/refining-calc-preview.png"),
  favicon: assetUrl("favicon.ico")
};

