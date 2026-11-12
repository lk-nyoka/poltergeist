# S04 — Ghost core and scorer core: Requirements

**Spec:** S04-ghost-core-scorer · **Agent:** builder · **Target:** 17 Nov 2026
**Source of truth:** docs/brief.md §4, §5.2, §7.1, §7.1a, §7.2 (Glitch mechanics), §7.3, §8 (P1, P2, P7), §10
**Prepared with Claude (planning) on 9 Nov 2026.** Kiro writes tasks.md, all code and tests. The fast-check behaviour in REQ-6 was prototyped first (design §7).

S04 builds the browser-independent core. Ghosts (S06/S07), the Playwright driver (S05) and the DOM driver (S09) all plug into it. Everything here is tested with an in-memory `FakeDriver` and a small `FakeShop` fixture, never the real mutants.

## 1. Types and the Driver interface (`packages/ghost-core`)

- REQ-1.1: ghost-core SHALL export the `Driver` interface from brief §5.2, plus `freshSession(opts: PossessOptions)` and `currentPath()`.
- REQ-1.2: ghost-core SHALL NOT import DOM, `next`, `react` or Playwright modules. A lint rule (`no-restricted-imports`) SHALL enforce this.
- REQ-1.3: `packages/protocol` SHALL export the zod schemas `Step`, `Finding`, `OracleName` (the 10 names in brief §7.1) and the constant `ORACLE_RULES` (brief §7.1a).

## 2. Shop observer

- REQ-2.1: ghost-core SHALL define a `ShopObserver` interface with `ledgers(token)`, `orders(token, { reads })`, `intents(token)` and `cleanProducts()`, the four oracle reads. Implementations live elsewhere (HTTP with the secret in S05; Séance proxy in S09).
- REQ-2.2: Money and privacy oracles SHALL read only through `ShopObserver`, never from page content.

## 3. Oracles

- REQ-3.1: ghost-core SHALL implement all 10 oracles from brief §7.1 as pure functions over an `Observation` (observer reads plus page events, axe results, focus traces and submitted-vs-rendered text), each returning zero or more `OracleHit { oracle, evidence }`.
- REQ-3.2: Each oracle SHALL implement exactly the "Fires when" condition in brief §7.1, including:
  - `DoubleCharge`: more than one customer debit sharing one `intent_id`.
  - `TillLoss`: reference total = Σ price × qty − min(discount, subtotal), rounded half-up once, from `cleanProducts()`, using `orders.coupon_codes[0]`.
  - `PrivacyLeak`: an `order_reads` row for `stranger-order-fixed` in the session under observation.
- REQ-3.3: An HTTP 429 SHALL be inconclusive: no oracle fires on it.
- REQ-3.4: Each oracle SHALL have unit tests that fire on a `FakeShop` with the matching injected fault and stay silent on the clean `FakeShop`.

## 4. Recorder and replay

- REQ-4.1: Every driver call made through the `RecordingDriver` wrapper SHALL be recorded as a `Step` with its time gap since the previous step.
- REQ-4.2: Steps SHALL be session-independent:
  - `freshSession` is recorded as `{ kind: 'freshSession' }` with no options.
  - Values read from the observer (intent ids, order ids) are recorded as placeholders (`{{intentId}}`, `{{orderId}}`) and resolved at replay time.
- REQ-4.3: `replay(steps, driver, { base, gapCapMs? })` SHALL replay steps in a fresh session (`cloneOf` the base, or `{ clean: true }`), honouring recorded gaps, capped by `gapCapMs` when given.
- REQ-4.4: `verify(finding)` SHALL replay 3 times and mark the finding verified if the same oracle fires in at least 1 replay, recording the reproduction rate.
- REQ-4.5: `killCheck(finding)` SHALL replay on `{ clean: true }` and pass only if that oracle does not fire there.

## 5. Kill maths (scorer core, `packages/scorer`)

- REQ-5.1: The scorer SHALL decide a kill per (mutant, haunting seed): mutant m (rule Cₖ) is killed when a verified finding has an oracle in `ORACLE_RULES[Cₖ]` and passes `killCheck`.
- REQ-5.2: The scorer SHALL compute the kill rate per seed, the mean and range across seeds, a per-rule breakdown, and the surviving mutants.
- REQ-5.3: The manifest reader SHALL validate with `MutantManifest`. Its tests SHALL use `packages/scorer/test/fixtures/manifest.fixture.json` only.
- REQ-5.4: The scorer's console output SHALL be per-rule counts and rates only, never mutant ids or seams.

## 6. Shrinker (used by the Glitch in S07)

- REQ-6.1: `shrink(arbitrary, predicate, { budgetMs, seed, path? })` SHALL run `fc.check(fc.asyncProperty(...), { interruptAfterTimeLimit: budgetMs, seed })`, never `fc.assert`.
- REQ-6.2: `failed === false` (including an interrupted run) SHALL mean no finding. `failed === true` SHALL return the counterexample, seed, counterexample path and `numShrinks`, even when the run was interrupted during shrinking.
- REQ-6.3: ghost-core SHALL export length-biased text arbitraries (design §7), so long-input bugs are found within the budget.

## 7. Narration

- REQ-7.1: ghost-core SHALL define an `Llm` interface (`narrate(event): Promise<string>`) and a `TemplateLlm` fallback that needs no network. No real LLM client in S04.

## 8. Correctness properties (EARS; Kiro extracts them in design.md)

- **P1:** For any recorded step list without timing-sensitive steps and any haunting seed, WHEN the steps are replayed twice through the `FakeDriver` on the same mutant set, THE replayer SHALL produce identical oracle results.
- **P2:** WHEN the shrinker runs with no time limit and returns an input, THE input SHALL still fail the predicate and SHALL be no longer than the original. WHEN re-run with the same fast-check seed and path, IT SHALL return the same input.
- **P7:** WHEN kill rates are computed, EACH SHALL lie in [0, 1], THE killed set SHALL be a subset of the tested set, a kill SHALL count only through `ORACLE_RULES` and `killCheck`, and THE seed mean SHALL equal the mean of the per-seed rates.

## 9. Acceptance

- AC-1: P1, P2 and P7 pass as property tests (tasks marked required).
- AC-2: Each of the 10 oracles has a fires-on-fault and a silent-on-clean test.
- AC-3: `pnpm test` and `pnpm lint` pass; ghost-core has no DOM, Next or Playwright imports.
