import type { RefineTierInput, RefineVariant, RefiningResult } from "./types";

/**
 * "Stacking" refining logic.
 *
 * Standard refining buys the lower-tier refined material at its market price.
 * Stacking instead self-refines that lower-tier material whenever doing so is cheaper,
 * cascading down tier by tier. At every tier we take min(market price, self-refine cost),
 * so the cheapest path ("optimal Stack From") emerges automatically. Each self-refined
 * step pays its own refining fee and gets its own return-rate savings, exactly like the
 * source workbook's Stack-From / Refine-Tier mechanic.
 */

/** A function that runs the configured single-tier refiner (bonuses, fee, tax, amount all baked in). */
export type RefineFn = (variant: RefineVariant, tierInputs: ReadonlyArray<RefineTierInput>) => RefiningResult;

export interface StackedRefining {
  /** Refining result for the target, with its refined input priced at the optimal cost. */
  readonly result: RefiningResult;
  /** Lower tiers that are cheaper to self-refine than to buy (ascending). Empty = behaves like standard. */
  readonly selfRefinedTiers: ReadonlyArray<number>;
  /** Optimal unit cost used for the target's refined input (market or self-refine, whichever is cheaper). */
  readonly refinedInputUnitCost: number;
  /** Market unit cost of that refined input (for comparison / display). */
  readonly refinedInputMarketCost: number;
  /** False when a required price is missing along the chosen path. */
  readonly available: boolean;
}

interface UnitCost {
  readonly unitCost: number;
  readonly selfRefined: boolean;
  /** Tiers self-refined on this path (ascending). */
  readonly chain: ReadonlyArray<number>;
  readonly available: boolean;
}

/** One refine step on the chosen path, with the exact inputs + resulting per-unit cost. */
export interface StackStep {
  readonly tier: number;
  readonly enchant: number;
  readonly outputItemId: string;
  readonly rawItemId: string;
  readonly rawQty: number;
  readonly rawUnitPrice: number;
  /** Refined material fed into this step (null on the lowest, raw-only tier). */
  readonly refinedInputItemId: string | null;
  readonly refinedInputTier: number;
  readonly refinedInputEnchant: number;
  readonly refinedInputQty: number;
  /** Unit cost of that refined input — market price for the bought base, self-cost upstream. */
  readonly refinedInputUnitCost: number;
  /** Resulting cost to produce one refined unit at this tier (incl. fee, after return). */
  readonly outputUnitCost: number;
  readonly isTarget: boolean;
}

export interface StackPath {
  /** The refined material bought at the bottom of the chain (null when it starts from raw). */
  readonly baseRefinedItemId: string | null;
  readonly baseRefinedTier: number | null;
  readonly baseRefinedEnchant: number;
  readonly baseRefinedUnitCost: number;
  readonly steps: ReadonlyArray<StackStep>;
}

/**
 * Shared context for one render pass: a memoised optimal-unit-cost resolver plus the
 * per-variant stacking entry point. Build once, reuse for every variant.
 */
export function createStackingContext(
  variantByItemId: ReadonlyMap<string, RefineVariant>,
  baseTierInputs: ReadonlyArray<RefineTierInput>,
  refine: RefineFn,
) {
  const priceByItemId = new Map<string, number>();
  for (const entry of baseTierInputs) priceByItemId.set(entry.itemId, entry.unitPrice);

  // Override one refined ingredient's price, leaving everything else at market.
  function withRefinedPrice(itemId: string, unitPrice: number): ReadonlyArray<RefineTierInput> {
    return baseTierInputs.map((entry) => (entry.itemId === itemId ? { ...entry, unitPrice } : entry));
  }

  /** Per-output-unit cost to self-refine `variant`, given its refined input already priced. */
  function selfRefineUnitCost(variant: RefineVariant, tierInputs: ReadonlyArray<RefineTierInput>): number {
    const r = refine(variant, tierInputs);
    if (r.missingInputCost || r.outputAmount <= 0) return Number.POSITIVE_INFINITY;
    return r.totalCost / r.outputAmount;
  }

  const memo = new Map<string, UnitCost>();

  function optimalUnitCost(itemId: string): UnitCost {
    const cached = memo.get(itemId);
    if (cached) return cached;
    // Guard against accidental cycles in the recipe graph.
    memo.set(itemId, { unitCost: 0, selfRefined: false, chain: [], available: false });

    const market = priceByItemId.get(itemId) ?? 0;
    const variant = variantByItemId.get(itemId);

    let resolved: UnitCost;
    if (!variant) {
      // No refining recipe for this item (chain floor): only the market price is available.
      resolved = { unitCost: market, selfRefined: false, chain: [], available: market > 0 };
    } else {
      const refinedIng = variant.ingredients.find((ing) => ing.kind === "refined");
      let selfCost = Number.POSITIVE_INFINITY;
      let childChain: ReadonlyArray<number> = [];
      let childAvailable = true;

      if (refinedIng) {
        const child = optimalUnitCost(refinedIng.itemId);
        childChain = child.chain;
        childAvailable = child.available;
        if (child.available) {
          selfCost = selfRefineUnitCost(variant, withRefinedPrice(refinedIng.itemId, child.unitCost));
        }
      } else {
        // No refined input (lowest refinable tier): self-refine from raw only.
        selfCost = selfRefineUnitCost(variant, baseTierInputs);
        childAvailable = true;
      }

      const marketOk = market > 0;
      const selfOk = Number.isFinite(selfCost) && childAvailable;

      if (marketOk && (!selfOk || market <= selfCost)) {
        resolved = { unitCost: market, selfRefined: false, chain: childChain, available: true };
      } else if (selfOk) {
        resolved = { unitCost: selfCost, selfRefined: true, chain: [...childChain, variant.tier], available: true };
      } else {
        resolved = { unitCost: market, selfRefined: false, chain: childChain, available: marketOk };
      }
    }

    memo.set(itemId, resolved);
    return resolved;
  }

  function stackFor(target: RefineVariant): StackedRefining {
    const refinedIng = target.ingredients.find((ing) => ing.kind === "refined");
    if (!refinedIng) {
      // Lowest refinable tier has no refined input — stacking is identical to standard.
      const result = refine(target, baseTierInputs);
      return {
        result,
        selfRefinedTiers: [],
        refinedInputUnitCost: 0,
        refinedInputMarketCost: 0,
        available: !result.missingInputCost,
      };
    }

    const child = optimalUnitCost(refinedIng.itemId);
    const marketCost = priceByItemId.get(refinedIng.itemId) ?? 0;
    const tierInputs = child.selfRefined
      ? withRefinedPrice(refinedIng.itemId, child.unitCost)
      : baseTierInputs;
    const result = refine(target, tierInputs);

    return {
      result,
      selfRefinedTiers: child.chain,
      refinedInputUnitCost: child.selfRefined ? child.unitCost : marketCost,
      refinedInputMarketCost: marketCost,
      available: child.available && !result.missingInputCost,
    };
  }

  // Ordered, fully-priced steps for the chosen (cheapest) path — for visual display.
  function pathFor(target: RefineVariant): StackPath {
    const findRaw = (v: RefineVariant) => v.ingredients.find((ing) => ing.kind === "raw");
    const findRefined = (v: RefineVariant) => v.ingredients.find((ing) => ing.kind === "refined");

    const targetRefined = findRefined(target);
    const selfTiers = targetRefined ? optimalUnitCost(targetRefined.itemId).chain : [];
    const startTier = selfTiers.length ? Math.min(...selfTiers) : target.tier;

    // Walk down from the target collecting the variants we will self-refine (tier >= startTier).
    const chain: RefineVariant[] = [];
    let node: RefineVariant | undefined = target;
    while (node && node.tier >= startTier) {
      chain.push(node);
      const refined = findRefined(node);
      node = refined ? variantByItemId.get(refined.itemId) : undefined;
    }
    chain.reverse();

    const base = chain.length ? findRefined(chain[0]) : undefined;
    const baseRefinedItemId = base ? base.itemId : null;
    const baseRefinedTier = base ? base.tier : null;
    const baseRefinedEnchant = base ? base.enchant : 0;
    const baseRefinedUnitCost = base ? priceByItemId.get(base.itemId) ?? 0 : 0;

    let prevCost = baseRefinedUnitCost;
    const steps: StackStep[] = chain.map((variant) => {
      const raw = findRaw(variant);
      const refined = findRefined(variant);
      const refinedInputUnitCost = refined ? prevCost : 0;
      const tierInputs = refined ? withRefinedPrice(refined.itemId, refinedInputUnitCost) : baseTierInputs;
      const r = refine(variant, tierInputs);
      const outputUnitCost = r.outputAmount > 0 ? r.totalCost / r.outputAmount : 0;
      prevCost = outputUnitCost;
      return {
        tier: variant.tier,
        enchant: variant.enchant,
        outputItemId: variant.itemId,
        rawItemId: raw?.itemId ?? "",
        rawQty: raw?.quantity ?? 0,
        rawUnitPrice: priceByItemId.get(raw?.itemId ?? "") ?? 0,
        refinedInputItemId: refined?.itemId ?? null,
        refinedInputTier: refined?.tier ?? 0,
        refinedInputEnchant: refined?.enchant ?? 0,
        refinedInputQty: refined?.quantity ?? 0,
        refinedInputUnitCost,
        outputUnitCost,
        isTarget: variant.tier === target.tier,
      };
    });

    return { baseRefinedItemId, baseRefinedTier, baseRefinedEnchant, baseRefinedUnitCost, steps };
  }

  return { stackFor, optimalUnitCost, pathFor };
}
