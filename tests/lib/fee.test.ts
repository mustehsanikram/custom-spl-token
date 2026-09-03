import { describe, expect, it } from "vitest";
import { calculateFee } from "@solana/spl-token";
import { calculateTransferFee, netAfterFee, type TransferFeeParams } from "../../src/lib/fee.js";

/** High enough that the basis-point rate always governs, as the project intends. */
const NO_CAP = 10n ** 18n;

const onePercent: TransferFeeParams = { basisPoints: 100, maximumFee: NO_CAP };

describe("calculateTransferFee", () => {
  it("returns zero when the rate is zero", () => {
    expect(calculateTransferFee({ basisPoints: 0, maximumFee: NO_CAP }, 10_000n)).toBe(0n);
  });

  it("returns zero when the amount is zero", () => {
    expect(calculateTransferFee(onePercent, 0n)).toBe(0n);
  });

  it("divides exactly when the amount is a clean multiple", () => {
    expect(calculateTransferFee(onePercent, 10_000n)).toBe(100n);
    expect(calculateTransferFee(onePercent, 10n ** 15n)).toBe(10n ** 13n);
  });

  it("rounds the fee up, never down", () => {
    // 1 * 1% = 0.01, and the holder is charged a whole base unit.
    expect(calculateTransferFee(onePercent, 1n)).toBe(1n);
    expect(calculateTransferFee(onePercent, 99n)).toBe(1n);
    expect(calculateTransferFee(onePercent, 100n)).toBe(1n);
    expect(calculateTransferFee(onePercent, 101n)).toBe(2n);
  });

  it("caps the fee when the maximum binds", () => {
    const capped: TransferFeeParams = { basisPoints: 200, maximumFee: 5n };
    expect(calculateTransferFee(capped, 10_000n)).toBe(5n);
  });

  it("leaves the fee untouched when the maximum does not bind", () => {
    const capped: TransferFeeParams = { basisPoints: 200, maximumFee: 5_000n };
    expect(calculateTransferFee(capped, 10_000n)).toBe(200n);
  });

  it("rejects an out-of-range rate", () => {
    expect(() => calculateTransferFee({ basisPoints: -1, maximumFee: NO_CAP }, 1n)).toThrow(
      /basisPoints must be an integer/,
    );
    expect(() => calculateTransferFee({ basisPoints: 10_001, maximumFee: NO_CAP }, 1n)).toThrow(
      /basisPoints must be an integer/,
    );
    expect(() => calculateTransferFee({ basisPoints: 1.5, maximumFee: NO_CAP }, 1n)).toThrow(
      /basisPoints must be an integer/,
    );
  });

  it("rejects negative inputs", () => {
    expect(() => calculateTransferFee({ basisPoints: 100, maximumFee: -1n }, 1n)).toThrow(
      /maximumFee cannot be negative/,
    );
    expect(() => calculateTransferFee(onePercent, -1n)).toThrow(
      /Transfer amount cannot be negative/,
    );
  });
});

describe("netAfterFee", () => {
  it("is the amount minus the fee", () => {
    expect(netAfterFee(onePercent, 10_000n)).toBe(9_900n);
    expect(netAfterFee(onePercent, 101n)).toBe(99n);
  });
});

describe("parity with @solana/spl-token calculateFee", () => {
  const rates = [0, 1, 50, 100, 137, 200, 1_000, 10_000];
  const amounts = [0n, 1n, 7n, 99n, 100n, 101n, 9_999n, 10_000n, 10_001n, 10n ** 9n, 10n ** 15n];
  const caps = [NO_CAP, 5n, 1_000n];

  const cases = rates.flatMap((basisPoints) =>
    caps.flatMap((maximumFee) =>
      amounts.map((amountRaw) => ({ basisPoints, maximumFee, amountRaw })),
    ),
  );

  it(`matches the library across ${cases.length} combinations`, () => {
    for (const { basisPoints, maximumFee, amountRaw } of cases) {
      const ours = calculateTransferFee({ basisPoints, maximumFee }, amountRaw);
      const theirs = calculateFee(
        { epoch: 0n, maximumFee, transferFeeBasisPoints: basisPoints },
        amountRaw,
      );

      expect(
        ours,
        `bps=${basisPoints} cap=${maximumFee} amount=${amountRaw}`,
      ).toBe(theirs);
    }
  });
});
