# Feature: README and recorded run

**From build-plan:** feature 11
**Status:** in progress

## Goal

Make the repository understandable and runnable by someone who has never seen
it: what it is, how to set it up, what each command does, and why the
non-obvious design decisions are what they are.

The overview names one hard requirement for this project: **reproducible from a
clean clone**. That has never actually been tested. This feature tests it.

## Ordering note

Item 11 is last in the build plan because it documents a finished project. It is
being built at 2 of 11 complete, so this spec is scoped to what is stable now:
setup, commands, and the design decisions behind code that already exists.

Deliberately excluded until the lifecycle exists:

- A walkthrough of minting, transferring, harvesting, or distributing
- The recorded devnet run (step 4 below, blocked)
- Any claim that the token works end to end, because it does not yet

The README must not describe features that are not built. A portfolio reader
discovering the gap themselves is worse than being told.

## In scope

- Rewriting `README.md` for what exists today
- A design-decisions section covering the four non-obvious Token-2022 behaviors
- Actually verifying clean-clone reproducibility by cloning and following it
- An honest status section naming what is and is not built

## Out of scope

- `AGENTS.md`, which is the agent-facing guide and already current
- Blueprint planning docs, which are generated
- API documentation or generated docs tooling
- Publishing anywhere beyond the existing GitHub remote

## Build loop

Build one step at a time, never the whole feature at once.

1. Plan mode lays out the step before any code.
2. The AI implements just that step.
3. It shows the diff (not full files); you read it and understand it.
4. You approve, then choose whether to commit a checkpoint or roll straight on.
   Checkpoints are optional; `/complete` makes the real feature-level commit at the end.

Never accept a step you haven't read. If a diff is too big to review, the step was too big, so split it.

## Build steps

- [x] **Step 1 - Setup and commands** - `README.md`. What the project is,
  requirements (Node 20+, no Solana CLI needed), setup in order (`npm install`,
  `npm run keygen`, copy `.env.example`, fund on devnet), a commands table, and
  the project structure. *Done when:* every command listed exists in
  `package.json` and runs, the env var names match `.env.example` exactly, and
  no command or feature that is not built is described as available.

- [x] **Step 2 - Design decisions** - `README.md`. A section explaining the four
  behaviors that make this token non-obvious: the transfer-fee extension has no
  exemption so payouts are taxed too; `mintTo` is untaxed which is why allocation
  uses direct minting; the fee rounds up by ceiling division; a rate change
  activates two epochs later. Plus why gross-up returns the smallest exact
  amount. *Done when:* each claim names the file or test that proves it, and a
  reader can verify any one of them by running a single command.

- [x] **Step 3 - Verify from a clean clone** - No source change expected.
  Clone the committed repository into a temporary directory and follow the
  README verbatim: install, keygen, env, typecheck, test, build, `npm run dev`.
  Fix whatever the README got wrong. *Done when:* a fresh clone completes every
  documented step with no undocumented action required, and the transcript is
  reported. Any correction lands in the same diff.

- [ ] **Step 4 - Recorded devnet run** - `README.md`. A transcript of the real
  lifecycle with transaction signatures and explorer links.
  **Blocked, and expected to stay blocked** until the authority holds devnet SOL
  and features 3 to 10 are built. *Done when:* the README carries at least one
  real signature that resolves on the Solana explorer for devnet. Do not check
  this off on a fabricated or illustrative transcript.

## Files / areas

| File | Purpose |
|---|---|
| `README.md` | Rewritten (currently a 41-line scaffold stub) |

No source changes are expected. If step 3 uncovers a genuine setup bug, fix it
and say so rather than papering over it in prose.

## Data / contracts

None. This feature is documentation.

## Testing

There is no unit test for prose, so the evidence is different in kind:

| Claim | How it is proven |
|---|---|
| Commands exist and run | Each executed, output reported |
| Env var names are correct | Diffed against `.env.example` |
| Design claims are true | Each names a file or test; the suite is green |
| Clean clone works | Step 3 actually clones and follows the README |

Step 3 is the real gate. A README that has not been followed from a clean clone
is a guess, and this project's stated requirement is precisely that it not be.

`npm test` must still pass afterwards, since step 3 may change source.

## Notes for the AI

- **Do not describe unbuilt behavior.** Features 3 to 10 are incomplete. The
  status section says so plainly, including that no mint has been created.
- **Clone from the local repository**, not GitHub: `main` is ahead of `origin`,
  so a GitHub clone would miss the most recent commit and test the wrong tree.
- Use a temp directory outside the project for step 3, and remove it afterwards.
- Do not commit a keypair, `.env`, or any secret generated during step 3.
- Mention that the first `npm test` after a clean install is slow, minutes, while
  `web3.js` is transformed. It looks like a hang and is not.
- Mention that `bigint: Failed to load bindings` on stderr is the absent native
  accelerator and is harmless.
- No em dashes, per `blueprint/context/coding-standards.md`.
- Keep it scannable: short sections, a commands table, no wall of prose.
