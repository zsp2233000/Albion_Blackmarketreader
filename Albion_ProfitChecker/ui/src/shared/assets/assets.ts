import type { SyntheticEvent } from "react";

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
  foodPotionCrafterPreview: assetUrl("picture/food-potion-crafter-preview.png"),
  favicon: assetUrl("favicon.ico")
};

const ALBION_CDN_BASE = "https://render.albiononline.com/v1/item";

/**
 * onError handler for item icons:
 * 1st failure → try Albion's official CDN (covers tools / gather gear missing locally)
 * 2nd failure → swap to a neutral placeholder so a broken image never renders.
 */
export function onItemIconError(event: SyntheticEvent<HTMLImageElement>): void {
  const img = event.currentTarget;
  if (img.dataset.iconFallback === "cdn") {
    img.dataset.iconFallback = "placeholder";
    img.src = assetUrl("picture/accountsymbol.png");
    return;
  }
  if (img.dataset.iconFallback === "placeholder") return;
  const match = img.src.match(/\/itemicons\/([^/?#]+\.png)/);
  if (!match) {
    img.dataset.iconFallback = "placeholder";
    img.src = assetUrl("picture/accountsymbol.png");
    return;
  }
  img.dataset.iconFallback = "cdn";
  img.src = `${ALBION_CDN_BASE}/${match[1]}`;
}

