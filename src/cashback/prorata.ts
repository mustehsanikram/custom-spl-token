import type { HolderBalance } from "./types.js";

export interface ShareRow {
  readonly holder: HolderBalance;
  /** What this holder is entitled to receive, before any transfer fee. */
  readonly netShareRaw: bigint;
}

export interface ShareAllocation {
  readonly rows: readonly ShareRow[];
  /**
   * The integer-division remainder. Stays in the treasury and rolls into the
   * next round rather than being handed to an arbitrary holder.
   */
  readonly dustRaw: bigint;
}

/**
 * Split `distributableRaw` across holders in proportion to their snapshot
 * balances.
 *
 * Shares are floored, so the parts always sum to slightly less than the whole.
 * The shortfall is the dust, and it is bounded: each holder loses under one
 * base unit to flooring, so `dustRaw < entries.length`.
 */
export function computeShares(
  entries: readonly HolderBalance[],
  totalEligibleRaw: bigint,
  distributableRaw: bigint,
): ShareAllocation {
  if (distributableRaw < 0n) {
    throw new Error(`distributableRaw cannot be negative, got: ${distributableRaw}`);
  }

  if (totalEligibleRaw < 0n) {
    throw new Error(`totalEligibleRaw cannot be negative, got: ${totalEligibleRaw}`);
  }

  // A total that disagrees with the entries would silently dilute or inflate
  // every share, so treat the mismatch as a programming error, not input.
  const actualTotal = entries.reduce((sum, entry) => sum + entry.balanceRaw, 0n);
  if (actualTotal !== totalEligibleRaw) {
    throw new Error(
      `totalEligibleRaw (${totalEligibleRaw}) does not match the sum of entries (${actualTotal}).`,
    );
  }

  // Nothing to divide by, or nothing to divide: the whole amount stays behind.
  if (entries.length === 0 || totalEligibleRaw === 0n) {
    return { rows: [], dustRaw: distributableRaw };
  }

  let allocated = 0n;
  const rows = entries.map((holder) => {
    const netShareRaw = (distributableRaw * holder.balanceRaw) / totalEligibleRaw;
    allocated += netShareRaw;
    return { holder, netShareRaw };
  });

  return { rows, dustRaw: distributableRaw - allocated };
}
