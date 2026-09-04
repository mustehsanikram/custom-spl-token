import { describe, expect, it, beforeEach, afterEach } from "vitest";
import { loadConfig } from "../src/config.js";

const BASE_ENV = { ...process.env };

beforeEach(() => {
  process.env.AUTHORITY_KEYPAIR_PATH = "./keypairs/authority.json";
});

afterEach(() => {
  process.env = { ...BASE_ENV };
});

describe("loadConfig", () => {
  it("rejects a transfer fee above the 2% ceiling", () => {
    process.env.TRANSFER_FEE_BASIS_POINTS = "250";
    expect(() => loadConfig()).toThrow(/must be 0-200/);
  });

  it("defaults to a 1% fee and a 1,000,000 supply", () => {
    delete process.env.TRANSFER_FEE_BASIS_POINTS;
    delete process.env.TOKEN_TOTAL_SUPPLY;
    const config = loadConfig();
    expect(config.transferFeeBasisPoints).toBe(100);
    expect(config.totalSupply).toBe(1_000_000);
  });

  it("rejects decimals outside the range Solana tooling supports", () => {
    process.env.TOKEN_DECIMALS = "10";
    expect(() => loadConfig()).toThrow(/TOKEN_DECIMALS must be 0-9, got: 10/);

    process.env.TOKEN_DECIMALS = "-1";
    expect(() => loadConfig()).toThrow(/TOKEN_DECIMALS must be 0-9/);
  });

  it("accepts the range boundaries and defaults to 9", () => {
    process.env.TOKEN_DECIMALS = "0";
    expect(loadConfig().decimals).toBe(0);

    process.env.TOKEN_DECIMALS = "9";
    expect(loadConfig().decimals).toBe(9);

    delete process.env.TOKEN_DECIMALS;
    expect(loadConfig().decimals).toBe(9);
  });
});
