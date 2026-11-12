# S03 — Mutation engine: Requirements

**Spec:** S03-mutation-engine · **Agent:** mutant-maker only (main session agent, never a sub-agent of builder) · **Target:** 15 Nov 2026
**Source of truth:** docs/brief.md §6.1, §7.1a, Appendix B, `.kiro/steering/mutants.md`
**Prepared with Claude (planning) on 9 Nov 2026.** Per brief §13.2, this spec describes only counts, the spread across rules and the check procedure. It never describes individual mutants.

## 1. Mutants

- REQ-1.1: mutant-maker SHALL write about 40 overrides in `apps/shop/src/mutants/**`, exported from `apps/shop/src/mutants/index.ts` as `overrides: MutantOverride[]`.
- REQ-1.2: Each override SHALL replace exactly one existing seam. Seam keys SHALL come from `pnpm --filter @poltergeist/shop seams:list` and nowhere else.
- REQ-1.3: Each override SHALL break exactly ONE contract rule (Appendix B), in a way a real developer could plausibly get wrong (steering `mutants.md`). No absurd sabotage.
- REQ-1.4: Each rule C1–C12 SHALL have at least 3 non-public overrides. Exactly 3 overrides SHALL be public demo mutants (one each for C1, C4 and C8), so C1, C4 and C8 have at least 4 overrides in total.
- REQ-1.5: Every override SHALL be detectable by at least one oracle mapped to its rule (brief §7.1a), not only by a unit test.
- REQ-1.6: The three public demo mutants SHALL each trigger a hero victim view: C1 → `DoubleCharge` (PhoneSms), C4 → `TillLoss` (TillCounter), C8 → `A11yViolation` (Blackout).
- REQ-1.7: Override ids SHALL be random lowercase hex strings of 8–16 characters, never descriptive. File names in `src/mutants/` SHALL be neutral (e.g. `m-<id>.ts`).
- REQ-1.8: Overrides call `impl(original, ...args)` and may call `original` to keep behaviour close to correct. Render overrides return a component. A render override that needs client behaviour lives in its own `'use client'` file under `src/mutants/`.

## 2. Manifest

- REQ-2.1: `bench/mutant-manifest.json` SHALL list every override as `{ id, rule, seam, public }` and SHALL pass the `MutantManifest` zod schema in `packages/protocol`.
- REQ-2.2: Each override's `public` field SHALL equal its manifest entry's `public`.
- REQ-2.3: `bench/manifest.sha256` SHALL hold the SHA-256 (hex) of the exact manifest bytes, written after the manifest is final.

## 3. Checks

- REQ-3.1: `pnpm --filter @poltergeist/scorer mutant-check` SHALL report `ok` for every entry and `clean-suite PASS` before S03 is done.
- REQ-3.2: THE clean contract suite (`pnpm --filter @poltergeist/shop test` with no `PG_MUTANTS`) SHALL still pass.
- REQ-3.3: `pnpm --filter @poltergeist/shop typecheck` and `build` SHALL pass with the overrides present.

## 4. Secrecy

- REQ-4.1: mutant-maker SHALL write only in `apps/shop/src/mutants/**`, `bench/mutant-manifest.json`, `bench/manifest.sha256` and this spec folder.
- REQ-4.2: These spec files and any commit message SHALL NOT name, describe or count individual mutants per seam. They may state totals and per-rule counts only.
- REQ-4.3: The diary hook stays skipped for S03. Lindokuhle writes the S03 diary entry by hand afterwards, with counts only.

## 5. Acceptance

- AC-1: `mutant-check` prints `checked N · ok N · wrong-rule 0 · undetected 0 · clean-suite PASS` with N ≥ 39.
- AC-2: `pnpm test`, `pnpm lint` and the shop typecheck and build pass.
- AC-3: `bench/manifest.sha256` matches the committed manifest.
- AC-4: The commit touches only the paths in REQ-4.1.
