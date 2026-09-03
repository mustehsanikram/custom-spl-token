import { grossUpForNet, type TransferFeeParams } from "../lib/fee.js";
import { selectEligible, type EligibilityExclusions } from "./eligibility.js";
import { computeShares } from "./prorata.js";
import type { DistributionPlan, DistributionRow, HolderBalance } from "./types.js";

export interface BuildDistributionPlanInput {
  /** The snapshot, before exclusions. */
  readonly holders: readonly HolderBalance[];
  readonly exclusions: EligibilityExclusions;
  /** How much holders should receive in total, net of fees. */
  readonly distributableRaw: bigint;
  /** What the treasury actually holds and can spend. */
  readonly treasuryBalanceRaw: bigint;
  readonly feeParams: TransferFeeParams;
}

/**
 * Compute a complete cashback round without sending anything.
 *
 * Every payout is grossed up, because Token-2022 taxes the payout transfers
 * themselves. The treasury therefore spends more than `distributableRaw`, and
 * the difference grows with the fee rate.
 *
 * **`distributableRaw` must be meaningfully below `treasuryBalanceRaw`.**
 * Distributing the entire treasury balance can never work: the gross always
 * exceeds the net, so the plan comes back not executable. A caller wanting to
 * empty the treasury has to solve for a distributable amount whose gross fits,
 * roughly `treasuryBalanceRaw * (10000 - basisPoints) / 10000`.
 *
 * The round is all or nothing. A plan that the treasury cannot cover is
 * returned with `executable: false` and every row intact, so the caller can
 * inspect it, rather than paying some holders and stranding the rest.
 */
export function buildDistributionPlan(input: BuildDistributionPlanInput): DistributionPlan {
  const { holders, exclusions, distributableRaw, treasuryBalanceRaw, feeParams } = input;

  if (treasuryBalanceRaw < 0n) {
    throw new Error(`treasuryBalanceRaw cannot be negative, got: ${treasuryBalanceRaw}`);
  }

  const eligible = selectEligible(holders, exclusions);
  const allocation = computeShares(
    eligible.entries,
    eligible.totalEligibleRaw,
    distributableRaw,
  );

  const rows: DistributionRow[] = [];
  let totalGrossRaw = 0n;

  for (const { holder, netShareRaw } of allocation.rows) {
    // A zero share means a zero-value transfer: pure cost, no effect.
    if (netShareRaw === 0n) {
      continue;
    }

    const { grossRaw, feeRaw } = grossUpForNet(feeParams, netShareRaw);
    totalGrossRaw += grossRaw;

    rows.push({
      owner: holder.owner,
      tokenAccount: holder.tokenAccount,
      balanceRaw: holder.balanceRaw,
      netShareRaw,
      grossSendRaw: grossRaw,
      feeRaw,
    });
  }

  if (totalGrossRaw > treasuryBalanceRaw) {
    return {
      distributableRaw,
      rows,
      dustRaw: allocation.dustRaw,
      totalGrossRaw,
      executable: false,
      reason: `Treasury holds ${treasuryBalanceRaw} but the round needs ${totalGrossRaw} to net holders ${distributableRaw} after fees.`,
    };
  }

  return {
    distributableRaw,
    rows,
    dustRaw: allocation.dustRaw,
    totalGrossRaw,
    executable: true,
  };
}
