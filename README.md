# Custom Solana SPL Token

A Solana token built on the **Token-2022** program with a 1-2% transfer fee and
pro-rata cashback for holders, capped at a fixed total supply of **1,000,000**.

The fee uses the native Token-2022 `TransferFee` extension rather than custom
on-chain code. Cashback is an off-chain TypeScript distributor that harvests
withheld fees and pays holders on a snapshot schedule. No custom Anchor program
in this phase.

## Requirements

- Node 20 or newer (developed on 22)
- A funded keypair for the target network (devnet SOL is free)
- The Solana CLI is optional and not currently installed; everything runs through `@solana/web3.js`

## Setup

```bash
npm install
cp .env.example .env
```

Fill in `.env`. Do not commit it. `AUTHORITY_KEYPAIR_PATH` must point at a
keypair JSON file outside version control (`keypairs/` is gitignored).

## Commands

| Command | What it does |
|---|---|
| `npm run dev` | Prints resolved config and pings the configured RPC |
| `npm run build` | Compiles to `dist/` |
| `npm run typecheck` | Type check without emitting |
| `npm test` | Runs the Vitest suite once |

## Status

Skeleton only. The mint, fee configuration, fee harvesting, and cashback
distribution are not built yet; they are tracked in `blueprint/build-plan.md`.

Default network is **devnet**. Nothing targets mainnet.
