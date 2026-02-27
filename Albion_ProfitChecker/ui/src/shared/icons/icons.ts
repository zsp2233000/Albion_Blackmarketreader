import { assetUrl } from "../assets/assets";

export const iconMap = {
  home: assetUrl("picture/Carleon.png"),
  lymhurst: assetUrl("picture/Lymhurstwappen.png"),
  martlock: assetUrl("picture/Martlockwappen.png"),
  bridgewatch: assetUrl("picture/Bridgewatch.png"),
  thetford: assetUrl("picture/Thefortwappen.png"),
  fortSterling: assetUrl("picture/Fortsterlingwappen.png")
} as const;

export type IconName = keyof typeof iconMap;

