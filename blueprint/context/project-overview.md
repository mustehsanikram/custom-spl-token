# Custom Solana SPL Token - Project Overview

<!-- blueprint:source-hash fe6f30c60a5ee657ba25dc40e6cb26cf0c30ba36fe83328c7da8c7c7913b6fa5 -->

> **Generated file. Don't hand-edit.** Re-run `/overview` when `project-plan.md`
> or `build-plan.md` changes materially.

> A Token-2022 SPL token with a 1 to 2 percent transfer fee and pro-rata holder
> cashback, capped at 1,000,000 supply, demonstrated end to end on devnet by a
> single command.

## Problem

This is a learning and portfolio project, so the goal is understanding rather
than a market need. Creating a mint is trivial; the engineering that matters is
the arithmetic around it, which fee-and-redistribute tokens routinely get wrong:
inverse-fee gross-up, pro-rata division in integer base units, account
exclusions, and the fact that Token-2022 taxes the cashback payouts themselves.

The project exists to get those right and prove it with tests. Launching a token,
attracting holders, creating a market, and making money are all explicitly out of
scope.

## Users

| User | Needs |
|---|---|
| The developer | Small reviewable steps, honest tests, decisions recorded with rationale |
| A technical reviewer | To clone, run one command, and watch the full lifecycle work against a real network |

The reviewer drives a hard requirement: **reproducible from a clean clone**.
Install, set one keypair path, run one command. If it needs a verbal walkthrough,
it has failed.

## Features

In `build-plan.md` order. Item 10 is the headline: everything else exists to make
it work.

1. **Core helpers** - connection factory, keypair loading from a gitignored path, devnet SOL funding, base-unit amount conversion.
2. **Fee and distribution math** - pure module for fee calculation, inverse-fee gross-up, pro-rata shares, dust, and exclusions. No network. Carries most of the test value.
3. **Mint creation** - Token-2022 mint with the TransferFee extension at 1 percent, config and withdraw authorities set.
4. **Allocation and revocation** - mint the fixed 1,000,000 supply directly into holder and treasury accounts, then permanently revoke the mint authority.
5. **Fee rate scheduling** - schedule the change to 2 percent and read back the pending config with its activation epoch.
6. **Fee-accruing transfers** - `transferChecked` between holders, with per-account withheld amounts read back and reconciled against the expected fee.
7. **Harvest and withdraw** - harvest withheld amounts to the mint, withdraw them into the treasury.
8. **Holder snapshot** - enumerate token accounts at a point in time, apply exclusions, produce the eligible balance set.
9. **Cashback distribution** - grossed-up pro-rata payouts, pre-flight treasury sufficiency check, dust retained.
10. **One-command demo** - orchestrate the full lifecycle with staged output, a summary table, and a signature for every transaction. **Headline.**
11. **README and recorded run** - setup reproducible from a clean clone, plus a recorded devnet run with verifiable signatures.

## Data model

There is no database. State lives on-chain, plus in-process structures that never
touch disk. A fresh mint is created every run, so nothing carries between runs.

### Mint account (on-chain, Token-2022)

- `address` (PublicKey) - created fresh each run
- `decimals` (u8) - 9
- `supply` (u64) - 1,000,000 tokens, so 10^15 base units
- `mintAuthority` (Option<PublicKey>) - set at creation, revoked to `None` after allocation
- `freezeAuthority` - not set
- extension: `TransferFeeConfig`

### TransferFeeConfig (mint extension)

- `transferFeeConfigAuthority` (PublicKey) - retained, so the rate stays adjustable
- `withdrawWithheldAuthority` (PublicKey) - authorized to move withheld fees to the treasury
- `withheldAmount` (u64) - fees harvested to the mint, awaiting withdrawal
- `olderTransferFee` / `newerTransferFee` - each `{ epoch, maximumFee, transferFeeBasisPoints }`

> The older/newer pair **is** the two-epoch delay mechanism. A scheduled change
> lands in `newerTransferFee` with a future epoch and is readable immediately.
> Feature 5 depends on this shape.

### Token account (per holder and treasury)

- `address` (PublicKey) - associated token account for (owner, mint) under the Token-2022 program
- `owner` (PublicKey)
- `amount` (u64) - balance in base units
- extension: `TransferFeeAmount.withheldAmount` (u64) - fee skimmed on receipt, held here until harvested

> Fees accrue on the **recipient's** account, not the sender's. Features 6 and 7
> depend on this.

### HolderSnapshot (in-process only)

- `capturedAtSlot` (number)
- `entries` - array of `{ address, owner, balanceRaw: bigint }`
- `totalEligibleRaw` (bigint)
- excludes the treasury, the mint authority, and zero-balance accounts

### DistributionPlan (in-process only)

- `distributableRaw` (bigint) - treasury balance available this round
- `rows` - array of `{ owner, balanceRaw, netShareRaw, grossSendRaw, feeRaw }`
- `dustRaw` (bigint) - remainder, retained in the treasury
- `totalGrossRaw` (bigint) - must not exceed the treasury balance, or the round aborts before any transfer

> **Locked shape:** every on-chain amount is `bigint` in base units. No `number`
> and no floating point anywhere in the amount path. Features 2, 8, and 9 all
> depend on this.

## Tech stack

- **TypeScript (ESM, strict)** - all application code; `noUncheckedIndexedAccess` and `verbatimModuleSyntax` on
- **Node 20+** (developed on 22) - runtime
- **@solana/web3.js 1.x** - connection, keypairs, transactions
- **@solana/spl-token 0.4.x** - Token-2022 mint, extensions, transfers, fee instructions
- **Vitest** - unit tests, the project's quality gate
- **npm** - package manager, lockfile committed
- **Devnet** - the only target network

**Constraints that shape the code:**

- The transfer-fee extension has **no exemption or whitelist**. Every transfer is taxed, cashback payouts included.
- `mintTo` is **not** a transfer and is untaxed. This is why allocation uses direct minting rather than treasury transfers.
- A fee change activates **two epochs later** (an epoch is 432,000 slots, so days). Only the pending state is demonstrable in one run.
- Fee-extension mints require `transferChecked`. Plain `transfer` fails.
- `@solana/spl-token` defaults to the legacy token program. `TOKEN_2022_PROGRAM_ID` must be passed explicitly on every call.

**Not installed and not required:** the Solana CLI. Everything runs through
`@solana/web3.js`.

## Monetization

Not in v1, and not intended ever. This is a learning artifact. The transfer fee
is a **mechanism being demonstrated**, not a revenue model; devnet fees have no
value, nothing is sold, and no third party is invited to acquire anything.

## UI/UX

No graphical interface and no routes. The interface is the terminal output of one
command, and its quality is a real deliverable because it is what a reviewer
experiences.

- Announce each stage before it runs, so a slow network read is never a silent hang
- Print balances and fee state before and after each stage
- Show the arithmetic where it matters: computed share, gross-up, fee, net received
- Emit a signature for every transaction so any claim is independently verifiable
- Fail loudly, naming the failing stage and printing the signature when one exists
- End with a summary table: per-holder starting balance, fees generated, cashback received, ending balance

Accessibility: plain text, never color alone to convey meaning, no box-drawing
that breaks in a narrow terminal.

## Deployment

Devnet only, run from a developer machine. No hosting, no service, no scheduled
job, no CI configured.

| Concern | Value |
|---|---|
| Target | Solana devnet |
| App type | One-shot CLI script |
| Install | `npm install` |
| Build | `npm run build` (emits `dist/`) |
| Run | `npm run dev` |
| Typecheck | `npm run typecheck` |
| Test | `npm test` |
| Verify command | None yet; run `/ci` to create one |
| Health check | Not applicable |

**Env vars by name** (from `.env.example`, all gitignored in `.env`):
`SOLANA_NETWORK`, `SOLANA_RPC_URL`, `AUTHORITY_KEYPAIR_PATH`, `TOKEN_NAME`,
`TOKEN_SYMBOL`, `TOKEN_DECIMALS`, `TOKEN_TOTAL_SUPPLY`,
`TRANSFER_FEE_BASIS_POINTS`, `TRANSFER_FEE_MAX_TOKENS`, `TREASURY_ADDRESS`.

Funding: the authority keypair is funded by devnet airdrop; holders are funded by
SOL transfer from the authority, avoiding airdrop rate limits on repeat runs.

Mainnet is out of scope. Adding it would require an explicit confirmation flag,
which is already a stated requirement in `coding-standards.md`.

## Open questions

> Resolve these in the plans, then re-run `/overview`.

- **On-chain fee rounding direction is unverified.** The client library's instruction surface was checked, but not the program's actual rounding rule. The gross-up math in feature 2 depends on it. Confirm empirically rather than assuming.
- **Token name and symbol undecided.** `TOKEN_NAME` and `TOKEN_SYMBOL` are blank in `.env.example`.
- **Devnet epoch duration should be read from the chain** when reporting the pending fee activation in feature 5, not quoted from the nominal 432,000-slot figure.
- **Known and accepted limitation:** a point-in-time snapshot is gameable. A holder can acquire tokens immediately before the snapshot and dispose of them after. Closing this needs time-weighting, which is deliberately out of scope.
