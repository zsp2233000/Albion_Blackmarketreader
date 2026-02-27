export type City = "Bridgewatch" | "Lymhurst" | "Fort Sterling" | "Martlock" | "Thetford" | "Caerleon";
export type MarketRegion = "eu" | "us";
export type Tier = 4 | 5 | 6 | 7 | 8;
export type Enchant = 0 | 1 | 2 | 3 | 4;
export type MaterialKey = "metal" | "wood" | "fiber" | "hide";

export interface RefineTierInput {
  readonly materialKey: MaterialKey;
  readonly tier: Tier;
  readonly unitRawPrice: number;
}

export interface RefineVariant {
  readonly id: string;
  readonly itemId: string;
  readonly materialKey: MaterialKey;
  readonly label: string;
  readonly tier: Tier;
  readonly enchant: Enchant;
  readonly multiplier: number;
  readonly market: number;
  readonly itemValue: number;
  readonly icon: string;
  readonly trend: string;
}

export interface BonusConfig {
  readonly city: City;
  readonly cityBonusRate: number;
  readonly refiningBonusRate: number;
  readonly focusEnabled: boolean;
  readonly focusReturnRate: number;
}

export interface RefiningInput {
  readonly variant: RefineVariant;
  readonly tierInputs: ReadonlyArray<RefineTierInput>;
  readonly usageFeePer100: number;
  readonly nutritionFactor: number;
  readonly baseReturnRate: number;
  readonly bonuses: BonusConfig;
}

export interface RefiningState {
  readonly input: RefiningInput;
  readonly returnRate: number;
  readonly outputAmount: number;
  readonly grossMaterialCost: number;
  readonly returnedMaterialCost: number;
  readonly effectiveMaterialCost: number;
  readonly nutritionCost: number;
  readonly refiningFee: number;
  readonly totalCost: number;
  readonly revenue: number;
  readonly profit: number;
  readonly profitPercent: number;
}

export type RefiningResult = RefiningState;
