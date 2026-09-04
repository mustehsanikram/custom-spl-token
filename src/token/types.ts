/**
 * Contracts for the mint and its transfer fee configuration.
 *
 * Load-bearing: features 4 through 10 read the mint address and fee state
 * through these shapes. Amounts are bigint base units, as everywhere else.
 */

/** Result of creating the mint. */
export interface CreatedMint {
  readonly mintAddress: string;
  readonly signature: string;
  readonly decimals: number;
  readonly transferFeeBasisPoints: number;
  readonly maximumFeeRaw: bigint;
}

/** The mint's transfer fee configuration, read back from the chain. */
export interface MintFeeState {
  /** The rate in effect right now. */
  readonly basisPoints: number;
  readonly maximumFeeRaw: bigint;
  readonly configAuthority: string | null;
  readonly withdrawAuthority: string | null;
  /**
   * Epochs the older and newer fees activate at. A scheduled change sits in the
   * newer slot with a future epoch, which is how the two-epoch delay is visible
   * before it takes effect (feature 5).
   */
  readonly olderEpoch: bigint;
  readonly newerEpoch: bigint;
  /** Fees harvested to the mint, awaiting withdrawal (feature 7). */
  readonly withheldAmountRaw: bigint;
  readonly supplyRaw: bigint;
  readonly decimals: number;
}
