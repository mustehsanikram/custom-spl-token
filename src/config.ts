import { clusterApiUrl, type Cluster } from "@solana/web3.js";
import "dotenv/config";

export type Network = Cluster | "localnet";

const LOCALNET_RPC = "http://127.0.0.1:8899";

function required(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required env var: ${name}`);
  return value;
}

function int(name: string, fallback: number): number {
  const raw = process.env[name];
  if (!raw) return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed)) throw new Error(`${name} must be an integer, got: ${raw}`);
  return parsed;
}

export interface AppConfig {
  network: Network;
  rpcUrl: string;
  authorityKeypairPath: string;
  decimals: number;
  totalSupply: number;
  transferFeeBasisPoints: number;
  transferFeeMaxTokens: number;
}

export function loadConfig(): AppConfig {
  const network = (process.env.SOLANA_NETWORK ?? "devnet") as Network;
  const rpcUrl =
    process.env.SOLANA_RPC_URL ||
    (network === "localnet" ? LOCALNET_RPC : clusterApiUrl(network as Cluster));

  const transferFeeBasisPoints = int("TRANSFER_FEE_BASIS_POINTS", 100);
  // The spec caps the fee at 2%; reject config that would silently exceed it.
  if (transferFeeBasisPoints < 0 || transferFeeBasisPoints > 200) {
    throw new Error(`TRANSFER_FEE_BASIS_POINTS must be 0-200 (0-2%), got: ${transferFeeBasisPoints}`);
  }

  const decimals = int("TOKEN_DECIMALS", 9);
  // A mint's decimals cannot be changed after creation, and Solana tooling
  // assumes 0 to 9. Anything outside that yields a mint no wallet displays
  // correctly, so reject it before a transaction is ever built.
  if (decimals < 0 || decimals > 9) {
    throw new Error(`TOKEN_DECIMALS must be 0-9, got: ${decimals}`);
  }

  return {
    network,
    rpcUrl,
    authorityKeypairPath: required("AUTHORITY_KEYPAIR_PATH"),
    decimals,
    totalSupply: int("TOKEN_TOTAL_SUPPLY", 1_000_000),
    transferFeeBasisPoints,
    transferFeeMaxTokens: int("TRANSFER_FEE_MAX_TOKENS", 1_000_000),
  };
}
