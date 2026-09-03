import type { HolderBalance } from "./types.js";

/**
 * Accounts that must not receive cashback.
 *
 * The treasury is the source of the payout, so including it would have it pay
 * itself. The mint authority holds no allocation by design, but it is excluded
 * explicitly rather than relying on that.
 */
export interface EligibilityExclusions {
  readonly excludedOwners: readonly string[];
}

export interface EligibleSet {
  readonly entries: readonly HolderBalance[];
  /** Sum of the surviving entries' balances, the denominator for pro-rata shares. */
  readonly totalEligibleRaw: bigint;
  readonly excludedCount: number;
}

/**
 * Filter a snapshot down to the accounts that should receive cashback, and
 * recompute the total over only those.
 *
 * Zero-balance accounts are dropped: they are entitled to nothing, and keeping
 * them would put empty rows in the plan and inflate the dust bound.
 */
export function selectEligible(
  holders: readonly HolderBalance[],
  exclusions: EligibilityExclusions,
): EligibleSet {
  const excluded = new Set(exclusions.excludedOwners);
  const entries: HolderBalance[] = [];
  let totalEligibleRaw = 0n;

  for (const holder of holders) {
    if (holder.balanceRaw < 0n) {
      throw new Error(
        `Holder ${holder.owner} has a negative balance (${holder.balanceRaw}); the snapshot is corrupt.`,
      );
    }

    if (excluded.has(holder.owner) || holder.balanceRaw === 0n) {
      continue;
    }

    entries.push(holder);
    totalEligibleRaw += holder.balanceRaw;
  }

  return {
    entries,
    totalEligibleRaw,
    excludedCount: holders.length - entries.length,
  };
}
