import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { Keypair } from "@solana/web3.js";
import { generateKeypairFile, loadKeypair, serializeKeypair } from "../../src/lib/keypair.js";

let dir: string;

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), "keypair-test-"));
});

afterEach(() => {
  rmSync(dir, { recursive: true, force: true });
});

function write(name: string, contents: string): string {
  const path = join(dir, name);
  writeFileSync(path, contents, "utf8");
  return path;
}

describe("loadKeypair", () => {
  it("loads a valid keypair and derives the matching public key", () => {
    const original = Keypair.generate();
    const path = write("valid.json", serializeKeypair(original));

    const loaded = loadKeypair(path);

    expect(loaded.publicKey.toBase58()).toBe(original.publicKey.toBase58());
    expect(Array.from(loaded.secretKey)).toEqual(Array.from(original.secretKey));
  });

  it("round-trips through serializeKeypair", () => {
    const original = Keypair.generate();
    const path = write("round.json", serializeKeypair(original));

    expect(serializeKeypair(loadKeypair(path))).toBe(serializeKeypair(original));
  });

  it("points at the keygen command when the file is missing", () => {
    const path = join(dir, "absent.json");

    expect(() => loadKeypair(path)).toThrow(/No keypair at .*absent\.json\. Create one with: npm run keygen/);
  });

  it("rejects a file that is not JSON", () => {
    const path = write("garbage.json", "not json at all");

    expect(() => loadKeypair(path)).toThrow(/is not valid JSON/);
  });

  it("rejects JSON that is not an array", () => {
    const path = write("object.json", '{"secretKey":[1,2,3]}');

    expect(() => loadKeypair(path)).toThrow(/is not an array/);
  });

  it("rejects an array of the wrong length", () => {
    const path = write("short.json", JSON.stringify(new Array(32).fill(1)));

    expect(() => loadKeypair(path)).toThrow(/has 32 entries; expected exactly 64/);
  });

  it("rejects a byte outside 0 to 255", () => {
    const bytes = Array.from(Keypair.generate().secretKey);
    bytes[7] = 999;
    const path = write("out-of-range.json", JSON.stringify(bytes));

    expect(() => loadKeypair(path)).toThrow(/invalid byte at index 7: 999/);
  });

  it("rejects a non-integer byte", () => {
    const bytes = Array.from(Keypair.generate().secretKey);
    bytes[3] = 1.5;
    const path = write("float.json", JSON.stringify(bytes));

    expect(() => loadKeypair(path)).toThrow(/invalid byte at index 3: 1\.5/);
  });

  it("rejects a non-numeric entry", () => {
    const bytes: unknown[] = Array.from(Keypair.generate().secretKey);
    bytes[0] = "aa";
    const path = write("string-byte.json", JSON.stringify(bytes));

    expect(() => loadKeypair(path)).toThrow(/invalid byte at index 0: "aa"/);
  });

  it("rejects 64 valid bytes that are not a real Ed25519 key", () => {
    // Correct length and range, but the public half does not match the seed.
    const bytes = Array.from(Keypair.generate().secretKey);
    bytes[63] = bytes[63] === 0 ? 1 : 0;
    const path = write("mismatched.json", JSON.stringify(bytes));

    expect(() => loadKeypair(path)).toThrow(/not a valid Ed25519 secret key/);
  });
});

describe("generateKeypairFile", () => {
  it("writes a keypair that loadKeypair can read back", () => {
    const path = join(dir, "fresh.json");
    const { publicKey } = generateKeypairFile(path);

    expect(existsSync(path)).toBe(true);
    expect(loadKeypair(path).publicKey.toBase58()).toBe(publicKey);
  });

  it("creates missing parent directories", () => {
    const path = join(dir, "nested", "deeper", "authority.json");

    expect(() => generateKeypairFile(path)).not.toThrow();
    expect(existsSync(path)).toBe(true);
  });

  it("refuses to overwrite an existing keypair and leaves it untouched", () => {
    const path = join(dir, "existing.json");
    generateKeypairFile(path);
    const before = readFileSync(path, "utf8");

    expect(() => generateKeypairFile(path)).toThrow(/Refusing to overwrite it/);
    expect(readFileSync(path, "utf8")).toBe(before);
  });

  it("refuses to overwrite even a file that is not a keypair", () => {
    const path = write("occupied.json", "something important");

    expect(() => generateKeypairFile(path)).toThrow(/Refusing to overwrite it/);
    expect(readFileSync(path, "utf8")).toBe("something important");
  });

  it("produces a different key each time", () => {
    const a = generateKeypairFile(join(dir, "a.json"));
    const b = generateKeypairFile(join(dir, "b.json"));

    expect(a.publicKey).not.toBe(b.publicKey);
  });
});
