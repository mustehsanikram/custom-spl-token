# Feature: Fee and distribution math

**From build-plan:** feature 2
**Status:** verified

## Goal

Build the pure arithmetic core of the token: transfer fee calculation, its
inverse (gross-up), pro-rata cashback shares, dust handling, and holder
exclusions. No network, no I/O, no RPC.

This is where the project earns its keep. Everything else is plumbing around
these functions, and features 6, 8, 9, and 10 all assert against them. Because
it is pure, it can be built and fully tested before devnet is involved at all.

## In scope

- Decimal-string to base-unit conversion and back, with no floating point
- Transfer fee calculation that mirrors the on-chain rule exactly
- Gross-up: given a target net amount, find the amount to send
- Holder eligibility filtering (treasury, mint authority, zero balances)
- Pro-rata share computation with an exact dust remainder
- Distribution plan assembly with a treasury sufficiency check
- Unit tests for every one of the above

**Note on overlap with feature 1.** Base-unit amount conversion is listed under
build-plan item 1, but it is pure math with no network dependency and every
function here needs it. It is built in step 1 below. When feature 1 is spec'd it
should cover only the connection factory, keypair loading, and devnet funding.
Flagged for the user rather than silently rewriting the build plan.

## Out of scope

- Anything touching the network: `Connection`, RPC calls, transaction building
- Keypair loading and devnet SOL funding (feature 1)
- Creating a mint or reading on-chain state (features 3 to 8)
- Sending the payouts the plan describes (feature 9)
- The demo orchestrator (feature 10)

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Amount conversion** - `src/lib/amount.ts`. Parse a decimal
  string to base units at a given decimals, and format base units back to a
  decimal string. Reject negatives, empty input, more fractional digits than
  `decimals`, and anything non-numeric. *Done when:* `"1000000"` at 9 decimals
  gives `10n ** 15n`, round-tripping any value returns the original string, over
  precise input throws rather than silently truncating, and no `Number` or float
  appears anywhere in the conversion path.

- [x] **Step 2 - Transfer fee calculation** - `src/lib/fee.ts`. Implement
  `calculateTransferFee(params, amountRaw)` mirroring the on-chain rule:
  `fee = min(ceil(amountRaw * basisPoints / 10000), maximumFee)`, returning `0n`
  when `basisPoints` is 0 or the amount is 0. *Done when:* tests cover zero
  basis points, zero amount, exact division, inexact division rounding up, the
  cap binding, and the cap not binding; **and** a parity test asserts the result
  equals `calculateFee` from `@solana/spl-token` across a table of inputs.

- [x] **Step 3 - Gross-up (inverse fee)** - `src/lib/fee.ts`. Implement
  `grossUpForNet(params, netTargetRaw)` returning `{ grossRaw, feeRaw }`, the
  **smallest** gross amount whose post-fee remainder equals the target exactly.
  Start from the closed-form estimate, then correct and verify against
  `calculateTransferFee`. *Done when:* a round-trip property test over basis
  points 1 to 200 and a wide range of targets asserts
  `grossRaw - calculateTransferFee(params, grossRaw) === netTargetRaw` every
  time, no smaller gross satisfies it, and the cap-binding regime is covered.

- [x] **Step 4 - Holder eligibility** - `src/cashback/eligibility.ts`. Implement
  `selectEligible(holders, exclusions)` removing excluded owners (treasury, mint
  authority) and zero-balance accounts, returning the remaining entries and
  their recomputed total. *Done when:* tests cover excluded owners removed,
  zero balances removed, the total recomputed over only the survivors, and the
  everything-excluded case returning an empty set with a `0n` total rather than
  throwing.

- [x] **Step 5 - Pro-rata shares** - `src/cashback/prorata.ts`. Implement
  `computeShares(entries, totalEligibleRaw, distributableRaw)` returning a net
  share per holder plus the dust remainder, all in base units by integer
  division. *Done when:* shares plus dust equal `distributableRaw` exactly for
  every case tested, dust is non-negative and strictly less than the holder
  count, uneven allocations divide correctly, and the single-holder and
  zero-distributable cases behave.

- [x] **Step 6 - Distribution plan** - `src/cashback/plan.ts`. Implement
  `buildDistributionPlan(...)` composing steps 3 to 5 into the `DistributionPlan`
  contract below, summing `totalGrossRaw` and comparing it against the treasury
  balance. *Done when:* plan totals reconcile (`rows` net shares plus dust equal
  `distributableRaw`), a plan whose gross exceeds the treasury is returned as
  not executable with a reason rather than throwing or silently dropping rows,
  and no row is ever produced with a gross below its net.

## Files / areas

| File | Purpose |
|---|---|
| `src/lib/amount.ts` | Decimal string to base units and back (new) |
| `src/lib/fee.ts` | Fee calculation and gross-up (new) |
| `src/cashback/types.ts` | Shared contracts below (new) |
| `src/cashback/eligibility.ts` | Exclusion filtering (new) |
| `src/cashback/prorata.ts` | Share and dust computation (new) |
| `src/cashback/plan.ts` | Plan assembly and sufficiency check (new) |
| `tests/*.test.ts` | One spec file per module above (new) |

Nothing existing is modified. `src/config.ts` already validates the basis-point
band and is not touched here.

## Data / contracts

**Load-bearing.** Features 8, 9, and 10 consume these directly. Lock them now.

```ts
export interface TransferFeeParams {
  readonly basisPoints: number;  // 0 to 200, enforced by config.ts
  readonly maximumFee: bigint;   // base units
}

export interface HolderBalance {
  readonly tokenAccount: string; // base58
  readonly owner: string;        // base58
  readonly balanceRaw: bigint;
}

export interface DistributionRow {
  readonly owner: string;
  readonly tokenAccount: string;
  readonly balanceRaw: bigint;   // snapshot balance
  readonly netShareRaw: bigint;  // what the holder must receive
  readonly grossSendRaw: bigint; // what we send so they net the above
  readonly feeRaw: bigint;       // grossSendRaw - netShareRaw
}

export interface DistributionPlan {
  readonly distributableRaw: bigint;
  readonly rows: readonly DistributionRow[];
  readonly dustRaw: bigint;      // retained in treasury, rolls forward
  readonly totalGrossRaw: bigint;
  readonly executable: boolean;  // false when totalGrossRaw exceeds treasury
  readonly reason?: string;
}
```

**Invariants the tests must enforce:**

- Every amount is `bigint` base units. No `number`, no float, anywhere.
- `sum(rows.netShareRaw) + dustRaw === distributableRaw`
- `0n <= dustRaw < BigInt(rows.length)` when `rows.length > 0`
- For every row: `grossSendRaw - feeRaw === netShareRaw` and `grossSendRaw >= netShareRaw`

## Testing

`npm test` (Vitest) is the gate. Every step here is pure logic, so every step
ships tests; there is no UI or integration evidence to fall back on.

Modules requiring tests: `amount.ts`, `fee.ts`, `eligibility.ts`, `prorata.ts`,
`plan.ts`. That is all of them.

Highest-value cases, from the project plan's business rules:

| Area | Must cover |
|---|---|
| Conversion | 9 decimals, round trip, over-precise input rejected, negatives rejected |
| Fee | Zero bps, zero amount, exact and inexact division, cap binding and not, parity with the library |
| Gross-up | Exact round trip across bps 1 to 200, minimality, cap-binding regime |
| Eligibility | Excluded owners, zero balances, total recomputed, all-excluded |
| Pro-rata | Sum plus dust exact, dust bound, uneven splits, single holder, zero distributable |
| Plan | Totals reconcile, insufficient treasury reported not thrown, no row gross below net |

## Notes for the AI

- **No network in this feature.** If a step seems to need a `Connection`, the
  step is wrong. Balances arrive as plain `HolderBalance` values.
- **The on-chain fee rule is settled, not guessed.** `@solana/spl-token@0.4.15`
  `calculateFee` uses `(amount * bps + 9999n) / 10000n`, which is ceiling
  division, then caps at `maximumFee`. Mirror it exactly.
- **Reimplement rather than only re-export**, and assert parity in tests. The
  point of the project is understanding the rule, and the parity test doubles as
  a regression guard if the library formula ever changes.
- **Gross-up minimality matters.** Several gross amounts can yield the same net
  because ceiling division makes the net a step function. Return the smallest,
  so the treasury pays no more than necessary.
- ESM: relative imports carry the `.js` extension. Use `import type` for
  type-only imports, required by `verbatimModuleSyntax`.
- `noUncheckedIndexedAccess` is on: indexing an array yields `T | undefined`.
- Follow `blueprint/context/coding-standards.md` for structure and naming.
  `amountRaw` means base units; `amountTokens` means human-readable.
