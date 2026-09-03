import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { Keypair } from "@solana/web3.js";

/** Ed25519 secret key: 32 seed bytes followed by the 32-byte public key. */
const SECRET_KEY_LENGTH = 64;

/**
 * Load a keypair from the Solana CLI's on-disk format: a JSON array of 64
 * integers in the range 0 to 255. Accepting exactly that means a key produced
 * by the CLI elsewhere works here unchanged.
 *
 * Every rejection names what is wrong, because a malformed key surfaces
 * otherwise as an unrelated signature failure much later.
 */
export function loadKeypair(path: string): Keypair {
  let raw: string;

  try {
    raw = readFileSync(path, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") {
      throw new Error(
        `No keypair at ${path}. Create one with: npm run keygen`,
      );
    }
    throw new Error(`Cannot read the keypair at ${path}: ${(error as Error).message}`);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error(
      `The keypair at ${path} is not valid JSON. Expected an array of ${SECRET_KEY_LENGTH} numbers.`,
    );
  }

  if (!Array.isArray(parsed)) {
    throw new Error(
      `The keypair at ${path} is not an array. Expected an array of ${SECRET_KEY_LENGTH} numbers.`,
    );
  }

  if (parsed.length !== SECRET_KEY_LENGTH) {
    throw new Error(
      `The keypair at ${path} has ${parsed.length} entries; expected exactly ${SECRET_KEY_LENGTH}.`,
    );
  }

  for (const [index, value] of parsed.entries()) {
    if (typeof value !== "number" || !Number.isInteger(value) || value < 0 || value > 255) {
      throw new Error(
        `The keypair at ${path} has an invalid byte at index ${index}: ${JSON.stringify(value)}. Expected an integer between 0 and 255.`,
      );
    }
  }

  try {
    return Keypair.fromSecretKey(Uint8Array.from(parsed as number[]));
  } catch (error) {
    throw new Error(
      `The keypair at ${path} is well formed but not a valid Ed25519 secret key: ${(error as Error).message}`,
    );
  }
}

/** Serialize a keypair into the same JSON array format `loadKeypair` reads. */
export function serializeKeypair(keypair: Keypair): string {
  return JSON.stringify(Array.from(keypair.secretKey));
}

export interface GeneratedKeypair {
  readonly publicKey: string;
  readonly path: string;
}

/**
 * Create a new keypair and write it to `path`, never overwriting.
 *
 * The write uses the "wx" flag so the existence check and the write are one
 * atomic operation. Checking first and writing after would leave a window in
 * which two runs both see no file and the second destroys the first key, which
 * on a funded account means losing the funds.
 */
export function generateKeypairFile(path: string): GeneratedKeypair {
  const keypair = Keypair.generate();
  mkdirSync(dirname(resolve(path)), { recursive: true });

  try {
    writeFileSync(path, serializeKeypair(keypair), { encoding: "utf8", flag: "wx" });
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "EEXIST") {
      throw new Error(
        `A keypair already exists at ${path}. Refusing to overwrite it; delete it yourself if you really mean to replace it.`,
      );
    }
    throw new Error(`Cannot write the keypair to ${path}: ${(error as Error).message}`);
  }

  return { publicKey: keypair.publicKey.toBase58(), path };
}
