# Build Plan

> One of the two planning docs you provide. Write it directly, develop it through
> any AI conversation, or optionally run `/discovery`. Keep the items high-level
> even when `project-plan.md` is detailed; later `/feature` specs hold the depth
> for each build item.

The features that make up this project, high level and in rough build order, one
line each, no detail (that comes per feature). Rough is fine at first, but before
`/overview` runs this file should be shaped into a checkbox list the build loop
can track.

Keep it as a checklist. Run `/feature` with no number to spec the **next
unchecked** item, or `/feature 3` / `/feature "login"` to pick a specific one.
Completed features get checked off here, so the build plan doubles as your
progress tracker. A big item gets split into sub-items (4a, 4b, etc.) when you
spec it.

## Continuing after the initial build

This is a living roadmap, not a plan that freezes when the first release is
done. Keep completed items checked, then append new unchecked features as the
project grows. Optional milestone headings such as `## MVP` and `## Post-MVP`
keep a longer plan readable without changing how `/feature` finds the next
unchecked item.

Do not renumber completed features because their archived specs refer back to
those numbers. Continue with the next unused number. If a new feature materially
changes the product direction, users, data, stack, monetization, UI/UX, or
deployment, update the relevant part of `project-plan.md` too. Then re-run
`/overview` before spec'ing the feature.

You can edit this file directly or ask the AI to start a new feature by name. If
`/feature "team workspaces"` does not match an existing item, it will propose the
new build-plan line and any necessary project-plan changes, wait for approval,
refresh the overview, and then write the feature spec.

Scaffolding the app (create-next-app, etc.) and prototyping the look are
pre-build steps, not features (see the README), so don't list them here. Start
with your first real slice of functionality.

A common order that works well: build the core UI with placeholder data first,
then wire up data, auth, and integrations. Add deployment readiness only when
the app is worth shipping or a provider config change is part of the work. Adapt
it to your project.

## Format

Use checkboxes. Each item should be a feature-sized outcome, not a loose task or
a whole product area.

Good:

```text
  - [ ] 1. **Skill submission** - upload a skill package and save its metadata
  - [ ] 2. **Validation result** - run checks and show pass/fail status for a skill
  - [ ] 3. **Directory listing** - browse and filter published skills
  - [ ] 4. **Deployment readiness** - configure Render or Vercel and verify the
    production build
```

Avoid:

- Upload stuff
- Database
- Make it look nice
- Auth, billing, dashboard, validation, and deploy

If your first pass is just rough bullets, that is okay. Run `/overview` after
filling both planning docs; it will flag plan-shape problems and can propose a
cleaned-up checkbox version before generating the project overview.

## MVP

### Foundations

- [ ] 1. **Core helpers** - connection factory, keypair loading from a gitignored
  path, devnet SOL funding, and base-unit amount conversion
- [ ] 2. **Fee and distribution math** - pure module for fee calculation,
  inverse-fee gross-up, pro-rata shares, dust, and exclusions, fully unit tested
  with no network access

### Token lifecycle

- [ ] 3. **Mint creation** - Token-2022 mint with the TransferFee extension
  initialized at 1 percent, with config and withdraw authorities set
- [ ] 4. **Allocation and revocation** - mint the fixed 1,000,000 supply directly
  into holder and treasury accounts, then permanently revoke the mint authority
- [ ] 5. **Fee rate scheduling** - schedule the change to 2 percent and read back
  the pending config with its activation epoch

### Fee mechanics

- [ ] 6. **Fee-accruing transfers** - transferChecked between holders, with
  per-account withheld amounts read back and reconciled against the expected fee
- [ ] 7. **Harvest and withdraw** - harvest withheld amounts to the mint and
  withdraw them into the treasury

### Cashback

- [ ] 8. **Holder snapshot** - enumerate token accounts for the mint at a point in
  time, apply exclusions, and produce the eligible balance set
- [ ] 9. **Cashback distribution** - grossed-up pro-rata payouts with a pre-flight
  treasury sufficiency check and dust retained in the treasury

### Demo and presentation

- [ ] 10. **One-command demo** - orchestrate the full lifecycle end to end with
  staged output, a summary table, and a signature for every transaction
- [ ] 11. **README and recorded run** - setup instructions reproducible from a
  clean clone, plus a recorded devnet run with verifiable signatures
