# Custom Solana SPL Token - Project Overview

<!-- blueprint:source-hash ce5c264cc162b6568bd6b8d8270519a656f616cdb1aa7db1b3684a823251a7ae -->

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

| # | Feature | Delivers | Status |
|---|---|---|---|
| 1 | Core helpers | Connection factory, keypair loading from a gitignored path, devnet SOL funding | Next |
| 2 | Fee and distribution math | Pure fee, gross-up, pro-rata, dust, and exclusion logic. No network. | **Shipped** |
| 3 | Mint creation | Token-2022 mint with the TransferFee extension at 1 percent, authorities set | Pending |
| 4 | Allocation and revocation | Mint 1,000,000 directly into holder and treasury accounts, then revoke | Pending |
| 5 | Fee rate scheduling | Schedule the change to 2 percent, read back the pending activation epoch | Pending |
| 6 | Fee-accruing transfers | `transferChecked` between holders; reconcile withheld amounts against predicted fees | Pending |
| 7 | Harvest and withdraw | Harvest withheld to the mint, withdraw into the treasury | Pending |
| 8 | Holder snapshot | Enumerate token accounts at a point in time, apply exclusions | Pending |
| 9 | Cashback distribution | Grossed-up pro-rata payouts with a pre-flight sufficiency check | Pending |
| 10 | One-command demo | Orchestrate the lifecycle with staged output and a signature per transaction | Pending |
| 11 | README and recorded run | Clean-clone setup plus a recorded devnet run with verifiable signatures | Pending |

Feature 6 is where the fee arithmetic gets its empirical confirmation: predicted
fees are reconciled against the withheld amounts the chain actually reports.

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
- extension: `TransferFeeAmount.withheldAmount` (u64) - fee skimmed on receipt, held until harvested

> Fees accrue on the **recipient's** account, not the sender's. Features 6 and 7
> depend on this.

### In-process contracts (shipped in feature 2)

Locked and consumed by features 8, 9, and 10. Defined in `src/cashback/types.ts`.

- `HolderBalance` - `{ tokenAccount: string, owner: string, balanceRaw: bigint }`
- `DistributionRow` - `{ owner, tokenAccount, balanceRaw, netShareRaw, grossSendRaw, feeRaw }`
- `DistributionPlan` - `{ distributableRaw, rows, dustRaw, totalGrossRaw, executable, reason? }`
- `TransferFeeParams` - `{ basisPoints: number, maximumFee: bigint }`, in `src/lib/fee.ts`

> **Locked shape:** every on-chain amount is `bigint` base units. No `number` and
> no floating point anywhere in the amount path.

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
- A fee change activates **two epochs later**. Only the pending state is demonstrable in one run.
- Fee-extension mints require `transferChecked`. Plain `transfer` fails.
- `@solana/spl-token` defaults to the legacy token program. `TOKEN_2022_PROGRAM_ID` must be passed explicitly on every call.
- **The fee rounds up.** `fee = min(ceil(amount * basisPoints / 10000), maximumFee)`. Settled against the client implementation and locked by a 264-combination parity test in feature 2.

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

> First `npm test` after a clean install takes minutes while `web3.js` is
> transformed. Warm runs are seconds. Belongs in the README at feature 11.

## Open questions

> Resolve these in the plans, then re-run `/overview`.

**Open decisions.**

- **Token name and symbol undecided.** `TOKEN_NAME` and `TOKEN_SYMBOL` are blank in `.env.example`.
- **Devnet epoch duration should be read from the chain** when reporting the pending fee activation in feature 5, not quoted from the nominal 432,000-slot figure.

**Accepted limitation, not a gap.**

- A point-in-time snapshot is gameable: a holder can acquire tokens immediately
  before the snapshot and dispose of them after, collecting a share they did not
  hold through. Closing this needs time-weighting, which is deliberately out of
  scope. Document it in feature 11 rather than fixing it.

**Constraint raised by feature 2, binding on feature 9.**

- **The treasury can never distribute its full balance.** The gross always
  exceeds the net, so `distributable === treasuryBalance` is structurally
  unpayable and `buildDistributionPlan` returns `executable: false`. Feature 9
  must solve for a distributable amount whose gross fits, roughly
  `balance * (10000 - basisPoints) / 10000`. No helper exists yet.

**Settled, no longer open.**

- On-chain fee rounding is ceiling division capped at `maximumFee`, locked by a 264-combination parity test.
- Every target net amount is exactly reachable; the gross-up returns the smallest gross that hits it. Plan and implementation now agree.
- Build-plan item 1 no longer claims amount conversion, which shipped in feature 2 as `src/lib/amount.ts`.
