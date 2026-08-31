import { Connection } from "@solana/web3.js";
import { loadConfig } from "./config.js";

async function main(): Promise<void> {
  const config = loadConfig();
  const connection = new Connection(config.rpcUrl, "confirmed");
  const version = await connection.getVersion();

  console.log("Network:      ", config.network);
  console.log("RPC:          ", config.rpcUrl);
  console.log("Solana core:  ", version["solana-core"]);
  console.log("Decimals:     ", config.decimals);
  console.log("Total supply: ", config.totalSupply.toLocaleString());
  console.log("Transfer fee: ", `${config.transferFeeBasisPoints / 100}%`);
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
