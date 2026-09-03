import { describe, expect, it } from "vitest";
import { selectEligible } from "../../src/cashback/eligibility.js";
import type { HolderBalance } from "../../src/cashback/types.js";

const TREASURY = "TREASURY_OWNER";
const AUTHORITY = "AUTHORITY_OWNER";

function holder(owner: string, balanceRaw: bigint, tokenAccount = `${owner}_ATA`): HolderBalance {
  return { owner, tokenAccount, balanceRaw };
}

const exclusions = { excludedOwners: [TREASURY, AUTHORITY] };

describe("selectEligible", () => {
  it("keeps ordinary holders and totals only those", () => {
    const result = selectEligible(
      [holder("alice", 400n), holder("bob", 600n)],
      { excludedOwners: [] },
    );

    expect(result.entries.map((e) => e.owner)).toEqual(["alice", "bob"]);
    expect(result.totalEligibleRaw).toBe(1_000n);
    expect(result.excludedCount).toBe(0);
  });

  it("removes excluded owners and recomputes the total without them", () => {
    const result = selectEligible(
      [
        holder("alice", 400n),
        holder(TREASURY, 5_000n),
        holder("bob", 600n),
        holder(AUTHORITY, 1_000n),
      ],
      exclusions,
    );

    expect(result.entries.map((e) => e.owner)).toEqual(["alice", "bob"]);
    // The treasury's 5000 and the authority's 1000 must not inflate the denominator.
    expect(result.totalEligibleRaw).toBe(1_000n);
    expect(result.excludedCount).toBe(2);
  });

  it("removes zero-balance accounts", () => {
    const result = selectEligible(
      [holder("alice", 400n), holder("empty", 0n), holder("bob", 600n)],
      exclusions,
    );

    expect(result.entries.map((e) => e.owner)).toEqual(["alice", "bob"]);
    expect(result.totalEligibleRaw).toBe(1_000n);
    expect(result.excludedCount).toBe(1);
  });

  it("returns an empty set rather than throwing when everything is excluded", () => {
    const result = selectEligible([holder(TREASURY, 5_000n), holder("empty", 0n)], exclusions);

    expect(result.entries).toEqual([]);
    expect(result.totalEligibleRaw).toBe(0n);
    expect(result.excludedCount).toBe(2);
  });

  it("handles an empty snapshot", () => {
    const result = selectEligible([], exclusions);

    expect(result.entries).toEqual([]);
    expect(result.totalEligibleRaw).toBe(0n);
    expect(result.excludedCount).toBe(0);
  });

  it("excludes every account an excluded owner holds", () => {
    const result = selectEligible(
      [
        holder(TREASURY, 100n, "TREASURY_ATA_1"),
        holder(TREASURY, 200n, "TREASURY_ATA_2"),
        holder("alice", 400n),
      ],
      exclusions,
    );

    expect(result.entries.map((e) => e.tokenAccount)).toEqual(["alice_ATA"]);
    expect(result.totalEligibleRaw).toBe(400n);
  });

  it("keeps each account separately when one owner holds several", () => {
    const result = selectEligible(
      [holder("alice", 400n, "alice_ATA_1"), holder("alice", 600n, "alice_ATA_2")],
      exclusions,
    );

    expect(result.entries).toHaveLength(2);
    expect(result.totalEligibleRaw).toBe(1_000n);
  });

  it("rejects a corrupt snapshot with a negative balance", () => {
    expect(() => selectEligible([holder("alice", -1n)], exclusions)).toThrow(
      /negative balance.*snapshot is corrupt/,
    );
  });
});
