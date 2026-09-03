import { describe, expect, it } from "vitest";
import { computeShares } from "../../src/cashback/prorata.js";
import type { HolderBalance } from "../../src/cashback/types.js";

function holders(...balances: bigint[]): HolderBalance[] {
  return balances.map((balanceRaw, i) => ({
    owner: `owner_${i}`,
    tokenAccount: `ata_${i}`,
    balanceRaw,
  }));
}

function total(entries: readonly HolderBalance[]): bigint {
  return entries.reduce((sum, e) => sum + e.balanceRaw, 0n);
}

/** The invariants every round must satisfy, whatever the inputs. */
function expectConserved(
  entries: readonly HolderBalance[],
  distributableRaw: bigint,
  label: string,
): void {
  const { rows, dustRaw } = computeShares(entries, total(entries), distributableRaw);
  const allocated = rows.reduce((sum, r) => sum + r.netShareRaw, 0n);

  expect(allocated + dustRaw, `conserved: ${label}`).toBe(distributableRaw);
  expect(dustRaw >= 0n, `dust non-negative: ${label}`).toBe(true);

  if (entries.length > 0 && total(entries) > 0n) {
    expect(dustRaw < BigInt(entries.length), `dust bounded: ${label}`).toBe(true);
  }

  for (const row of rows) {
    expect(row.netShareRaw >= 0n, `share non-negative: ${label}`).toBe(true);
  }
}

describe("computeShares", () => {
  it("splits evenly between equal holders", () => {
    const entries = holders(500n, 500n);
    const { rows, dustRaw } = computeShares(entries, 1_000n, 100n);

    expect(rows.map((r) => r.netShareRaw)).toEqual([50n, 50n]);
    expect(dustRaw).toBe(0n);
  });

  it("splits in proportion to uneven balances", () => {
    const entries = holders(400n, 600n);
    const { rows, dustRaw } = computeShares(entries, 1_000n, 1_000n);

    expect(rows.map((r) => r.netShareRaw)).toEqual([400n, 600n]);
    expect(dustRaw).toBe(0n);
  });

  it("floors each share and keeps the remainder as dust", () => {
    // 10 split three ways is 3.33 each; each holder is floored to 3, leaving 1.
    const entries = holders(1n, 1n, 1n);
    const { rows, dustRaw } = computeShares(entries, 3n, 10n);

    expect(rows.map((r) => r.netShareRaw)).toEqual([3n, 3n, 3n]);
    expect(dustRaw).toBe(1n);
  });

  it("gives a single holder everything", () => {
    const entries = holders(777n);
    const { rows, dustRaw } = computeShares(entries, 777n, 12_345n);

    expect(rows[0]?.netShareRaw).toBe(12_345n);
    expect(dustRaw).toBe(0n);
  });

  it("allocates nothing when there is nothing to distribute", () => {
    const entries = holders(400n, 600n);
    const { rows, dustRaw } = computeShares(entries, 1_000n, 0n);

    expect(rows.map((r) => r.netShareRaw)).toEqual([0n, 0n]);
    expect(dustRaw).toBe(0n);
  });

  it("retains the whole amount when there are no eligible holders", () => {
    const { rows, dustRaw } = computeShares([], 0n, 500n);

    expect(rows).toEqual([]);
    expect(dustRaw).toBe(500n);
  });

  it("gives a dust-sized holder a zero share rather than rounding up", () => {
    // One unit against a 10^9 pool rounds down to nothing.
    const entries = holders(1n, 1_000_000_000n);
    const { rows, dustRaw } = computeShares(entries, 1_000_000_001n, 100n);

    expect(rows[0]?.netShareRaw).toBe(0n);
    expect(rows[1]?.netShareRaw).toBe(99n);
    expect(dustRaw).toBe(1n);
  });

  it("handles the project's real scale", () => {
    const entries = holders(400_000n * 10n ** 9n, 350_000n * 10n ** 9n, 250_000n * 10n ** 9n);
    expectConserved(entries, 12_345_678_901n, "1M supply at 9 decimals");
  });

  it("rejects a total that disagrees with the entries", () => {
    expect(() => computeShares(holders(400n, 600n), 999n, 100n)).toThrow(
      /does not match the sum of entries/,
    );
  });

  it("rejects negative inputs", () => {
    expect(() => computeShares(holders(100n), 100n, -1n)).toThrow(
      /distributableRaw cannot be negative/,
    );
    expect(() => computeShares([], -1n, 0n)).toThrow(/totalEligibleRaw cannot be negative/);
  });
});

describe("computeShares invariants", () => {
  it("conserves the total across many shapes", () => {
    // Deterministic pseudo-random so a failure is reproducible.
    let seed = 42n;
    const next = (bound: bigint): bigint => {
      seed = (seed * 6_364_136_223_846_793_005n + 1_442_695_040_888_963_407n) % (2n ** 64n);
      return (seed % bound) + 1n;
    };

    for (let caseIndex = 0; caseIndex < 300; caseIndex++) {
      const count = Number(next(8n));
      const entries = holders(...Array.from({ length: count }, () => next(10n ** 12n)));
      expectConserved(entries, next(10n ** 12n), `case ${caseIndex}`);
    }
  });

  it("keeps dust strictly below the holder count even at maximum fragmentation", () => {
    // n holders with equal balances and n-1 units to share: every share floors
    // to zero, so the dust reaches its bound of n-1.
    const entries = holders(1n, 1n, 1n, 1n);
    const { rows, dustRaw } = computeShares(entries, 4n, 3n);

    expect(rows.map((r) => r.netShareRaw)).toEqual([0n, 0n, 0n, 0n]);
    expect(dustRaw).toBe(3n);
    expect(dustRaw < BigInt(entries.length)).toBe(true);
  });
});
