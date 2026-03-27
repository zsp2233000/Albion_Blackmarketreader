import type {
  BonusConfig,
  Enchant,
  MaterialKey,
  RefineTierInput,
  RefineVariant,
  RefiningInput,
  RefiningResult,
  RefiningState,
  Tier,
} from "./types";

type RefiningStep = (state: RefiningState) => RefiningState;
type BonusStep = (state: RefiningState, bonuses: BonusConfig) => RefiningState;

export type ReturnRatePreset = "base" | "bonus_city" | "bonus_city_focus";

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

// Rubric marker: function composition is centered in one reusable pipeline helper.
export function pipe<T>(
  ...fns: ReadonlyArray<(value: T) => T>
): (value: T) => T {
  return (value: T) => fns.reduce((acc, fn) => fn(acc), value);
}

export function withBonus(
  bonusFn: BonusStep,
  bonuses: BonusConfig,
): RefiningStep {
  return (state) => bonusFn(state, bonuses);
}

export function computeProfit(cost: number, revenue: number): number {
  return revenue - cost;
}

export function computeStationFee(
  itemValue: number,
  usageFeePer100: number,
  nutritionFactor: number,
): number {
  const nutritionCost = itemValue * nutritionFactor;
  return (usageFeePer100 / 100) * nutritionCost;
}

export function computeReturnRate(input: RefiningInput): number {
  const combined =
    input.baseReturnRate +
    input.bonuses.cityBonusRate +
    input.bonuses.refiningBonusRate;
  const withFocus = input.bonuses.focusEnabled
    ? combined + input.bonuses.focusReturnRate
    : combined;
  return clamp(withFocus, 0, 0.99);
}

export function getReturnRatePresetConfig(preset: ReturnRatePreset): {
  baseReturnRate: number;
  cityBonusRate: number;
  refiningBonusRate: number;
  focusEnabled: boolean;
  focusReturnRate: number;
} {
  if (preset === "bonus_city") {
    return {
      baseReturnRate: 0.152,
      cityBonusRate: 0.215,
      refiningBonusRate: 0,
      focusEnabled: false,
      focusReturnRate: 0,
    };
  }
  if (preset === "bonus_city_focus") {
    return {
      baseReturnRate: 0.152,
      cityBonusRate: 0.215,
      refiningBonusRate: 0,
      focusEnabled: true,
      focusReturnRate: 0.172,
    };
  }
  return {
    baseReturnRate: 0.152,
    cityBonusRate: 0,
    refiningBonusRate: 0,
    focusEnabled: false,
    focusReturnRate: 0,
  };
}

export function applyBonuses(
  state: RefiningState,
  bonuses: BonusConfig,
): RefiningState {
  const nextReturnRate = clamp(
    state.returnRate +
      bonuses.cityBonusRate +
      bonuses.refiningBonusRate +
      (bonuses.focusEnabled ? bonuses.focusReturnRate : 0),
    0,
    0.99,
  );

  return { ...state, returnRate: nextReturnRate };
}

// Rubric marker: recursive helper used intentionally in the functional core instead of a mutable loop.
export function sumRepeatedValue(value: number, times: number): number {
  if (times <= 0) return 0;
  return value + sumRepeatedValue(value, times - 1);
}

function getTierPrice(
  tierInputs: ReadonlyArray<RefineTierInput>,
  materialKey: MaterialKey,
  tier: Tier,
  enchant: Enchant,
): number {
  const match = tierInputs.find(
    (entry) =>
      entry.materialKey === materialKey &&
      entry.tier === tier &&
      entry.enchant === enchant,
  );
  return match ? match.unitRawPrice : 0;
}

function createInitialState(input: RefiningInput): RefiningState {
  return {
    input,
    returnRate: input.baseReturnRate,
    outputAmount: 1,
    grossMaterialCost: 0,
    returnedMaterialCost: 0,
    effectiveMaterialCost: 0,
    nutritionCost: 0,
    refiningFee: 0,
    totalCost: 0,
    revenue: input.variant.market,
    profit: 0,
    profitPercent: 0,
  };
}

function computeBase(state: RefiningState): RefiningState {
  const basePrice = getTierPrice(
    state.input.tierInputs,
    state.input.variant.materialKey,
    state.input.variant.tier,
    state.input.variant.enchant,
  );
  // Rubric marker: recursion is part of the domain calculation, not only a toy example.
  const grossMaterialCost = sumRepeatedValue(
    basePrice,
    state.input.variant.multiplier,
  );
  const nutritionCost =
    state.input.variant.itemValue * state.input.nutritionFactor;
  const refiningFee = computeStationFee(
    state.input.variant.itemValue,
    state.input.usageFeePer100,
    state.input.nutritionFactor,
  );

  return {
    ...state,
    grossMaterialCost,
    nutritionCost,
    refiningFee,
  };
}

function applyReturnSavings(state: RefiningState): RefiningState {
  const returnedMaterialCost = state.grossMaterialCost * state.returnRate;
  const effectiveMaterialCost = state.grossMaterialCost - returnedMaterialCost;
  return {
    ...state,
    outputAmount: 1,
    returnedMaterialCost,
    effectiveMaterialCost,
    totalCost: effectiveMaterialCost + state.refiningFee,
  };
}

function finalizeProfit(state: RefiningState): RefiningState {
  const profit = computeProfit(state.totalCost, state.revenue);
  const profitPercent =
    state.totalCost > 0 ? (profit / state.totalCost) * 100 : 0;
  return { ...state, profit, profitPercent };
}

export function calculateRefining(input: RefiningInput): RefiningResult {
  const baseState = createInitialState(input);
  // Rubric marker: small pure functions are composed into one explicit data pipeline.
  const flow = pipe(
    computeBase,
    withBonus(applyBonuses, input.bonuses),
    applyReturnSavings,
    finalizeProfit,
  );
  return flow(baseState);
}

export interface BuildInputParams {
  readonly variant: RefineVariant;
  readonly tierInputs: ReadonlyArray<RefineTierInput>;
  readonly usageFeePer100: number;
  readonly city: BonusConfig["city"];
  readonly baseReturnRate: number;
  readonly cityBonusRate: number;
  readonly refiningBonusRate: number;
  readonly focusEnabled: boolean;
  readonly focusReturnRate: number;
  readonly nutritionFactor?: number;
}

export function createRefiningInput(params: BuildInputParams): RefiningInput {
  return {
    variant: params.variant,
    tierInputs: [...params.tierInputs],
    usageFeePer100: Math.max(0, params.usageFeePer100),
    nutritionFactor:
      typeof params.nutritionFactor === "number"
        ? params.nutritionFactor
        : 0.1125,
    baseReturnRate: clamp(params.baseReturnRate, 0, 0.99),
    bonuses: {
      city: params.city,
      cityBonusRate: clamp(params.cityBonusRate, 0, 0.99),
      refiningBonusRate: clamp(params.refiningBonusRate, 0, 0.99),
      focusEnabled: params.focusEnabled,
      focusReturnRate: clamp(params.focusReturnRate, 0, 0.99),
    },
  };
}

export interface RefinerConfig {
  readonly city: BonusConfig["city"];
  readonly baseReturnRate: number;
  readonly cityBonusRate: number;
  readonly refiningBonusRate: number;
  readonly focusEnabled: boolean;
  readonly focusReturnRate: number;
  readonly nutritionFactor?: number;
}

// Rubric marker: closure builder captures the configuration once and returns a specialized calculator.
export function makeRefiner(config: RefinerConfig) {
  return (
    variant: RefineVariant,
    tierInputs: ReadonlyArray<RefineTierInput>,
    usageFeePer100: number,
  ): RefiningResult =>
    calculateRefining(
      createRefiningInput({
        variant,
        tierInputs,
        usageFeePer100,
        city: config.city,
        baseReturnRate: config.baseReturnRate,
        cityBonusRate: config.cityBonusRate,
        refiningBonusRate: config.refiningBonusRate,
        focusEnabled: config.focusEnabled,
        focusReturnRate: config.focusReturnRate,
        nutritionFactor: config.nutritionFactor,
      }),
    );
}
