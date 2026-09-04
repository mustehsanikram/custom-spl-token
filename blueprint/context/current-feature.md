# Feature: Mint creation

**From build-plan:** feature 3
**Status:** in progress - steps 1-3 landed on main, 4-5 remain

## Goal

Create the Token-2022 mint on devnet with the TransferFee extension initialized
at 1 percent, and read the configuration back to prove it took.

This is the first thing the project writes to a chain. Features 4 through 10 all
operate on the mint this creates.

## Precondition

**The authority needs devnet SOL.** `4TtRUyS12Kho6mZaXZKWjtEoFhCBY6DNEnBVjWQ13LaK`
currently holds 0, and steps 3 to 5 cannot run without it. The requirement is
small (rent for roughly 400 bytes plus a signature fee, on the order of 0.005
SOL), so any faucet amount is plenty. Steps 1 and 2 are pure and run regardless.

This also closes feature 1's deferred devnet evidence.

## In scope

- Mint account sizing for exactly the TransferFeeConfig extension, and its rent
- Building the three creation instructions in the required order
- Sending and confirming the creation transaction
- Reading the fee configuration back and exposing it as a typed shape
- A standalone `npm run create-mint` command
- Validating `TOKEN_DECIMALS` at the config boundary
- Unit tests for everything computable without a network

## Out of scope

- Minting any supply, or revoking the mint authority (feature 4)
- Changing the fee rate or reading pending changes (feature 5)
- Transfers, harvesting, or withdrawal (features 6 and 7)
- Token metadata (name and symbol on chain); the plan lists it as a non-goal
- Persisting the mint address anywhere; a fresh mint per run is deliberate

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Sizing, rent, and decimals validation** - `src/token/mint.ts` for
  `mintAccountSpace()` via `getMintLen([ExtensionType.TransferFeeConfig])` and
  `mintRentLamports(connection)`; plus a `TOKEN_DECIMALS` range check in
  `src/config.ts`, which currently accepts any integer and would let an
  unusable mint be configured. *Done when:* the space is asserted against a
  concrete number in a unit test, decimals outside 0 to 9 throw at startup with
  a clear message, and the existing config tests still pass.

- [x] **Step 2 - Build the creation instructions** - `src/token/mint.ts`.
  `buildCreateMintInstructions(...)` returning, in order: `createAccount` sized
  and rent-funded, `createInitializeTransferFeeConfigInstruction`, then
  `createInitializeMint2Instruction`. Nothing is sent. *Done when:* a unit test
  asserts exactly three instructions, that the latter two target
  `TOKEN_2022_PROGRAM_ID`, that the fee-config instruction precedes the mint
  init (the program rejects the reverse), and that both authorities are set to
  the authority public key.

- [ ] **Step 3 - Create the mint on devnet** - `src/token/mint.ts`.
  `createFeeMint(connection, authority, config)` generating an ephemeral mint
  keypair, checking the authority can cover rent plus fees via the existing
  `assertSufficientBalance`, sending, confirming, and returning `CreatedMint`.
  *Done when:* a devnet run returns a mint address and a signature that resolves
  on the explorer, and an underfunded authority fails before anything is sent,
  naming the shortfall.

- [ ] **Step 4 - Read the configuration back** - `src/token/mint.ts`.
  `readMintFeeState(connection, mint)` using `getMint` and `getTransferFeeConfig`
  with the Token-2022 program id, returning `MintFeeState`. *Done when:* reading
  a freshly created mint reports 100 basis points, the configured maximum fee in
  base units, both authorities equal to the authority public key, a withheld
  amount of 0, and the supply 0.

- [ ] **Step 5 - Standalone command** - `src/scripts/create-mint.ts`, an
  `npm run create-mint` script, and the matching `AGENTS.md` entry. Prints the
  mint address, the read-back fee state, and an explorer link. *Done when:* the
  command runs end to end against devnet and prints an address that resolves on
  the explorer with the TransferFee extension visible.

## Files / areas

| File | Purpose |
|---|---|
| `src/token/mint.ts` | Sizing, instruction building, creation, read-back (new) |
| `src/token/types.ts` | `CreatedMint` and `MintFeeState` contracts (new) |
| `src/scripts/create-mint.ts` | Standalone command (new) |
| `src/config.ts` | Adds the decimals range check (modified) |
| `package.json`, `AGENTS.md` | The new command (modified) |
| `tests/token/mint.test.ts`, `tests/config.test.ts` | New and extended |

## Data / contracts

**Load-bearing.** Features 4 through 10 consume these.

```ts
export interface CreatedMint {
  readonly mintAddress: string;   // base58
  readonly signature: string;
  readonly decimals: number;
  readonly transferFeeBasisPoints: number;
  readonly maximumFeeRaw: bigint;
}

export interface MintFeeState {
  readonly basisPoints: number;        // currently active rate
  readonly maximumFeeRaw: bigint;
  readonly configAuthority: string | null;
  readonly withdrawAuthority: string | null;
  readonly olderEpoch: bigint;
  readonly newerEpoch: bigint;
  readonly withheldAmountRaw: bigint;  // held at the mint, awaiting withdrawal
  readonly supplyRaw: bigint;
  readonly decimals: number;
}
```

**Conventions this feature locks in:**

- `TOKEN_2022_PROGRAM_ID` is passed explicitly on every `@solana/spl-token` call.
  The library defaults to the legacy program and will silently target the wrong one.
- The mint keypair is **ephemeral**. It signs account creation and is then
  discarded; the authority controls the mint afterwards. Nothing is persisted,
  matching the fresh-mint-per-run decision.
- Because nothing is persisted, **later standalone scripts take the mint address
  as an argument**. Feature 10's orchestrator passes it in memory instead.
- `TRANSFER_FEE_MAX_TOKENS` is whole tokens in config and is converted to base
  units with `tokensToBaseUnits` from feature 2. No new decimal handling.

## Testing

`npm test` (Vitest) is the gate. Coverage splits the same way as feature 1:

| Testable without a network | Proven by a devnet run |
|---|---|
| Mint account space for the extension set | Creation landing, with a signature |
| Instruction count, order, program ids, authorities | Read-back matching what was configured |
| Decimals validation at the config boundary | Explorer showing the extension |
| Maximum-fee conversion to base units | |

Instruction building is deliberately separated from sending (steps 2 and 3) so
the ordering constraint that actually matters can be unit tested rather than
only observed after a failed transaction.

## Notes for the AI

- **Instruction order is a hard requirement.** Extension initialization must come
  after `createAccount` and before `initializeMint2`. The program rejects a mint
  initialized before its extensions, and the failure message is unhelpful.
- **Space must come from `getMintLen`**, never a hardcoded number. Getting it
  wrong produces an account the program cannot initialize.
- Freeze authority is `null`. The plan does not call for freezing, and setting an
  authority nobody intends to use is a liability.
- Mint authority is set to the authority now and revoked in feature 4. Do not
  revoke here.
- Reuse `assertSufficientBalance` from `src/lib/funding.ts` rather than writing a
  second balance guard.
- Confirm with `"confirmed"`, then read the mint back at `"confirmed"` before
  reporting success. Do not report a mint that has not been read back.
- ESM: relative imports carry the `.js` extension; `import type` for type-only imports.
- Follow `blueprint/context/coding-standards.md`; amounts stay `bigint` base units.

## Progress note

Steps 1 to 3 were merged to main as a checkpoint so the work is not stranded on
a branch. **This feature is not complete**, and build-plan item 3 is
deliberately left unchecked.

| Step | State |
|---|---|
| 1 Sizing, rent, decimals validation | Built and unit tested |
| 2 Creation instructions | Built and unit tested, order pinned by test |
| 3 Create the mint | Code written; the pre-send balance guard is proven live against devnet, but the mint itself was never created |
| 4 Read the configuration back | Not written |
| 5 Standalone `npm run create-mint` | Not written |

**Blocker:** the authority `4TtRUyS12Kho6mZaXZKWjtEoFhCBY6DNEnBVjWQ13LaK` holds
0 SOL. Measured requirement is 0.002621198 SOL: 0.002571198 rent for the
278-byte mint account plus a 0.00005 fee reserve. The devnet RPC airdrop
returned HTTP 429 on every attempt, and no transfer reached the authority.

Proven live rather than assumed:

    Insufficient SOL: holding 0 but need 0.002621198
    (0.002571198 to send plus 0.00005 reserved for fees).

**To resume:** fund the authority, then run `/implement`. It reads the checked
steps above and continues from step 3.
