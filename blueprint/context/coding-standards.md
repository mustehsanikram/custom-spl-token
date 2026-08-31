# Coding Standards

Stack: TypeScript (ESM) / Node 20+ / `@solana/web3.js` / `@solana/spl-token` (Token-2022) / Vitest.

Package manager: **npm** (`package-lock.json` is committed).

## TypeScript

- ESM only. `"type": "module"`; relative imports carry the `.js` extension.
- `strict` is on, plus `noUncheckedIndexedAccess` and `verbatimModuleSyntax`.
- No `any`. Use `unknown` at boundaries and narrow. No non-null `!` without a comment saying why.
- Prefer `type` for shapes and unions; `interface` for object contracts that get implemented.
- Use `import type { ... }` for type-only imports (required by `verbatimModuleSyntax`).

## Solana

- **Never hardcode a keypair, secret key, seed phrase, or private RPC key in source.** Keypairs load from a path given by env; that path is gitignored.
- All amounts on-chain are `bigint` in base units. Convert at the edges only, with an explicit helper. Never use `number` for a token amount in a transaction.
- Always use the **Token-2022** program id (`TOKEN_2022_PROGRAM_ID`). This token cannot use the legacy SPL Token program; the fee extension does not exist there.
- Pass `programId` explicitly to every `@solana/spl-token` call. The library defaults to the legacy program and will silently target the wrong one.
- Transfers must use `transferChecked` (or `transferCheckedWithFee`). Plain `transfer` is rejected for mints with the transfer-fee extension.
- Fees are configured in **basis points**: 100 = 1%, 200 = 2%. The 2% ceiling is enforced in `loadConfig`; keep that guard.
- A transfer-fee change takes effect **two epochs** after it is set. Never document or assume it is immediate.
- Confirm with an explicit commitment (`"confirmed"` for flow control, `"finalized"` before treating a mint or supply change as done).
- Any script that moves real value must print what it is about to do and require an explicit confirmation flag before running against `mainnet-beta`.

## Project structure

```
src/config.ts        Env parsing and validation. The only place process.env is read.
src/index.ts         Entry point.
src/token/           Mint creation, supply, fee configuration.
src/fees/            Harvest and withdraw withheld fees.
src/cashback/        Holder snapshot and distribution.
src/lib/             Shared helpers (connection, keypair loading, amount conversion).
tests/               Vitest specs, mirroring the src path.
```

## Naming

- Files: `kebab-case.ts`. Types and classes: `PascalCase`. Functions and variables: `camelCase`.
- Constants: `SCREAMING_SNAKE_CASE` only for true module-level literals.
- Suffix base-unit amounts explicitly: `amountRaw` (bigint, base units) vs `amountTokens` (human-readable).
- No abbreviations that are not already Solana idiom (`ata`, `bps`, `lamports` are fine).

## Configuration and secrets

- Every env var is read in `src/config.ts`, validated, and returned typed. No `process.env` elsewhere.
- Every new env var is added to `.env.example` with a comment, and never with a real value.
- Fail fast and loud on missing or malformed config. A bad fee rate must throw at startup, not mid-transaction.

## Error handling

- Let errors propagate to the script entry point; catch once there and set `process.exitCode = 1`.
- Never swallow an RPC error. Solana RPC failures are frequently transient and must be visible, retried deliberately, or both.
- On a failed transaction, log the signature so it can be inspected on an explorer.

## Testing

`npm test` runs Vitest once. **Tests are a gate** - any step adding logic must ship a passing test before the step is approved.

- Unit tests: config parsing and validation, fee and pro-rata math, amount conversion, snapshot aggregation. These must be pure and must not hit the network.
- Fee and cashback arithmetic is the highest-value target. Cover rounding, dust, zero-balance holders, and the fee cap.
- Network-dependent scripts are proven on **devnet** with a recorded signature, not by mocking the whole RPC.
- An empty suite must fail, not pass.

## Verification

No browser UI. Verify with:

- `npm run typecheck` and `npm test`
- devnet transaction signatures, inspectable on an explorer
- on-chain state reads (mint supply, fee config, withheld amounts) printed before and after

## Comments

Write code that explains itself; comment only what the code cannot say.
Over-commenting is a common AI tell, so resist it.

- Comment the **why**, not the **what**. Delete any comment that restates the code.
- No banner/header blocks, section dividers, or step-by-step narration of obvious
  code. A file does not need a comment announcing each region.
- A comment earns its place only when it captures something the code can't: a
  non-obvious decision, a gotcha or workaround, why a value is what it is, or a
  link to a spec or issue.
- Prefer self-documenting names and small functions over explanatory comments.
- Keep doc comments minimal: a one-line purpose on an exported type or function is
  plenty; don't write JSDoc that just repeats the signature.
- When in doubt, leave the comment out.

## Writing

- No em dashes (U+2014) in generated content: docs, comments, commit messages,
  READMEs, specs. They read as AI-generated.
- Use a hyphen for `term - description` separators; rephrase prose with commas,
  parentheses, or a colon. Avoid en dashes and the ellipsis character too.
