import { describe, expect, it } from "vitest";
import type { Connection } from "@solana/web3.js";
import { assertReachable, createConnection } from "../../src/lib/connection.js";
import type { AppConfig } from "../../src/config.js";

const config: AppConfig = {
  network: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  authorityKeypairPath: "./keypairs/authority.json",
  decimals: 9,
  totalSupply: 1_000_000,
  transferFeeBasisPoints: 100,
  transferFeeMaxTokens: 1_000_000,
};

/** Minimal stand-in: assertReachable only touches getVersion and rpcEndpoint. */
function stubConnection(
  rpcEndpoint: string,
  getVersion: () => Promise<Record<string, unknown>>,
): Connection {
  return { rpcEndpoint, getVersion } as unknown as Connection;
}

describe("createConnection", () => {
  it("points at the RPC URL the config resolved", () => {
    expect(createConnection(config).rpcEndpoint).toBe("https://api.devnet.solana.com");
  });

  it("honours an explicit commitment", () => {
    expect(createConnection(config, "finalized").commitment).toBe("finalized");
  });

  it("defaults to confirmed", () => {
    expect(createConnection(config).commitment).toBe("confirmed");
  });
});

describe("assertReachable", () => {
  it("returns the reported solana-core version", async () => {
    const connection = stubConnection("https://rpc.example", async () => ({
      "solana-core": "1.18.26",
    }));

    await expect(assertReachable(connection)).resolves.toBe("1.18.26");
  });

  it("names the endpoint when the RPC cannot be reached", async () => {
    const connection = stubConnection("https://unreachable.example", async () => {
      throw new Error("fetch failed");
    });

    await expect(assertReachable(connection)).rejects.toThrow(
      /Cannot reach the Solana RPC at https:\/\/unreachable\.example: fetch failed/,
    );
  });

  it("rejects an endpoint that answers without a version", async () => {
    const connection = stubConnection("https://not-solana.example", async () => ({}));

    await expect(assertReachable(connection)).rejects.toThrow(/may not be a Solana RPC/);
  });
});
