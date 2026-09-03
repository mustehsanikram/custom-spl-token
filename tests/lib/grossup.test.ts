import { describe, expect, it } from "vitest";
import {
  calculateTransferFee,
  grossUpForNet,
  netAfterFee,
  type TransferFeeParams,
} from "../../src/lib/fee.js";

const NO_CAP = 10n ** 18n;

/** The property every payout depends on: land on the target, and do it cheaply. */
function expectMinimalExactGrossUp(params: TransferFeeParams, target: bigint): void {
  const { grossRaw, feeRaw } = grossUpForNet(params, target);
  const label = `bps=${params.basisPoints} cap=${params.maximumFee} target=${target}`;

  expect(grossRaw - calculateTransferFee(params, grossRaw), `exact: ${label}`).toBe(target);
  expect(grossRaw - feeRaw, `fee consistent: ${label}`).toBe(target);
  expect(grossRaw >= target, `never below target: ${label}`).toBe(true);

  if (grossRaw > 0n) {
    expect(netAfterFee(params, grossRaw - 1n) < target, `minimal: ${label}`).toBe(true);
  }
}

describe("grossUpForNet", () => {
  it("returns the target untouched when there is no fee", () => {
    expect(grossUpForNet({ basisPoints: 0, maximumFee: NO_CAP }, 500n)).toEqual({
      grossRaw: 500n,
      feeRaw: 0n,
    });
  });

  it("returns zero for a zero target", () => {
    expect(grossUpForNet({ basisPoints: 100, maximumFee: NO_CAP }, 0n)).toEqual({
      grossRaw: 0n,
      feeRaw: 0n,
    });
  });

  it("picks the smaller of two amounts that reach the same net", () => {
    // At 1%, sending 100 and sending 101 both leave the holder with 99.
    const params: TransferFeeParams = { basisPoints: 100, maximumFee: NO_CAP };
    expect(netAfterFee(params, 100n)).toBe(99n);
    expect(netAfterFee(params, 101n)).toBe(99n);

    expect(grossUpForNet(params, 99n).grossRaw).toBe(100n);
  });

  it("rejects a negative target", () => {
    expect(() => grossUpForNet({ basisPoints: 100, maximumFee: NO_CAP }, -1n)).toThrow(
      /Net target cannot be negative/,
    );
  });

  it("still reaches the target at a 100% rate, because the cap bounds the fee", () => {
    // Every transfer below the cap nets zero here, so the target is only
    // reachable once the fee saturates. It always is: the search's upper bound
    // is target + maximumFee, where the fee can no longer grow.
    const params: TransferFeeParams = { basisPoints: 10_000, maximumFee: NO_CAP };

    expect(netAfterFee(params, 5n)).toBe(0n);
    expect(netAfterFee(params, NO_CAP)).toBe(0n);

    const { grossRaw, feeRaw } = grossUpForNet(params, 5n);
    expect(grossRaw).toBe(NO_CAP + 5n);
    expect(feeRaw).toBe(NO_CAP);
    expect(grossRaw - feeRaw).toBe(5n);
  });
});

describe("grossUpForNet round trip", () => {
  const rates = [1, 25, 100, 137, 200];
  const targets = [1n, 2n, 99n, 100n, 101n, 12_345n, 10n ** 9n, 10n ** 12n, 10n ** 15n];

  it.each(rates)("is exact and minimal at %i basis points", (basisPoints) => {
    for (const target of targets) {
      expectMinimalExactGrossUp({ basisPoints, maximumFee: NO_CAP }, target);
    }
  });

  it("is exact and minimal across a contiguous range", () => {
    const params: TransferFeeParams = { basisPoints: 100, maximumFee: NO_CAP };
    for (let target = 0n; target <= 2_000n; target++) {
      expectMinimalExactGrossUp(params, target);
    }
  });

  it("holds in the cap-binding regime", () => {
    const params: TransferFeeParams = { basisPoints: 200, maximumFee: 5n };
    for (const target of [1n, 10n, 250n, 10_000n, 10n ** 9n]) {
      expectMinimalExactGrossUp(params, target);
    }
    // Once the cap binds, the gross is simply the target plus the flat cap.
    expect(grossUpForNet(params, 10n ** 9n).grossRaw).toBe(10n ** 9n + 5n);
  });

  it("holds right at the cap boundary", () => {
    // cap=2 binds from the moment ceil(gross * 2%) exceeds 2, near gross=100.
    const params: TransferFeeParams = { basisPoints: 200, maximumFee: 2n };
    for (let target = 90n; target <= 120n; target++) {
      expectMinimalExactGrossUp(params, target);
    }
  });
});
