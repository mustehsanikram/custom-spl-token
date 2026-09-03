import "dotenv/config";
import { generateKeypairFile } from "../lib/keypair.js";

/**
 * Deliberately does not go through `loadConfig`. On a clean clone there is no
 * `.env` yet, and requiring a full valid config to create the very keypair the
 * config points at would be circular. Path resolution order: an explicit
 * argument, then the env var, then the default.
 */
const DEFAULT_PATH = "./keypairs/authority.json";

function main(): void {
  const path = process.argv[2] ?? process.env.AUTHORITY_KEYPAIR_PATH ?? DEFAULT_PATH;
  const { publicKey } = generateKeypairFile(path);

  console.log("Keypair created.");
  console.log("  Path:      ", path);
  console.log("  Public key:", publicKey);
  console.log();
  console.log("Set AUTHORITY_KEYPAIR_PATH in .env to this path.");
  console.log("The secret key is in that file. It is gitignored; keep it that way.");
  console.log("Fund it on devnet with: https://faucet.solana.com");
}

try {
  main();
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
}
