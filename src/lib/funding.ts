import {
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Connection,
  type Keypair,
} from "@solana/web3.js";
import { baseUnitsToTokens, tokensToBaseUnits } from "./amount.js";

/** SOL has 9 decimals, so the token conversion helpers apply unchanged. */
const SOL_DECIMALS = 9;

/** Devnet rejects large single airdrops; 1 SOL per request is reliably accepted. */
const MAX_AIRDROP_LAMPORTS = BigInt(LAMPORTS_PER_SOL);

/**
 * Headroom left unspent so a transfer cannot leave the authority unable to pay
 * for the transaction that sends it. A signature costs 5000 lamports; this is
 * deliberately generous.
 */
export const FEE_RESERVE_LAMPORTS = 50_000n;

const FAUCET_URL = "https://faucet.solana.com";

export interface FundingResult {
  /** Signature of the last airdrop, or null when none was needed. */
  readonly signature: string | null;
  readonly balanceLamports: bigint;
}

export interface EnsureFundedOptions {
  readonly attempts?: number;
  readonly delayMs?: number;
}

export function solToLamports(sol: string): bigint {
  return tokensToBaseUnits(sol, SOL_DECIMALS);
}

export function lamportsToSol(lamports: bigint): string {
  return baseUnitsToTokens(lamports, SOL_DECIMALS);
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Refuse a spend the balance cannot cover, before anything is sent.
 *
 * Pure so the guard can be tested against injected balances: a partially
 * funded round is worse than one that never started, because some recipients
 * end up paid and the rest stranded.
 */
export function assertSufficientBalance(
  balanceLamports: bigint,
  requiredLamports: bigint,
  feeReserveLamports: bigint = FEE_RESERVE_LAMPORTS,
): void {
  const needed = requiredLamports + feeReserveLamports;

  if (balanceLamports < needed) {
    throw new Error(
      `Insufficient SOL: holding ${lamportsToSol(balanceLamports)} but need ${lamportsToSol(needed)} (${lamportsToSol(requiredLamports)} to send plus ${lamportsToSol(feeReserveLamports)} reserved for fees).`,
    );
  }
}

/**
 * Top the account up to `minimumLamports` by airdrop, doing nothing when it is
 * already funded.
 *
 * Only the authority should ever be airdropped. Devnet rate-limits per
 * recipient, so funding many accounts this way fails on repeat runs; fund the
 * rest with `fundFromAuthority`.
 */
export async function ensureFunded(
  connection: Connection,
  publicKey: PublicKey,
  minimumLamports: bigint,
  options: EnsureFundedOptions = {},
): Promise<FundingResult> {
  const attempts = options.attempts ?? 3;
  const delayMs = options.delayMs ?? 1_500;

  let signature: string | null = null;
  let lastError: unknown;

  for (let attempt = 1; attempt <= attempts; attempt++) {
    const balanceLamports = BigInt(await connection.getBalance(publicKey));

    if (balanceLamports >= minimumLamports) {
      return { signature, balanceLamports };
    }

    const shortfall = minimumLamports - balanceLamports;
    const request = shortfall > MAX_AIRDROP_LAMPORTS ? MAX_AIRDROP_LAMPORTS : shortfall;

    try {
      signature = await connection.requestAirdrop(publicKey, Number(request));
      const latest = await connection.getLatestBlockhash();
      await connection.confirmTransaction({ signature, ...latest }, "confirmed");
    } catch (error) {
      lastError = error;
      if (attempt < attempts) {
        await delay(delayMs);
      }
    }
  }

  const balanceLamports = BigInt(await connection.getBalance(publicKey));
  if (balanceLamports >= minimumLamports) {
    return { signature, balanceLamports };
  }

  throw new Error(
    `Could not fund ${publicKey.toBase58()} to ${lamportsToSol(minimumLamports)} SOL after ${attempts} airdrop attempts (balance ${lamportsToSol(balanceLamports)} SOL). Devnet airdrops are rate limited; fund it manually at ${FAUCET_URL}${lastError ? `. Last error: ${describe(lastError)}` : "."}`,
  );
}

/** Transfer SOL from the authority to another account, returning the signature. */
export async function fundFromAuthority(
  connection: Connection,
  authority: Keypair,
  recipient: PublicKey,
  lamports: bigint,
): Promise<string> {
  if (lamports <= 0n) {
    throw new Error(`Transfer amount must be positive, got: ${lamports}`);
  }

  const balanceLamports = BigInt(await connection.getBalance(authority.publicKey));
  assertSufficientBalance(balanceLamports, lamports);

  const transaction = new Transaction().add(
    SystemProgram.transfer({
      fromPubkey: authority.publicKey,
      toPubkey: recipient,
      lamports: Number(lamports),
    }),
  );

  return sendAndConfirmTransaction(connection, transaction, [authority], {
    commitment: "confirmed",
  });
}
