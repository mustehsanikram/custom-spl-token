# Project Plan

> One of the two planning docs you provide. Use as much detail as the project
> needs, including rationale, constraints, examples, edge cases, and explicit
> exclusions that should guide later feature work. Draft it directly, develop it
> through any AI conversation, or optionally run `/discovery` for a guided deep
> planning session. The content is always yours to direct. When it is filled in,
> run `/overview` to generate the project overview from this plus `build-plan.md`.

## 1. Problem - What problem are we solving?

This is a learning and portfolio project. The objective is to build a complete,
correct, demonstrable Solana Token-2022 token with a transfer fee and holder
cashback, end to end on devnet, and to understand it deeply enough to defend
every design decision.

Creating a mint is a handful of lines. The engineering that matters sits around
it, in arithmetic that fee-and-redistribute tokens routinely get wrong:

- inverse-fee gross-up, so a payout lands on an exact target amount
- pro-rata division in integer base units, and what happens to the remainder
- account exclusions, so a treasury does not pay cashback to itself
- the fact that Token-2022 taxes the cashback payouts themselves, feeding value
  back into the next round

Getting those right, and proving it with tests, is the point of the project.

**Explicitly not the problem being solved:** launching a token, attracting
holders, creating a market, or making money. See section 6.

## 2. Users - Who is this for?

| User | Context | What they need |
|---|---|---|
| The developer | Building it to learn Token-2022 properly | Small reviewable steps, honest tests, decisions written down with rationale |
| A technical reviewer | Reads the repo, may run it once | To clone, run one command, and see the whole lifecycle work against a real network |

The reviewer's workflow drives a hard requirement: **reproducible from a clean
clone**. Install, set one keypair path, run one command. If it needs a verbal
walkthrough to work, it has failed.

## 3. Features - What does the MVP need?

The MVP is one command that performs the full lifecycle on devnet and reports
what happened:

1. Create a Token-2022 mint with the TransferFee extension at 1 percent
2. Mint a fixed 1,000,000 supply directly into holder and treasury accounts
3. Revoke the mint authority so the supply is permanently capped
4. Schedule a change to 2 percent and report its activation epoch
5. Run transfers between holders that accrue withheld fees
6. Harvest withheld fees to the mint and withdraw them to the treasury
7. Take a point-in-time holder snapshot, excluding treasury and authority
8. Distribute cashback pro-rata, grossed up so holders net their exact share
9. Print a legible before and after summary with verifiable signatures

**Non-goals, deliberately excluded:**

- Custom Anchor or Rust on-chain program (cashback stays off-chain)
- Web dashboard or any GUI
- Time-weighted balance distribution
- Mainnet deployment, liquidity pools, DEX listing, market making
- Token metadata and branding beyond a name and symbol
- Regulatory, tax, or compliance treatment
- Multi-round scheduling, cron, or a long-running service

## 4. Data - What are we storing?

There is no database and no persisted application state. This is deliberate: the
demo creates a fresh mint every run, so nothing carries between runs.

**On-chain (the real store):**

| Where | Holds |
|---|---|
| Mint account | Supply, decimals, mint authority (revoked), TransferFeeConfig |
| TransferFeeConfig | Older fee and newer fee, each with an activation epoch; config and withdraw authorities; withheld total |
| Holder token accounts | Balance, plus a per-account withheld-fee amount that accrues on receipt |
| Treasury token account | Harvested fees available to distribute |

**In-process only (never written to disk):**

- The resolved config from environment variables
- The holder snapshot: a list of address and balance pairs at one instant
- The computed distribution: per-holder net share, grossed-up send amount, and
  the leftover dust

**On disk:**

- `.env`, gitignored, holding network and token parameters
- A keypair JSON at a gitignored path, never committed

## 5. Tech - What stack are we using?

| Concern | Choice |
|---|---|
| Language | TypeScript, ESM, strict |
| Runtime | Node 20+, developed on 22 |
| Chain client | `@solana/web3.js` 1.x |
| Token client | `@solana/spl-token` 0.4.x, Token-2022 |
| Tests | Vitest |
| Package manager | npm |
| Network | Devnet only |

**Constraints confirmed against the installed library and program behavior:**

- The transfer-fee extension has **no exemption or whitelist**. Every transfer of
  this mint is taxed, including cashback payouts. Verified: the only instructions
  are initialize, set, harvest, and the two withdraw variants.
- `mintTo` is **not** a transfer and is untaxed. This is why allocation happens by
  direct mint rather than by transferring from a treasury.
- A fee rate change activates **two epochs later**. An epoch is 432,000 slots, so
  this is days. The change is readable immediately as pending, which is what the
  demo shows.
- Mints with the fee extension require `transferChecked`. Plain `transfer` fails.
- `@solana/spl-token` defaults to the legacy token program. The Token-2022
  program id must be passed explicitly on every call.
- All amounts are `bigint` base units. At 9 decimals, 1,000,000 tokens is
  10^15 base units, well inside u64.

**Not installed and not required:** the Solana CLI. Everything runs through
`@solana/web3.js`. It would only be needed for a localnet path, which is out of
scope.

## 6. Monetize - How will this make money?

It does not, and it is not intended to. This is a learning artifact.

The 1 to 2 percent transfer fee is a **mechanism being demonstrated**, not a
revenue model. Fees collected on devnet have no value. No token is sold, no
liquidity is provided, and no third party is invited to acquire anything.

This section is retained rather than deleted so the intent stays explicit: if
this design were ever pointed at mainnet with real participants, monetization,
disclosure, and regulatory treatment would all become real questions that this
plan does not answer.

## 7. UI/UX - How should this look and feel?

No graphical interface. The interface is the terminal output of a single
command, and its quality is a real deliverable rather than an afterthought,
because it is what a reviewer actually experiences.

Principles:

- Announce each stage before it runs, so a slow network read is never a silent hang
- Print balances and fee state before and after each stage, so effects are visible
- Show the arithmetic where it matters: computed share, gross-up amount, fee, net received
- Emit a signature for every transaction so any claim can be independently verified
- Fail loudly, with the failing stage named and the signature printed when one exists
- End with a summary table: per-holder starting balance, fees generated, cashback
  received, ending balance

Accessibility: plain text, no reliance on color alone to convey meaning, no
box-drawing that breaks in a narrow terminal.

## 8. Deployment - Where and how will this ship?

Devnet only, run from a developer machine. There is no hosting, no service, and
no scheduled job.

- Config comes from `.env`; nothing network-specific is hardcoded
- The authority keypair is funded by devnet airdrop; holders are funded by SOL
  transfer from the authority, avoiding airdrop rate limits on repeat runs
- Mainnet is out of scope. If it were ever added, it would require an explicit
  confirmation flag, and that gate is a stated requirement in the coding
  standards rather than something to be decided later

CI is not set up. `/ci` can add a Verify command and GitHub checks later; it is
not required for this project to be complete.

## 9. Business rules

These are the rules the implementation must honor. They are the substance of the
project and the main target of the test suite.

**Supply**

- Exactly 1,000,000 tokens, 9 decimals, minted once
- The mint authority is revoked after allocation, permanently. Supply can never grow.

**Fee**

- Set at creation to 1 percent, expressed as 100 basis points
- The configured rate is validated to stay within 0 to 200 basis points. Config
  outside that band throws at startup, before any transaction is built.
- The fee-config authority is retained so the rate remains adjustable
- The maximum-fee cap is set high enough that the basis-point rate always governs.
  The cap logic is still implemented and tested, because a bound cap changes the
  gross-up math.

**Snapshot**

- Balances are read at a single point in time
- The treasury and the mint authority are excluded. Including them would have the
  treasury pay cashback to itself.
- Zero-balance accounts are excluded and receive nothing
- Known limitation, accepted and documented: a point-in-time snapshot is gameable.
  A holder could acquire tokens immediately before the snapshot and dispose of
  them after, collecting a share they did not hold through. Closing this requires
  time-weighting, which is out of scope.

**Distribution**

- Each eligible holder's share is proportional to their snapshot balance as a
  fraction of the total eligible balance
- Shares are computed in integer base units. The division has a remainder.
- The remainder, or dust, stays in the treasury and rolls into the next round. It
  is never assigned to an arbitrary holder.
- Each payout is grossed up: the send amount is computed so that after the
  transfer fee is deducted, the holder receives exactly their computed share
- The gross-up must be verified, not assumed. The on-chain fee rounds up:
  `fee = min(ceil(amount * basisPoints / 10000), maximumFee)`.
- Every target net amount is exactly reachable. Because the rate stays far below
  10000 basis points, the net rises in steps of 0 or 1 as the gross grows, so it
  never skips a value. The hazard is the opposite: several gross amounts can
  reach the same net (at 1 percent, both 100 and 101 net 99). The rule is to send
  the smallest gross that hits the target exactly, so the treasury never
  overspends.
- The total grossed-up outflow must not exceed the treasury balance. If it would,
  the round is aborted before any transfer is sent, rather than partially paying
  some holders.

## 10. Testing strategy

Tests are a gate. Any step that adds logic ships a passing test.

**Pure unit tests, no network.** These carry most of the value:

| Area | Cases |
|---|---|
| Config | Fee outside 0 to 200 bps throws; defaults resolve; missing required vars throw |
| Fee calculation | Rate applied correctly; rounding direction; cap binding vs not binding; zero amount |
| Gross-up | Round trips to the exact target net; behavior when the cap binds; behavior when no exact solution exists; never lands below target |
| Pro-rata | Shares sum to the distributable total minus dust; dust is non-negative and smaller than the holder count; uneven allocations divide correctly |
| Exclusions | Treasury, authority, and zero-balance accounts removed; totals recomputed over the remaining set |
| Amount conversion | Whole tokens to base units and back at 9 decimals; no float arithmetic anywhere in the path |

**Network-dependent behavior** is proven by a devnet run producing real
signatures, not by mocking the RPC layer. A recorded run in the README is the
evidence.

**An empty suite must fail, not pass.**

## 11. Risks, assumptions, and open TODOs

**Risks**

| Risk | Handling |
|---|---|
| Devnet RPC flakiness or rate limits | Explicit commitment levels, clear failure messages naming the stage, signature printed on failure |
| Devnet airdrop limits break repeat runs | Airdrop only to the authority; fund holders by transfer |
| Gross-up rounding assumption is wrong | Treated as unverified. Confirmed against actual on-chain behavior during implementation, not assumed from the client library. |
| Demo grows into a slow monolith | Each stage stays independently runnable; the orchestrator only sequences them |

**Assumptions carried into the build**

- 4 test holders with uneven allocations, so pro-rata division is visibly non-trivial
- One harvest and distribute round per demo run
- 9 decimals
- Fresh mint per run; no state persisted between runs

**Open TODOs**

- Confirm the exact on-chain fee rounding direction, and whether the withheld
  amount ever differs from the naive basis-point calculation
- Decide the token name and symbol
- Confirm devnet epoch duration empirically when reporting the pending fee
  activation, rather than quoting a nominal figure
