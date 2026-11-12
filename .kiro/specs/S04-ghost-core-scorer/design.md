# S04 — Ghost core and scorer core: Design

**Spec:** S04-ghost-core-scorer · **Agent:** builder · **Requirements:** requirements.md
**Prepared with Claude on 9 Nov 2026.** The fast-check findings in §7 were measured in this repo's toolchain (fast-check 4.10.2, Vitest 5.1.0) before writing.

## 1. Layout

```
packages/protocol/src/
  step.ts        Step zod schema (§3)
  oracles.ts     OracleName enum + ORACLE_RULES (brief §7.1a)
  finding.ts     Finding zod schema
packages/ghost-core/src/
  driver.ts      Driver, Locator, ElementInfo, PageEvent, AxeViolation
  observer.ts    ShopObserver interface + Observation type
  oracles/       one file per oracle + index.ts (runOracles(obs) → OracleHit[])
  recorder.ts    RecordingDriver (wraps any Driver), placeholders
  replay.ts      replay(), verify(), killCheck()
  shrink.ts      shrink() + text arbitraries (§7)
  llm.ts         Llm interface + TemplateLlm
  testing/
    fake-shop.ts    FakeShop: in-memory model of the shop's API and pages, with injectable faults
    fake-driver.ts  FakeDriver: implements Driver against FakeShop
packages/scorer/src/
  manifest.ts    readManifest(path) → MutantManifest (validated)
  kills.ts       decideKills(), killRate(), summarise()
  report.ts      per-rule console summary (counts only)
packages/scorer/test/fixtures/manifest.fixture.json
```

ESLint: add `no-restricted-imports` for `packages/ghost-core/**`, blocking `next`, `next/*`, `react`, `react-dom`, `playwright`, `@playwright/*`, `jsdom`.

## 2. Driver (brief §5.2, plus two methods)

```ts
export type Locator = { role?: string; name?: string; css?: string; testId?: string };
export interface Driver {
  goto(path: string): Promise<void>;
  click(target: Locator, opts?: { count?: number; delayMs?: number }): Promise<void>;
  type(target: Locator, text: string): Promise<void>;
  press(key: 'Tab' | 'Shift+Tab' | 'Enter' | 'Escape'): Promise<void>;
  back(): Promise<void>;
  reload(): Promise<void>;
  freshSession(opts: PossessOptions): Promise<void>;
  request(method: string, path: string, body?: unknown, headers?: Record<string, string>): Promise<{ status: number; json: unknown }>;
  query(selector: string): Promise<ElementInfo[]>;
  focused(): Promise<ElementInfo | null>;
  axe(): Promise<AxeViolation[]>;
  onEvent(cb: (e: PageEvent) => void): () => void;
  pointer(x: number, y: number): void;
  currentPath(): Promise<string>;
  sessionToken(): string;   // the sealed token of the session under observation (for ShopObserver calls)
}
```

`PageEvent = { kind: 'pageerror' | 'beacon' | 'http5xx' | 'http429' | 'errorBoundary'; detail: string; at: number }`.

## 3. Step schema (`protocol/step.ts`)

```ts
export const Step = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('freshSession') }),
  z.object({ kind: z.literal('goto'), path: z.string() }),
  z.object({ kind: z.literal('click'), target: LocatorSchema, count: z.number().int().min(1).max(3).optional(), delayMs: z.number().int().min(0).optional() }),
  z.object({ kind: z.literal('type'), target: LocatorSchema, text: z.string() }),
  z.object({ kind: z.literal('press'), key: z.enum(['Tab', 'Shift+Tab', 'Enter', 'Escape']) }),
  z.object({ kind: z.literal('back') }),
  z.object({ kind: z.literal('reload') }),
  z.object({ kind: z.literal('request'), method: z.string(), path: z.string(), body: z.unknown().optional(), headers: z.record(z.string(), z.string()).optional() }),
  z.object({ kind: z.literal('mcp'), tool: z.string(), args: z.record(z.string(), z.unknown()) }), // baseline traces (S05)
]).and(z.object({ gapMs: z.number().int().min(0), timingSensitive: z.boolean().default(false) }));
```

**Placeholders:** any string field may contain `{{intentId}}` or `{{orderId}}`. The recorder substitutes them when it records a value it got from the observer. The replayer resolves them by asking the observer for the replay session's latest intent or order.

## 4. Observation and oracles

```ts
export type Observation = {
  ledgers: { customer: Entry[]; till: Entry[]; customerStart: number; tillStart: number };
  orders: Order[]; reads: { orderId: string }[]; intents: { id: string }[];
  clean: { prices: Record<string, number>; coupons: Record<string, Coupon> };
  events: PageEvent[]; axe: AxeViolation[];
  focus: FocusTrace[];                 // from Night Owl walks: { dialogOpen, sequence, closedBy, returnedTo, opener }
  texts: { submitted: string; rendered: string | null; field: 'name' | 'address' | 'review' }[];
  refreshChecks: { intentId: string; orderVisible: boolean }[];   // recorded after a refresh/back step
};
```

Each oracle is `(obs: Observation) => OracleHit[]`, exactly as brief §7.1 says:
- `DoubleCharge`: group customer debits by `intentId`; any group with count > 1 → hit.
- `StateLoss`: a debit exists for an intent, and `refreshChecks` shows `orderVisible === false` for it.
- `TillLoss`: till balance below start; or any order total < 0; or order total ≠ the reference (see below).
- `QuantityBreach`: any order line with `!Number.isInteger(qty) || qty < 1 || qty > 10`.
- `PrivacyLeak`: `reads` contains `stranger-order-fixed`.
- `ScriptExecution`: `events` has a `beacon`.
- `TextCorruption`: a `texts` entry whose submitted value is valid under C10 and whose `rendered !== submitted`.
- `A11yViolation`: an axe violation with id in the 9 rules from brief §7.1.
- `FocusFailure`: any of the 3 failure shapes in brief §7.1.
- `Crash`: `pageerror`, `errorBoundary` or `http5xx` events.

**Reference total** (shared helper, also used by P4):
```ts
const sub = Σ clean.prices[l.productId] * l.qty;
const code = order.couponCodes[0];
const d = !code ? 0 : c.kind === 'fixed' ? c.cents : (sub * c.percent) / 100;
const ref = Math.floor(sub - Math.min(d, sub) + 0.5 + 1e-9);
```

Any `http429` event in the window → `runOracles` returns `[]` for request-driven oracles (REQ-3.3).

## 5. FakeShop and FakeDriver (`testing/`)

`FakeShop` is a small in-memory model of the shop:
- products, cart and coupons
- checkout with intents and an atomic claim
- orders, reads and reviews
- pages with a handful of `ElementInfo`s (buttons with names, images with alt, a dialog)

`new FakeShop({ faults: Set<FaultName> })` takes **its own** fault names, defined only in `testing/`. They're fixtures for oracle tests, unrelated to the real mutants: e.g. `'skipClaim'`, `'negativeQty'`, `'renderHtml'`, `'dropAlt'`, `'noFocusTrap'`, `'leakOrders'`, `'truncateText'`, `'throwOnLongName'`, `'stackCoupons'`, `'trustClientPrice'`, `'loseOrderOnRefresh'`, `'noRounding'`.

`FakeDriver` implements `Driver` and `ShopObserver` over a `FakeShop`. `freshSession(opts)` creates a new fake session, using the same fault set for `cloneOf` and none for `{clean:true}`. It has no timers except `delayMs`, so P1 replays are deterministic.

## 6. Recorder, replay, verify, kill check

- `new RecordingDriver(inner)` forwards every call and appends a `Step` with `gapMs = now − lastAt`. Use `performance.now()`, rounded.
- `replay(steps, driver, { base: 'clone' | 'clean', gapCapMs })`: calls `driver.freshSession(base === 'clean' ? { clean: true } : { cloneOf: baseToken })` first, then each step, waiting `min(gapMs, gapCapMs ?? ∞)` before each. It then builds an `Observation` from the observer plus the events collected and returns `runOracles(obs)`.
- `verify(finding, driver, { replays = 3 })` → `{ verified, reproductionRate: hits / replays }`.
- `killCheck(finding, driver)` → `true` when `replay(..., { base: 'clean' })` has no hit for `finding.oracle`.

## 7. Shrinker (measured findings)

Measured in this repo on 9 Nov 2026 with fast-check 4.10.2:

1. **Default `fc.string()` almost never generates long strings.** A "breaks above 41 code points" fault went **undetected** with `fc.string({ maxLength: 300 })`. Use a length-biased mix:
   ```ts
   export const textArb = fc.oneof(
     fc.string({ unit: 'grapheme', maxLength: 30 }),
     fc.string({ unit: 'grapheme', maxLength: 300, size: 'max' }),
   );
   ```
   Plus explicit boundary cases via `fc.constantFrom` (lengths 99/100/101, `'\u0007'`, a lone surrogate).
2. **Shrinking all the way to the minimum costs thousands of runs.** It took **4,971** predicate runs to shrink to the exact 42-character minimum. With a 3 s `interruptAfterTimeLimit` and a 5 ms predicate it still returned `failed: true, interrupted: true` with a 42-character counterexample after 581 runs. So:
   - always set `interruptAfterTimeLimit` to the remaining budget;
   - treat `failed: true` as a finding even when `interrupted` is true;
   - the Glitch's predicates should use `driver.request` (fast API calls), not UI typing. The final counterexample is then replayed once through the UI to verify.
3. `fc.check(..., { seed, path: counterexamplePath, endOnFailure: true })` reproduces the same counterexample (P2).

```ts
export async function shrink<T>(arb: fc.Arbitrary<T>, pred: (v: T) => Promise<boolean>, o: { budgetMs: number; seed: number }) {
  const d = await fc.check(fc.asyncProperty(arb, pred), { interruptAfterTimeLimit: o.budgetMs, seed: o.seed });
  return d.failed
    ? { found: true as const, value: d.counterexample![0] as T, seed: d.seed, path: d.counterexamplePath!, numShrinks: d.numShrinks, interrupted: d.interrupted }
    : { found: false as const };
}
```

P2 property tests call `shrink` with a large budget (no effective limit) on synthetic predicates.

## 8. Scorer core

```ts
type RunResult = { mutantId: string; seed: number; findings: { oracle: OracleName; verified: boolean; killCheck: boolean }[] };
decideKills(results, manifest) → Map<`${id}:${seed}`, boolean>   // via ORACLE_RULES[entry.rule]
killRate(kills, seed) → number in [0,1]
summarise(kills, manifest) → { mean, min, max, perRule: Record<Rule, { killed, tested }>, survivors: string[] }
```

`report.ts` prints only `perRule` counts and the mean/min/max. The `survivors` list is returned for the S08 results file, but never printed while ghosts are still being built.

## 9. Tests

- **Oracles:** one `.test.ts` per oracle. Each fires with its `FakeShop` fault and stays silent on clean.
- **P1** (`replay.prop.test.ts`): arbitrary step lists of 1–20 non-timing steps → replay twice → deep-equal hits.
- **P2** (`shrink.prop.test.ts`): random thresholds n ∈ [1, 200]; predicate `len ≤ n`; the shrunk value fails, is no longer than the original, and replays identically by seed+path.
- **P7** (`kills.prop.test.ts`): arbitrary results and a fixture manifest → rates in [0,1], killed ⊆ tested, only mapped oracles count, mean = average.
- **Recorder:** placeholders substituted and resolved; `freshSession` recorded with no options.

## 10. Build order (tasks.md follows this)

1. Protocol: `step.ts`, `oracles.ts`, `finding.ts` with schema property tests
2. ghost-core `driver.ts`, `observer.ts`, and the lint rule
3. `testing/fake-shop.ts`, `testing/fake-driver.ts`
4. Oracles one by one, with their tests
5. `recorder.ts`, `replay.ts` + P1
6. `shrink.ts` + text arbitraries + P2
7. `llm.ts` (interface + `TemplateLlm`)
8. scorer `manifest.ts`, `kills.ts`, `report.ts` + P7, using the fixture manifest
9. `pnpm test` and `pnpm lint` green → commit and push
