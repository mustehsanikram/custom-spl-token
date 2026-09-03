/**
 * Token-2022 transfer fee arithmetic.
 *
 * The rule mirrored here is the on-chain one, not an approximation of it:
 *
 *   fee = min(ceil(amount * basisPoints / 10000), maximumFee)
 *
 * with a short circuit to zero when either the rate or the amount is zero.
 * `(n + d - 1) / d` on integers is ceiling division, which is how the program
 * rounds - always up, never toward the holder. `tests/lib/fee.test.ts` asserts
 * parity against `calculateFee` from `@solana/spl-token` so this cannot drift.
 */

/** Basis points are hundredths of a percent, so 10000 is 100%. */
const ONE_IN_BASIS_POINTS = 10_000n;
const MAX_BASIS_POINTS = 10_000;

export interface TransferFeeParams {
  /** Protocol range is 0 to 10000. This project further restricts it to 0-200 in config.ts. */
  readonly basisPoints: number;
  /** Absolute per-transfer cap, in base units. */
  readonly maximumFee: bigint;
}

function assertParams(params: TransferFeeParams): void {
  const { basisPoints, maximumFee } = params;

  if (!Number.isInteger(basisPoints) || basisPoints < 0 || basisPoints > MAX_BASIS_POINTS) {
    throw new Error(
      `basisPoints must be an integer between 0 and ${MAX_BASIS_POINTS}, got: ${basisPoints}`,
    );
  }

  if (maximumFee < 0n) {
    throw new Error(`maximumFee cannot be negative, got: ${maximumFee}`);
  }
}

/**
 * The fee withheld from a transfer of `amountRaw` base units.
 *
 * The recipient receives `amountRaw - calculateTransferFee(params, amountRaw)`.
 */
export function calculateTransferFee(params: TransferFeeParams, amountRaw: bigint): bigint {
  assertParams(params);

  if (amountRaw < 0n) {
    throw new Error(`Transfer amount cannot be negative, got: ${amountRaw}`);
  }

  if (params.basisPoints === 0 || amountRaw === 0n) {
    return 0n;
  }

  const numerator = amountRaw * BigInt(params.basisPoints);
  const rawFee = (numerator + ONE_IN_BASIS_POINTS - 1n) / ONE_IN_BASIS_POINTS;

  return rawFee > params.maximumFee ? params.maximumFee : rawFee;
}

/** What a recipient actually receives when `amountRaw` is sent. */
export function netAfterFee(params: TransferFeeParams, amountRaw: bigint): bigint {
  return amountRaw - calculateTransferFee(params, amountRaw);
}

export interface GrossUpResult {
  /** Amount to send. */
  readonly grossRaw: bigint;
  /** Fee that will be withheld from it. */
  readonly feeRaw: bigint;
}

/**
 * The smallest amount to send so the recipient nets exactly `netTargetRaw`.
 *
 * Needed because Token-2022 taxes every transfer, cashback payouts included: to
 * pay a holder their computed share, more than the share has to leave the
 * treasury.
 *
 * Why "smallest": ceiling rounding makes `netAfterFee` a step function, so
 * several gross amounts can produce the same net. At 1%, both 100 and 101 net
 * 99, and sending 101 would burn a base unit of treasury for nothing.
 *
 * Why a binary search rather than the closed form `ceil(net * 10000 / (10000 -
 * bps))`: that formula only holds while the fee cap is not binding, and needs
 * separate handling either side of the boundary. `netAfterFee` is non-decreasing
 * and rises in steps of 0 or 1 (the fee moves by at most 1 per unit while
 * `basisPoints <= 10000`), so a search for the first amount reaching the target
 * is minimal by construction, in both regimes, with no case analysis.
 */
export function grossUpForNet(params: TransferFeeParams, netTargetRaw: bigint): GrossUpResult {
  assertParams(params);

  if (netTargetRaw < 0n) {
    throw new Error(`Net target cannot be negative, got: ${netTargetRaw}`);
  }

  if (netTargetRaw === 0n || params.basisPoints === 0) {
    return { grossRaw: netTargetRaw, feeRaw: 0n };
  }

  // The fee never exceeds maximumFee, so net(target + maximumFee) >= target:
  // a valid upper bound for the search.
  let low = netTargetRaw;
  let high = netTargetRaw + params.maximumFee;

  while (low < high) {
    const mid = low + (high - low) / 2n;
    if (netAfterFee(params, mid) >= netTargetRaw) {
      high = mid;
    } else {
      low = mid + 1n;
    }
  }

  const grossRaw = low;
  const feeRaw = calculateTransferFee(params, grossRaw);

  // Defensive, and expected to be unreachable: the fee never exceeds
  // maximumFee, so net(target) <= target <= net(target + maximumFee), and net
  // rises in steps of 0 or 1. Some amount in that interval therefore lands on
  // the target exactly, at any rate up to 100%. Kept as a guard so a future
  // change to the fee rule surfaces here instead of as a wrong payout.
  if (grossRaw - feeRaw !== netTargetRaw) {
    throw new Error(
      `No transfer amount nets exactly ${netTargetRaw} at ${params.basisPoints} basis points with a cap of ${params.maximumFee}.`,
    );
  }

  return { grossRaw, feeRaw };
}
