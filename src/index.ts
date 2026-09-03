import { createConnection, assertReachable } from "./lib/connection.js";
import { lamportsToSol, solToLamports } from "./lib/funding.js";
import { loadKeypair } from "./lib/keypair.js";
import { loadConfig } from "./config.js";

/** Enough to cover mint creation and the demo's transactions in later features. */
const RECOMMENDED_BALANCE = solToLamports("0.5");

async function main(): Promise<void> {
  const config = loadConfig();
  const connection = createConnection(config);
  const solanaCore = await assertReachable(connection);
  const authority = loadKeypair(config.authorityKeypairPath);
  const balanceLamports = BigInt(await connection.getBalance(authority.publicKey));

  console.log("Network:      ", config.network);
  console.log("RPC:          ", config.rpcUrl);
  console.log("Solana core:  ", solanaCore);
  console.log("Authority:    ", authority.publicKey.toBase58());
  console.log("Balance:      ", `${lamportsToSol(balanceLamports)} SOL`);
  console.log("Decimals:     ", config.decimals);
  console.log("Total supply: ", config.totalSupply.toLocaleString());
  console.log("Transfer fee: ", `${config.transferFeeBasisPoints / 100}%`);

  // Reporting state is this command's job, so an unfunded authority is a
  // warning rather than a failure. The features that actually spend SOL call
  // ensureFunded themselves and fail there, where it matters.
  if (balanceLamports < RECOMMENDED_BALANCE) {
    console.log();
    console.log(
      `Warning: balance is below the recommended ${lamportsToSol(RECOMMENDED_BALANCE)} SOL.`,
    );
    console.log(`Fund ${authority.publicKey.toBase58()} at https://faucet.solana.com (devnet).`);
  }
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
