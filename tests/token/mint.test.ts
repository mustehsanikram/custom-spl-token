import { describe, expect, it } from "vitest";
import {
  ExtensionType,
  TOKEN_2022_PROGRAM_ID,
  TokenInstruction,
  TransferFeeInstruction,
  decodeInitializeTransferFeeConfigInstruction,
  getMintLen,
} from "@solana/spl-token";
import { Keypair, SystemProgram, type Connection } from "@solana/web3.js";
import {
  MINT_EXTENSIONS,
  buildCreateMintInstructions,
  createFeeMint,
  maximumFeeRawFrom,
  mintAccountSpace,
  mintRentLamports,
} from "../../src/token/mint.js";
import type { AppConfig } from "../../src/config.js";

describe("mintAccountSpace", () => {
  it("sizes the account for a mint carrying the transfer fee extension", () => {
    // 82 bytes of base mint plus the TransferFeeConfig extension and its TLV header.
    expect(mintAccountSpace()).toBe(278);
  });

  it("is larger than a plain mint, because of the extension", () => {
    expect(mintAccountSpace()).toBeGreaterThan(getMintLen([]));
  });

  it("stays in step with the declared extension list", () => {
    // Guards against the size and the extension list drifting apart: adding an
    // extension without resizing is what produces an uninitializable account.
    expect(mintAccountSpace()).toBe(getMintLen([...MINT_EXTENSIONS]));
    expect([...MINT_EXTENSIONS]).toEqual([ExtensionType.TransferFeeConfig]);
  });
});

describe("mintRentLamports", () => {
  it("asks the chain for the exemption at exactly the computed size", async () => {
    let askedFor: number | undefined;
    const connection = {
      async getMinimumBalanceForRentExemption(space: number): Promise<number> {
        askedFor = space;
        return 2_616_960;
      },
    } as unknown as Connection;

    const rent = await mintRentLamports(connection);

    expect(askedFor).toBe(278);
    expect(rent).toBe(2_616_960n);
  });
});

describe("buildCreateMintInstructions", () => {
  const payer = Keypair.generate().publicKey;
  const mint = Keypair.generate().publicKey;

  const instructions = buildCreateMintInstructions({
    payer,
    mint,
    decimals: 9,
    transferFeeBasisPoints: 100,
    maximumFeeRaw: 10n ** 15n,
    rentLamports: 2_571_198n,
  });

  it("produces exactly three instructions", () => {
    expect(instructions).toHaveLength(3);
  });

  it("creates the account first, owned by Token-2022 and sized for the extension", () => {
    const create = instructions[0];
    expect(create?.programId.equals(SystemProgram.programId)).toBe(true);
    // The new account is the second key and must be the mint.
    expect(create?.keys[1]?.pubkey.equals(mint)).toBe(true);
  });

  it("initializes the fee extension before the mint, which is the required order", () => {
    // Reversing these two is rejected by the program with an unhelpful error.
    const feeConfig = instructions[1];
    const initMint = instructions[2];

    expect(feeConfig?.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);
    expect(initMint?.programId.equals(TOKEN_2022_PROGRAM_ID)).toBe(true);

    const decoded = decodeInitializeTransferFeeConfigInstruction(
      feeConfig!,
      TOKEN_2022_PROGRAM_ID,
    );
    // Extension instructions carry a two-byte discriminator: the outer byte
    // routes to the transfer fee extension, the inner one to the operation.
    expect(decoded.data.instruction).toBe(TokenInstruction.TransferFeeExtension);
    expect(decoded.data.transferFeeInstruction).toBe(
      TransferFeeInstruction.InitializeTransferFeeConfig,
    );
  });

  it("sets both fee authorities to the payer", () => {
    const decoded = decodeInitializeTransferFeeConfigInstruction(
      instructions[1]!,
      TOKEN_2022_PROGRAM_ID,
    );

    expect(decoded.data.transferFeeConfigAuthority?.equals(payer)).toBe(true);
    expect(decoded.data.withdrawWithheldAuthority?.equals(payer)).toBe(true);
  });

  it("encodes the configured rate and maximum fee", () => {
    const decoded = decodeInitializeTransferFeeConfigInstruction(
      instructions[1]!,
      TOKEN_2022_PROGRAM_ID,
    );

    expect(decoded.data.transferFeeBasisPoints).toBe(100);
    expect(decoded.data.maximumFee).toBe(10n ** 15n);
  });

  it("carries the rate through, so a different config produces different data", () => {
    const other = buildCreateMintInstructions({
      payer,
      mint,
      decimals: 9,
      transferFeeBasisPoints: 200,
      maximumFeeRaw: 10n ** 15n,
      rentLamports: 2_571_198n,
    });

    const decoded = decodeInitializeTransferFeeConfigInstruction(
      other[1]!,
      TOKEN_2022_PROGRAM_ID,
    );
    expect(decoded.data.transferFeeBasisPoints).toBe(200);
  });
});

const config: AppConfig = {
  network: "devnet",
  rpcUrl: "https://api.devnet.solana.com",
  authorityKeypairPath: "unused",
  decimals: 9,
  totalSupply: 1_000_000,
  transferFeeBasisPoints: 100,
  transferFeeMaxTokens: 1_000_000,
};

describe("maximumFeeRawFrom", () => {
  it("converts the whole-token cap to base units at the mint's decimals", () => {
    expect(maximumFeeRawFrom(config)).toBe(10n ** 15n);
    expect(maximumFeeRawFrom({ ...config, decimals: 0 })).toBe(1_000_000n);
  });
});

describe("createFeeMint", () => {
  it("refuses to send when the authority cannot cover rent", async () => {
    let sendAttempted = false;
    const connection = {
      async getMinimumBalanceForRentExemption(): Promise<number> {
        return 2_571_198;
      },
      async getBalance(): Promise<number> {
        return 0;
      },
      async sendTransaction(): Promise<string> {
        sendAttempted = true;
        return "should-not-happen";
      },
      async getLatestBlockhash() {
        sendAttempted = true;
        return { blockhash: "11111111111111111111111111111111", lastValidBlockHeight: 1 };
      },
    } as unknown as Connection;

    await expect(createFeeMint(connection, Keypair.generate(), config)).rejects.toThrow(
      /Insufficient SOL/,
    );

    // The point of the guard: nothing is built or broadcast on a doomed run.
    expect(sendAttempted).toBe(false);
  });
});
