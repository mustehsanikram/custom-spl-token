import { describe, expect, it } from "vitest";
import { Keypair, LAMPORTS_PER_SOL, type Connection } from "@solana/web3.js";
import {
  FEE_RESERVE_LAMPORTS,
  assertSufficientBalance,
  ensureFunded,
  lamportsToSol,
  solToLamports,
} from "../../src/lib/funding.js";

const ONE_SOL = BigInt(LAMPORTS_PER_SOL);

/**
 * Stand-in for the RPC. `balances` is consumed one call at a time so a test can
 * describe how the balance evolves across airdrop attempts.
 */
function stubConnection(options: {
  balances: bigint[];
  onAirdrop?: () => string;
}): { connection: Connection; airdropCalls: number } {
  const state = { airdropCalls: 0 };
  let index = 0;

  const connection = {
    async getBalance(): Promise<number> {
      const value = options.balances[Math.min(index, options.balances.length - 1)] ?? 0n;
      index += 1;
      return Number(value);
    },
    async requestAirdrop(): Promise<string> {
      state.airdropCalls += 1;
      if (!options.onAirdrop) throw new Error("airdrop unavailable");
      return options.onAirdrop();
    },
    async getLatestBlockhash(): Promise<{ blockhash: string; lastValidBlockHeight: number }> {
      return { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 };
    },
    async confirmTransaction(): Promise<unknown> {
      return { value: { err: null } };
    },
  } as unknown as Connection;

  return {
    connection,
    get airdropCalls() {
      return state.airdropCalls;
    },
  };
}

describe("SOL conversion", () => {
  it("converts whole and fractional SOL to lamports", () => {
    expect(solToLamports("1")).toBe(ONE_SOL);
    expect(solToLamports("0.000000001")).toBe(1n);
    expect(solToLamports("2.5")).toBe(2_500_000_000n);
  });

  it("round-trips", () => {
    expect(lamportsToSol(solToLamports("0.01"))).toBe("0.01");
    expect(lamportsToSol(ONE_SOL)).toBe("1");
  });

  it("inherits the strictness of the amount helpers", () => {
    expect(() => solToLamports("-1")).toThrow(/Invalid token amount/);
    expect(() => solToLamports("1.0000000001")).toThrow(/Refusing to truncate/);
  });
});

describe("assertSufficientBalance", () => {
  it("passes when the balance covers the spend plus the fee reserve", () => {
    expect(() => assertSufficientBalance(ONE_SOL, ONE_SOL - FEE_RESERVE_LAMPORTS)).not.toThrow();
  });

  it("throws when the balance covers the spend but not the fee reserve", () => {
    // Exactly enough to send, nothing left to pay for sending it.
    expect(() => assertSufficientBalance(ONE_SOL, ONE_SOL)).toThrow(/Insufficient SOL/);
  });

  it("reports both the holding and the requirement in SOL", () => {
    expect(() => assertSufficientBalance(0n, ONE_SOL)).toThrow(
      /holding 0 but need 1\.00005 \(1 to send plus 0\.00005 reserved for fees\)/,
    );
  });

  it("honours an explicit reserve", () => {
    expect(() => assertSufficientBalance(100n, 100n, 0n)).not.toThrow();
    expect(() => assertSufficientBalance(100n, 100n, 1n)).toThrow(/Insufficient SOL/);
  });
});

describe("ensureFunded", () => {
  const target = Keypair.generate().publicKey;

  it("does nothing when the account is already funded", async () => {
    const stub = stubConnection({ balances: [ONE_SOL] });

    const result = await ensureFunded(stub.connection, target, ONE_SOL);

    expect(result.signature).toBeNull();
    expect(result.balanceLamports).toBe(ONE_SOL);
    expect(stub.airdropCalls).toBe(0);
  });

  it("airdrops when short, then reports the new balance and signature", async () => {
    const stub = stubConnection({
      balances: [0n, ONE_SOL],
      onAirdrop: () => "sig-1",
    });

    const result = await ensureFunded(stub.connection, target, ONE_SOL, { delayMs: 0 });

    expect(result.signature).toBe("sig-1");
    expect(result.balanceLamports).toBe(ONE_SOL);
    expect(stub.airdropCalls).toBe(1);
  });

  it("retries a failing airdrop up to the attempt limit", async () => {
    const stub = stubConnection({ balances: [0n] });

    await expect(
      ensureFunded(stub.connection, target, ONE_SOL, { attempts: 3, delayMs: 0 }),
    ).rejects.toThrow(/after 3 airdrop attempts/);

    expect(stub.airdropCalls).toBe(3);
  });

  it("points at the public faucet when airdrops keep failing", async () => {
    const stub = stubConnection({ balances: [0n] });

    await expect(
      ensureFunded(stub.connection, target, ONE_SOL, { attempts: 1, delayMs: 0 }),
    ).rejects.toThrow(/rate limited; fund it manually at https:\/\/faucet\.solana\.com/);
  });

  it("surfaces the underlying error rather than hiding it", async () => {
    const stub = stubConnection({ balances: [0n] });

    await expect(
      ensureFunded(stub.connection, target, ONE_SOL, { attempts: 1, delayMs: 0 }),
    ).rejects.toThrow(/Last error: airdrop unavailable/);
  });

  it("succeeds if a later balance read clears the minimum", async () => {
    // Airdrop throws, but the funds land anyway: a real devnet failure mode.
    const stub = stubConnection({ balances: [0n, ONE_SOL] });

    const result = await ensureFunded(stub.connection, target, ONE_SOL, {
      attempts: 2,
      delayMs: 0,
    });

    expect(result.balanceLamports).toBe(ONE_SOL);
  });
});
