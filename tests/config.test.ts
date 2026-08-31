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
});
