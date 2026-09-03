/**
 * Contracts shared across the cashback pipeline.
 *
 * Load-bearing: the snapshot (feature 8), the distributor (feature 9), and the
 * demo (feature 10) all consume these shapes. Every amount is bigint base
 * units. No `number`, no floating point, anywhere in this pipeline.
 */

/** One token account's balance at snapshot time. */
export interface HolderBalance {
  /** Token account address, base58. */
  readonly tokenAccount: string;
  /** Owner of that token account, base58. */
  readonly owner: string;
  readonly balanceRaw: bigint;
}

/** One holder's payout within a distribution round. */
export interface DistributionRow {
  readonly owner: string;
  readonly tokenAccount: string;
  /** Snapshot balance the share was computed from. */
  readonly balanceRaw: bigint;
  /** What the holder must end up receiving. */
  readonly netShareRaw: bigint;
  /** What the treasury sends so the holder nets the above, after the fee. */
  readonly grossSendRaw: bigint;
  /** grossSendRaw - netShareRaw. */
  readonly feeRaw: bigint;
}

/** A complete round, computed before any transfer is sent. */
export interface DistributionPlan {
  /** Treasury balance being distributed this round. */
  readonly distributableRaw: bigint;
  readonly rows: readonly DistributionRow[];
  /** Integer-division remainder, retained in the treasury and rolled forward. */
  readonly dustRaw: bigint;
  /** Sum of every row's grossSendRaw. */
  readonly totalGrossRaw: bigint;
  /** False when the treasury cannot cover totalGrossRaw. */
  readonly executable: boolean;
  readonly reason?: string;
}
