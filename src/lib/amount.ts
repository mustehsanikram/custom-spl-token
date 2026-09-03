/**
 * Conversion between human-readable token amounts and on-chain base units.
 *
 * Everything on-chain is an integer number of base units held in a u64. A token
 * amount only becomes readable by dividing by 10^decimals, and doing that in
 * floating point silently corrupts values above 2^53. So amounts enter and
 * leave this module as decimal *strings*, and are bigint everywhere else.
 */

const MAX_SUPPORTED_DECIMALS = 18;
const DECIMAL_STRING = /^\d+(?:\.\d+)?$/;

function assertDecimals(decimals: number): void {
  if (!Number.isInteger(decimals) || decimals < 0 || decimals > MAX_SUPPORTED_DECIMALS) {
    throw new Error(
      `decimals must be an integer between 0 and ${MAX_SUPPORTED_DECIMALS}, got: ${decimals}`,
    );
  }
}

/**
 * Parse a non-negative decimal string into base units.
 *
 * Rejects more fractional digits than the mint can represent rather than
 * truncating: silently dropping precision is how a payout ends up short.
 */
export function tokensToBaseUnits(tokens: string, decimals: number): bigint {
  assertDecimals(decimals);

  if (!DECIMAL_STRING.test(tokens)) {
    throw new Error(
      `Invalid token amount: ${JSON.stringify(tokens)}. Expected a non-negative decimal string such as "1000000" or "1.5".`,
    );
  }

  const [whole = "", fraction = ""] = tokens.split(".");

  if (fraction.length > decimals) {
    throw new Error(
      `Amount "${tokens}" has ${fraction.length} fractional digits but the mint has only ${decimals}. Refusing to truncate.`,
    );
  }

  return BigInt(whole + fraction.padEnd(decimals, "0"));
}

/**
 * Format base units as a canonical decimal string: no trailing fractional
 * zeros, and no trailing separator. Round-tripping a canonical string through
 * `tokensToBaseUnits` and back returns it unchanged.
 */
export function baseUnitsToTokens(raw: bigint, decimals: number): string {
  assertDecimals(decimals);

  if (raw < 0n) {
    throw new Error(`Base units cannot be negative, got: ${raw}`);
  }

  const divisor = 10n ** BigInt(decimals);
  const whole = raw / divisor;
  const fraction = raw % divisor;

  if (fraction === 0n) {
    return whole.toString();
  }

  const padded = fraction.toString().padStart(decimals, "0").replace(/0+$/, "");
  return `${whole}.${padded}`;
}
