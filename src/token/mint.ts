import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  createInitializeMint2Instruction,
  createInitializeTransferFeeConfigInstruction,
  getMintLen,
} from "@solana/spl-token";
import {
  Keypair,
  SystemProgram,
  Transaction,
  sendAndConfirmTransaction,
  type Connection,
  type PublicKey,
  type TransactionInstruction,
} from "@solana/web3.js";
import { tokensToBaseUnits } from "../lib/amount.js";
import { assertSufficientBalance } from "../lib/funding.js";
import type { AppConfig } from "../config.js";
import type { CreatedMint } from "./types.js";

/**
 * The extensions this mint carries. Exactly one: the transfer fee.
 *
 * The account is sized once at creation and cannot grow, so this list is what
 * determines how many bytes to allocate. Adding an extension later means a new
 * mint, not a resized one.
 */
export const MINT_EXTENSIONS = [ExtensionType.TransferFeeConfig] as const;

/**
 * Bytes to allocate for the mint account.
 *
 * Derived from the extension list rather than hardcoded: a wrong size produces
 * an account the Token-2022 program cannot initialize, and the failure surfaces
 * as an opaque instruction error.
 */
export function mintAccountSpace(): number {
  return getMintLen([...MINT_EXTENSIONS]);
}

/** Lamports needed to make the mint account rent exempt. */
export async function mintRentLamports(connection: Connection): Promise<bigint> {
  return BigInt(await connection.getMinimumBalanceForRentExemption(mintAccountSpace()));
}

export interface CreateMintInstructionsInput {
  /** Pays rent and fees, and becomes every authority on the mint. */
  readonly payer: PublicKey;
  /** Address of the mint account being created. */
  readonly mint: PublicKey;
  readonly decimals: number;
  readonly transferFeeBasisPoints: number;
  readonly maximumFeeRaw: bigint;
  readonly rentLamports: bigint;
}

/**
 * The three instructions that create the mint, in the only order that works.
 *
 * Token-2022 requires every extension to be initialized after the account
 * exists but *before* the mint itself is initialized. Initializing the mint
 * first leaves no room for the extension and the program rejects it with an
 * error that does not say so. Building this separately from sending lets that
 * ordering be asserted in a unit test rather than discovered from a failed
 * transaction.
 */
export function buildCreateMintInstructions(
  input: CreateMintInstructionsInput,
): TransactionInstruction[] {
  const space = mintAccountSpace();

  return [
    SystemProgram.createAccount({
      fromPubkey: input.payer,
      newAccountPubkey: input.mint,
      space,
      lamports: Number(input.rentLamports),
      programId: TOKEN_2022_PROGRAM_ID,
    }),
    createInitializeTransferFeeConfigInstruction(
      input.mint,
      input.payer, // transfer fee config authority, retained so the rate stays adjustable
      input.payer, // withdraw withheld authority
      input.transferFeeBasisPoints,
      input.maximumFeeRaw,
      TOKEN_2022_PROGRAM_ID,
    ),
    createInitializeMint2Instruction(
      input.mint,
      input.decimals,
      input.payer, // mint authority, revoked in feature 4 after allocation
      null, // no freeze authority: the plan does not call for freezing
      TOKEN_2022_PROGRAM_ID,
    ),
  ];
}

/** The per-transfer fee cap, converted from whole tokens to base units. */
export function maximumFeeRawFrom(config: AppConfig): bigint {
  return tokensToBaseUnits(String(config.transferFeeMaxTokens), config.decimals);
}

/**
 * Create the mint on chain and return its address.
 *
 * The mint keypair is ephemeral: it exists only to sign the account creation,
 * after which the authority controls the mint. Nothing is persisted, which is
 * why every run produces a fresh mint.
 *
 * The balance is checked before anything is built. A transaction that fails
 * partway leaves a created-but-uninitialized account and a spent fee, so the
 * cheap check comes first.
 */
export async function createFeeMint(
  connection: Connection,
  authority: Keypair,
  config: AppConfig,
): Promise<CreatedMint> {
  const rentLamports = await mintRentLamports(connection);
  const balanceLamports = BigInt(await connection.getBalance(authority.publicKey));
  assertSufficientBalance(balanceLamports, rentLamports);

  const maximumFeeRaw = maximumFeeRawFrom(config);
  const mintKeypair = Keypair.generate();

  const transaction = new Transaction().add(
    ...buildCreateMintInstructions({
      payer: authority.publicKey,
      mint: mintKeypair.publicKey,
      decimals: config.decimals,
      transferFeeBasisPoints: config.transferFeeBasisPoints,
      maximumFeeRaw,
      rentLamports,
    }),
  );

  const signature = await sendAndConfirmTransaction(
    connection,
    transaction,
    [authority, mintKeypair],
    { commitment: "confirmed" },
  );

  return {
    mintAddress: mintKeypair.publicKey.toBase58(),
    signature,
    decimals: config.decimals,
    transferFeeBasisPoints: config.transferFeeBasisPoints,
    maximumFeeRaw,
  };
}
