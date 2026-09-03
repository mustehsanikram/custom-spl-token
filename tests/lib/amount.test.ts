import { describe, expect, it } from "vitest";
import { baseUnitsToTokens, tokensToBaseUnits } from "../../src/lib/amount.js";

const DECIMALS = 9;

describe("tokensToBaseUnits", () => {
  it("converts the project's full supply at 9 decimals", () => {
    expect(tokensToBaseUnits("1000000", DECIMALS)).toBe(10n ** 15n);
  });

  it("converts zero and the smallest representable unit", () => {
    expect(tokensToBaseUnits("0", DECIMALS)).toBe(0n);
    expect(tokensToBaseUnits("0.000000001", DECIMALS)).toBe(1n);
  });

  it("pads a short fraction to the full precision", () => {
    expect(tokensToBaseUnits("1.5", DECIMALS)).toBe(1_500_000_000n);
  });

  it("handles zero decimals", () => {
    expect(tokensToBaseUnits("42", 0)).toBe(42n);
  });

  it("preserves integers beyond IEEE-754 safe range", () => {
    // 2^53 + 1 is the canonical value a float cannot represent, so this fails
    // loudly if the conversion path ever routes through Number.
    expect(tokensToBaseUnits("9007199254740993", 0)).toBe(9_007_199_254_740_993n);
  });

  it("rejects more fractional digits than the mint has, rather than truncating", () => {
    expect(() => tokensToBaseUnits("1.0000000001", DECIMALS)).toThrow(/Refusing to truncate/);
    expect(() => tokensToBaseUnits("1.5", 0)).toThrow(/Refusing to truncate/);
  });

  it.each([
    ["negative", "-1"],
    ["empty", ""],
    ["non-numeric", "abc"],
    ["trailing separator", "1."],
    ["leading separator", ".5"],
    ["whitespace padded", " 1 "],
    ["exponent notation", "1e9"],
    ["thousands separator", "1,000"],
  ])("rejects %s input", (_label, input) => {
    expect(() => tokensToBaseUnits(input, DECIMALS)).toThrow(/Invalid token amount/);
  });

  it("rejects an invalid decimals argument", () => {
    expect(() => tokensToBaseUnits("1", -1)).toThrow(/decimals must be an integer/);
    expect(() => tokensToBaseUnits("1", 1.5)).toThrow(/decimals must be an integer/);
    expect(() => tokensToBaseUnits("1", 19)).toThrow(/decimals must be an integer/);
  });
});

describe("baseUnitsToTokens", () => {
  it("formats whole amounts without a fractional part", () => {
    expect(baseUnitsToTokens(10n ** 15n, DECIMALS)).toBe("1000000");
    expect(baseUnitsToTokens(0n, DECIMALS)).toBe("0");
  });

  it("formats sub-unit amounts with leading zeros intact", () => {
    expect(baseUnitsToTokens(1n, DECIMALS)).toBe("0.000000001");
  });

  it("trims trailing fractional zeros", () => {
    expect(baseUnitsToTokens(1_500_000_000n, DECIMALS)).toBe("1.5");
  });

  it("rejects negative base units", () => {
    expect(() => baseUnitsToTokens(-1n, DECIMALS)).toThrow(/cannot be negative/);
  });
});

describe("round trip", () => {
  const canonical = [
    "0",
    "1",
    "1.5",
    "0.000000001",
    "1000000",
    "999999.999999999",
    "123456.000000001",
  ];

  it.each(canonical)("returns %s unchanged", (value) => {
    expect(baseUnitsToTokens(tokensToBaseUnits(value, DECIMALS), DECIMALS)).toBe(value);
  });

  it("normalizes a non-canonical string to its canonical form", () => {
    expect(baseUnitsToTokens(tokensToBaseUnits("1.500", DECIMALS), DECIMALS)).toBe("1.5");
  });
});
