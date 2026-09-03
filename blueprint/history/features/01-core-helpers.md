# Feature: Core helpers

**From build-plan:** feature 1
**Status:** partially verified - step 4 devnet evidence deferred

## Goal

The first code that talks to a real network: an RPC connection, an authority
keypair loaded from disk, and devnet SOL funding.

Feature 2 built the arithmetic with no network at all. This is the other half of
the foundation, and everything from feature 3 onward needs all three pieces
before it can create a mint or send anything.

## In scope

- Connection factory driven by the resolved config, with an explicit commitment
- Reachability check that fails with a clear message instead of hanging
- Keypair loading from a gitignored path, with strict validation
- Keypair generation, so a clean clone can produce one at all
- Devnet SOL funding: airdrop to the authority, transfer from the authority to others
- Entry point wired to report real devnet state
- Unit tests for everything testable without a network

**Scope call: keypair generation is included, though the build-plan line says
only "loading."** The Solana CLI is not installed and is out of scope, no
keypair exists in the repo, and `.env` does not exist yet. Without generation
there is nothing for the loader to load and no way to produce one, so features
3 and up could never run. The overview also makes clean-clone reproducibility a
hard requirement. Flagged rather than assumed; say so if you would rather keep
feature 1 to loading only and defer generation.

## Out of scope

- Creating holder keypairs or allocating tokens (feature 4)
- Anything Token-2022: mints, extensions, transfers (features 3 and up)
- The demo orchestrator (feature 10)
- Mainnet support, localnet, or `solana-test-validator`
- Retry or backoff policy beyond the bounded airdrop retry below

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Connection factory** - `src/lib/connection.ts`. `createConnection(config)`
  returning a `Connection` at an explicit commitment, plus `assertReachable(connection)`
  that calls `getVersion` and, on failure, throws naming the RPC URL rather than
  surfacing a raw fetch error. *Done when:* a devnet run prints the `solana-core`
  version, and pointing `SOLANA_RPC_URL` at an unreachable host produces a message
  naming that URL, not a stack trace.

- [x] **Step 2 - Keypair loading** - `src/lib/keypair.ts`. `loadKeypair(path)` reading
  the standard 64-number JSON array format, validating length, integer range, and
  that the secret key derives a usable public key. Missing file names the path and
  points at the keygen command. *Done when:* a valid fixture loads and its public
  key matches the expected value; missing file, non-JSON, wrong-length array, and
  out-of-range byte each throw a distinct message. Tested with fixtures, no network.

- [x] **Step 3 - Keypair generation** - `src/scripts/keygen.ts` plus an `npm run keygen`
  script and the matching `AGENTS.md` command entry. Creates the parent directory,
  writes a new keypair in the same JSON array format, prints the public key and the
  path, and **refuses to overwrite an existing file**. *Done when:* running it in a
  temp directory creates a loadable keypair, running it twice fails on the second
  attempt without touching the file, and the written file round-trips through
  `loadKeypair`. Tested against a temp directory, no network.

- [ ] **Step 4 - Devnet funding** - `src/lib/funding.ts`. `ensureFunded(connection,
  publicKey, minimumLamports)` requesting an airdrop only when the balance is below
  the minimum, with a small bounded retry, and `fundFromAuthority(connection,
  authority, recipient, lamports)` transferring SOL and returning the signature. A
  balance too low to cover the transfers fails before sending any of them. *Done
  when:* a devnet run raises the authority balance and prints a signature; the
  insufficient-balance path is unit tested against injected balances; a rate-limited
  or failing airdrop reports the faucet fallback rather than an opaque RPC error.

- [x] **Step 5 - Wire the entry point** - `src/index.ts`. Replace the inline
  `Connection` with the factory, load the authority keypair, assert reachability,
  ensure it is funded, and report network, RPC, `solana-core`, authority public key,
  and SOL balance. *Done when:* `npm run dev` against devnet prints all six values
  with a real balance, and running it with no `.env` still fails fast naming the
  missing variable.

## Files / areas

| File | Purpose |
|---|---|
| `src/lib/connection.ts` | Connection factory and reachability check (new) |
| `src/lib/keypair.ts` | Keypair loading and validation (new) |
| `src/lib/funding.ts` | Airdrop and SOL transfer (new) |
| `src/scripts/keygen.ts` | Keypair generation entry point (new) |
| `src/index.ts` | Wired to the helpers (modified) |
| `package.json` | Adds the `keygen` script (modified) |
| `AGENTS.md` | Documents the `keygen` command (modified) |
| `tests/lib/keypair.test.ts`, `tests/lib/funding.test.ts`, `tests/scripts/keygen.test.ts` | New |

`src/config.ts` already resolves the RPC URL and keypair path and is not changed.

## Data / contracts

**Load-bearing.** Features 3 through 10 obtain their connection and signer through
these two functions; feature 4 uses the funding pair.

```ts
// src/lib/connection.ts
export function createConnection(config: AppConfig): Connection;
export function assertReachable(connection: Connection): Promise<string>; // solana-core version

// src/lib/keypair.ts
export function loadKeypair(path: string): Keypair;
export function generateKeypairFile(path: string): { publicKey: string };

// src/lib/funding.ts
export interface FundingResult {
  readonly signature: string | null;   // null when no airdrop was needed
  readonly balanceLamports: bigint;
}
export function ensureFunded(
  connection: Connection,
  publicKey: PublicKey,
  minimumLamports: bigint,
): Promise<FundingResult>;
export function fundFromAuthority(
  connection: Connection,
  authority: Keypair,
  recipient: PublicKey,
  lamports: bigint,
): Promise<string>;
```

**Conventions:**

- Lamport amounts are `bigint`, consistent with the token amount rule from feature 2.
  Convert at the `web3.js` boundary only, where the library requires `number`.
- On-chain reads use `"confirmed"`; treat a keypair or funding change as done only
  after the confirmation the call requests.

## Testing

`npm test` (Vitest) is the gate. This feature is part pure and part network, so
coverage splits:

| Testable without a network | Proven by a devnet run |
|---|---|
| Keypair parsing and every rejection case | Airdrop actually raising a balance |
| Keygen creating, refusing overwrite, round-tripping | Transfer landing, with a signature |
| Insufficient-balance guard, against injected balances | Reachability against the real RPC |
| Lamport and SOL conversion | |

Network behavior is proven by a real devnet run with a printed signature, not by
mocking the RPC layer. Record the signature in the step evidence.

**A step that adds logic ships its test in the same diff.** Steps 2, 3, and the
guard in 4 all carry unit tests. Step 1 and step 5 are integration surface and
ride on the devnet run plus build output.

## Notes for the AI

- **Devnet airdrops are rate-limited and fail often.** Bound the retry (2 or 3
  attempts, short fixed delay), then fail with the public faucet as the suggested
  fallback. Do not loop indefinitely and do not swallow the error.
- **Fund holders by transfer from the authority, not by airdropping each.** This is
  a stated constraint in the overview: per-account airdrops hit rate limits on
  repeat runs. Only the authority is ever airdropped.
- **Never log a secret key, and never write one outside the gitignored path.**
  `keypairs/` and `*-keypair.json` are already ignored; verify before writing.
- File permissions: `chmod` is not meaningful on this Windows host, so rely on the
  gitignore boundary and say so in the keygen output rather than pretending to
  restrict the file.
- Keypair files use the Solana convention: a JSON array of 64 integers, 0 to 255.
  Accept exactly that so a CLI-produced key would also work.
- ESM: relative imports carry the `.js` extension; `import type` for type-only imports.
- `noUncheckedIndexedAccess` is on: indexing an array yields `T | undefined`.
- Follow `blueprint/context/coding-standards.md`. Async all the way down for I/O.

## Deferred evidence

**Step 4 was not checked off.** Its code is written and unit tested, but one of
its done-when criteria could not be run:

| Criterion | Status |
|---|---|
| Insufficient-balance guard, unit tested against injected balances | Met, 4 tests |
| Rate-limited airdrop reports the faucet fallback, not an opaque RPC error | Met, proven live against devnet |
| A devnet run raises the authority balance and prints a signature | **Not run** |

The devnet airdrop faucet returned HTTP 429 across every attempt ("reached your
airdrop limit today or the airdrop faucet has run dry"), and no SOL reached the
authority `4TtRUyS12Kho6mZaXZKWjtEoFhCBY6DNEnBVjWQ13LaK`, which still shows a
zero balance and no transaction history.

The failure path was proven live and behaved as specified: bounded retry, no
infinite loop, account and target named, underlying error surfaced, public
faucet suggested.

**To close this gap:** fund the authority with devnet SOL, then run an airdrop
or transfer through `ensureFunded` and `fundFromAuthority` and record the
signature. Feature 3 cannot create a mint without funded SOL either, so this
resolves there at the latest.
