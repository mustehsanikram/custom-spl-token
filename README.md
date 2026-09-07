# Custom Solana SPL Token

A Solana token built on **Token-2022** with a 1 to 2 percent transfer fee and
pro-rata cashback for holders, capped at a fixed supply of **1,000,000**.

The fee uses the native Token-2022 `TransferFee` extension rather than custom
on-chain code. Cashback is an off-chain TypeScript distributor that harvests
withheld fees and pays holders on a snapshot schedule. There is no custom Anchor
program.

This is a **learning and portfolio project**. It targets devnet only, and
nothing here is intended for mainnet, trading, or real value.

## Status

Partially built. Two of eleven planned features are complete.

| Area | State |
|---|---|
| Fee, gross-up, pro-rata, dust, exclusions | Built, 130 tests passing |
| RPC connection, keypair loading and generation, devnet funding | Built |
| Mint sizing and creation instructions | Built |
| Creating an actual mint | **Not done.** No mint has ever been created. |
| Allocation, fee scheduling, transfers, harvesting, distribution | **Not built** |
| One-command demo | **Not built** |

The on-chain work is blocked on devnet SOL: the authority holds nothing, and the
devnet airdrop faucet has returned HTTP 429 on every attempt. Everything that
does not need the network is finished and tested.

`blueprint/build-plan.md` tracks the full roadmap.

## Requirements

- **Node 20 or newer** (developed on 22)
- Devnet SOL to run anything on-chain (free, see Setup)

The **Solana CLI is not required**. Every operation goes through
`@solana/web3.js`.

## Setup

```bash
npm install
npm run keygen
cp .env.example .env
```

`npm run keygen` writes a new keypair to `./keypairs/authority.json` and prints
its public key. It refuses to overwrite an existing file. `keypairs/` and `.env`
are gitignored; keep them that way, and never commit either.

The defaults in `.env` work as-is for devnet, and `AUTHORITY_KEYPAIR_PATH`
already points at the path `npm run keygen` writes to, so no edit is needed
unless you passed a custom path or want to change the token parameters.

| Variable | Default | Meaning |
|---|---|---|
| `SOLANA_NETWORK` | `devnet` | `devnet`, `testnet`, `mainnet-beta`, or `localnet` |
| `SOLANA_RPC_URL` | empty | Custom RPC; blank uses the public endpoint for the network |
| `AUTHORITY_KEYPAIR_PATH` | `./keypairs/authority.json` | Keypair that pays fees and holds authority |
| `TOKEN_NAME` | empty | Not yet used on chain |
| `TOKEN_SYMBOL` | empty | Not yet used on chain |
| `TOKEN_DECIMALS` | `9` | Validated 0 to 9 |
| `TOKEN_TOTAL_SUPPLY` | `1000000` | Whole tokens |
| `TRANSFER_FEE_BASIS_POINTS` | `100` | 100 = 1 percent; validated 0 to 200 |
| `TRANSFER_FEE_MAX_TOKENS` | `1000000` | Per-transfer fee cap, in whole tokens |
| `TREASURY_ADDRESS` | empty | Not yet used |

Finally, fund the authority with devnet SOL at
[faucet.solana.com](https://faucet.solana.com), pasting the public key that
`npm run keygen` printed. Creating a mint costs about **0.0026 SOL**, so any
faucet amount is plenty.

Check it worked:

```bash
npm run dev
```

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Prints live network, RPC, `solana-core` version, authority address, and SOL balance |
| `npm run keygen` | Creates a keypair; optionally `npm run keygen -- ./path/to/key.json` |
| `npm run build` | Compiles to `dist/` |
| `npm run typecheck` | Type check without emitting |
| `npm test` | Runs the Vitest suite once |
| `npm run test:watch` | Runs Vitest in watch mode |

One thing that looks like a problem and is not:

- `bigint: Failed to load bindings, pure JS will be used` on stderr is an absent
  optional native accelerator. The pure-JS fallback is correct, and every test
  passes with it.

The suite takes roughly 10 to 30 seconds. Most of that is transforming
`@solana/web3.js`, not running the tests, which take well under a second.

## Project structure

```
src/config.ts          Env parsing and validation. The only place process.env is read.
src/index.ts           Entry point; reports live devnet state.
src/lib/amount.ts      Decimal strings to base units and back. No floating point.
src/lib/fee.ts         Transfer fee and its inverse (gross-up).
src/lib/connection.ts  RPC connection factory and reachability check.
src/lib/keypair.ts     Keypair loading, validation, and generation.
src/lib/funding.ts     Devnet airdrop and SOL transfer.
src/token/mint.ts      Mint sizing and creation instructions.
src/cashback/          Eligibility, pro-rata shares, and distribution planning.
src/scripts/keygen.ts  The keygen command.
tests/                 Vitest specs, mirroring the src layout.
```

Every on-chain amount is a `bigint` in base units. No `number` and no floating
point appears anywhere in the amount path.

## Design decisions

Five things about Token-2022 that are not obvious, and that shape most of this
code. Each one below says how you can check it yourself.

### The transfer fee has no exemption list

Every transfer of this mint is taxed. There is no privileged account, so **the
cashback payouts are themselves taxed**, and value skimmed from a payout returns
to the fee pool to fund the next round. The whole transfer-fee extension exposes
only five instructions: initialize, set, harvest, and two withdraw variants.
None of them exempt anybody.

The consequence is `grossUpForNet`: to pay a holder their exact share, more than
that share has to leave the treasury.

```bash
npx vitest run -t "grosses up every payout so holders net their share"
```

### The fee rounds up

`fee = min(ceil(amount * basisPoints / 10000), maximumFee)`. Ceiling division,
never toward the holder. At 1 percent a 1-unit transfer owes 0.01 and is charged
a whole unit, which is a 100 percent fee on dust. That is the protocol's
behavior, not a bug here.

`src/lib/fee.ts` mirrors the rule, and a 264-combination sweep asserts parity
with the library's own `calculateFee` so the two cannot drift.

```bash
npx vitest run -t "rounds the fee up, never down"
npx vitest run -t "matches the library across"
```

### Gross-up returns the smallest exact amount

Because the fee rounds up, the net is a step function, so several gross amounts
land on the same net. At 1 percent, sending **100** and sending **101** both
leave the holder with 99. Paying 101 would burn a base unit of treasury per
holder per round for nothing.

`grossUpForNet` binary-searches for the first amount reaching the target, which
is minimal by construction in both the capped and uncapped regimes.

```bash
npx vitest run -t "picks the smaller of two amounts that reach the same net"
```

### The treasury can never distribute its whole balance

The gross always exceeds the net, so asking to distribute exactly what the
treasury holds is structurally unpayable. `buildDistributionPlan` returns
`executable: false` rather than paying some holders and stranding the rest.

```bash
npx vitest run -t "can never distribute the entire treasury balance"
```

### Not yet demonstrated here

Two behaviors shape the design but have no test in this repo, because the code
that would exercise them is not built. Recorded so they are not mistaken for
verified:

- **`mintTo` is not a transfer, so it is untaxed.** This is why the plan
  allocates supply by minting directly into holder accounts rather than
  transferring from a treasury: transferring would tax the initial allocation
  and leave untidy balances. Relevant to feature 4.
- **A fee rate change activates two epochs later.** The extension stores an
  older and a newer fee, each with an activation epoch, so a scheduled change is
  readable immediately but does not take effect for days. `MintFeeState` in
  `src/token/types.ts` carries both epochs for this reason. Relevant to feature 5.

## Testing

```bash
npm test
```

130 tests, none of which touch the network. The suite covers fee arithmetic,
gross-up, pro-rata division, dust, exclusions, keypair parsing, and config
validation.

## License

MIT. See [LICENSE](LICENSE).
