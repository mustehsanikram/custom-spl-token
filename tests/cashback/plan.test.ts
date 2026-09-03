import { describe, expect, it } from "vitest";
import { buildDistributionPlan } from "../../src/cashback/plan.js";
import { calculateTransferFee, type TransferFeeParams } from "../../src/lib/fee.js";
import type { DistributionPlan, HolderBalance } from "../../src/cashback/types.js";

const TREASURY = "TREASURY_OWNER";
const NO_CAP = 10n ** 18n;
const onePercent: TransferFeeParams = { basisPoints: 100, maximumFee: NO_CAP };
const exclusions = { excludedOwners: [TREASURY] };

function holders(...balances: bigint[]): HolderBalance[] {
  return balances.map((balanceRaw, i) => ({
    owner: `owner_${i}`,
    tokenAccount: `ata_${i}`,
    balanceRaw,
  }));
}

/** Invariants that must hold for any plan, executable or not. */
function expectPlanConsistent(plan: DistributionPlan, params: TransferFeeParams): void {
  const allocated = plan.rows.reduce((sum, r) => sum + r.netShareRaw, 0n);
  expect(allocated + plan.dustRaw).toBe(plan.distributableRaw);

  const gross = plan.rows.reduce((sum, r) => sum + r.grossSendRaw, 0n);
  expect(gross).toBe(plan.totalGrossRaw);

  for (const row of plan.rows) {
    expect(row.grossSendRaw - row.feeRaw).toBe(row.netShareRaw);
    expect(row.grossSendRaw >= row.netShareRaw).toBe(true);
    expect(row.netShareRaw > 0n).toBe(true);
    expect(calculateTransferFee(params, row.grossSendRaw)).toBe(row.feeRaw);
  }
}

describe("buildDistributionPlan", () => {
  it("grosses up every payout so holders net their share", () => {
    const plan = buildDistributionPlan({
      holders: [...holders(400n, 600n), { owner: TREASURY, tokenAccount: "t", balanceRaw: 9_000n }],
      exclusions,
      distributableRaw: 10_000n,
      treasuryBalanceRaw: 1_000_000n,
      feeParams: onePercent,
    });

    expect(plan.executable).toBe(true);
    expect(plan.rows.map((r) => r.netShareRaw)).toEqual([4_000n, 6_000n]);
    // Grossed up so 1% leaves the holder whole.
    expect(plan.rows.map((r) => r.grossSendRaw)).toEqual([4_041n, 6_061n]);
    expect(plan.totalGrossRaw).toBe(10_102n);
    expectPlanConsistent(plan, onePercent);
  });

  it("excludes the treasury from the denominator", () => {
    const plan = buildDistributionPlan({
      holders: [...holders(500n, 500n), { owner: TREASURY, tokenAccount: "t", balanceRaw: 9_000n }],
      exclusions,
      distributableRaw: 1_000n,
      treasuryBalanceRaw: 1_000_000n,
      feeParams: onePercent,
    });

    // Halves, not 5% each, which is what including the treasury would give.
    expect(plan.rows.map((r) => r.netShareRaw)).toEqual([500n, 500n]);
  });

  it("reports a shortfall without dropping rows or throwing", () => {
    const plan = buildDistributionPlan({
      holders: holders(400n, 600n),
      exclusions,
      distributableRaw: 10_000n,
      treasuryBalanceRaw: 10_050n,
      feeParams: onePercent,
    });

    expect(plan.executable).toBe(false);
    expect(plan.reason).toMatch(/Treasury holds 10050 but the round needs 10102/);
    expect(plan.rows).toHaveLength(2);
    expectPlanConsistent(plan, onePercent);
  });

  it("is executable when the treasury covers the gross exactly", () => {
    const plan = buildDistributionPlan({
      holders: holders(400n, 600n),
      exclusions,
      distributableRaw: 10_000n,
      treasuryBalanceRaw: 10_102n,
      feeParams: onePercent,
    });

    expect(plan.executable).toBe(true);
    expect(plan.totalGrossRaw).toBe(10_102n);
  });

  it("can never distribute the entire treasury balance", () => {
    // The gross always exceeds the net, so distributable === balance cannot work.
    const plan = buildDistributionPlan({
      holders: holders(400n, 600n),
      exclusions,
      distributableRaw: 10_000n,
      treasuryBalanceRaw: 10_000n,
      feeParams: onePercent,
    });

    expect(plan.executable).toBe(false);
  });

  it("drops zero-share rows rather than sending nothing to someone", () => {
    const plan = buildDistributionPlan({
      holders: holders(1n, 1_000_000_000n),
      exclusions,
      distributableRaw: 100n,
      treasuryBalanceRaw: 1_000_000n,
      feeParams: onePercent,
    });

    expect(plan.rows).toHaveLength(1);
    expect(plan.rows[0]?.owner).toBe("owner_1");
    expect(plan.dustRaw).toBe(1n);
    expectPlanConsistent(plan, onePercent);
  });

  it("dust can reach the eligible-entry count, not the surviving row count", () => {
    // Four equal holders sharing three units: every share floors to zero, so no
    // rows survive and the dust exceeds rows.length.
    const plan = buildDistributionPlan({
      holders: holders(1n, 1n, 1n, 1n),
      exclusions,
      distributableRaw: 3n,
      treasuryBalanceRaw: 1_000n,
      feeParams: onePercent,
    });

    expect(plan.rows).toHaveLength(0);
    expect(plan.dustRaw).toBe(3n);
    expect(plan.executable).toBe(true);
    expectPlanConsistent(plan, onePercent);
  });

  it("retains everything as dust when nobody is eligible", () => {
    const plan = buildDistributionPlan({
      holders: [{ owner: TREASURY, tokenAccount: "t", balanceRaw: 9_000n }],
      exclusions,
      distributableRaw: 500n,
      treasuryBalanceRaw: 1_000n,
      feeParams: onePercent,
    });

    expect(plan.rows).toEqual([]);
    expect(plan.dustRaw).toBe(500n);
    expect(plan.totalGrossRaw).toBe(0n);
    expect(plan.executable).toBe(true);
  });

  it("holds at the project's real scale", () => {
    const plan = buildDistributionPlan({
      holders: holders(400_000n * 10n ** 9n, 350_000n * 10n ** 9n, 250_000n * 10n ** 9n),
      exclusions,
      distributableRaw: 12_345_678_901n,
      treasuryBalanceRaw: 10n ** 15n,
      feeParams: onePercent,
    });

    expect(plan.executable).toBe(true);
    expectPlanConsistent(plan, onePercent);
  });

  it("rejects a negative treasury balance", () => {
    expect(() =>
      buildDistributionPlan({
        holders: holders(1n),
        exclusions,
        distributableRaw: 1n,
        treasuryBalanceRaw: -1n,
        feeParams: onePercent,
      }),
    ).toThrow(/treasuryBalanceRaw cannot be negative/);
  });
});
