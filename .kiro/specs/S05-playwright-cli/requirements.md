# S05 — Playwright driver + CLI + benchmark plumbing (requirements)

Agent: **builder**. Builds the real-browser driver, the command-line tool a developer runs against an app **they own**, the ownership safety gate, the oracle-level `mutant-check`, and the benchmark runner and comparison harness (plumbing only — the ghost personas are S06–S07). The builder is denied `apps/shop/src/mutants/` and the mutant manifest; benchmark output goes only to the gitignored `bench/.private/`.

Done when: the CLI haunts the local shop; `bench:run` completes on 3 mutants; the comparison harness completes one dry run on a `{clean:true}` session; `mutant-maker` re-runs `mutant-check` green.

## Requirements (EARS)

### R1 — PlaywrightDriver
- `packages/driver-playwright` SHALL implement the `Driver` interface (S04) on headless Chromium via Playwright, using real clicks, real key presses and real navigation.
- Against the Haunted Shop, THE driver SHALL set `__Host-pg_sid` directly with `context.addCookies` from the sealed token (no top-level path token needed).
- Against any other site, `freshSession` SHALL open a new isolated browser context, and ONLY the DOM/HTTP oracles SHALL run: `A11yViolation, FocusFailure, Crash, TextCorruption, ScriptExecution` (beacon via `page.exposeFunction`). Money and privacy oracles SHALL NOT run off the shop.

### R2 — CLI
- `packages/cli` SHALL provide `poltergeist haunt <url> [--ghosts …] [--budget 60] [--seed 42] [--out ./haunting] [--bench]`, runnable from a clone (no npm publish required).
- THE CLI SHALL output certificates as Markdown plus generated Playwright tests to `--out`.
- THE CLI SHALL exit non-zero when any Critical finding is present, so it can gate CI.
- In this spec the ghost personas do not exist yet; THE CLI SHALL run the empty/available ghost set and the oracle+replay pipeline end to end against the local shop.

### R3 — Ownership safety gate (H8) — authorized targets only
- BEFORE acting on a target, THE CLI SHALL verify authorization and SHALL refuse otherwise. It SHALL proceed ONLY when one of:
  - the host resolves to a loopback address (127.0.0.0/8 or ::1); or
  - the site serves `/.well-known/poltergeist.txt` containing the per-run token the CLI generated and printed (operator-placed, proving control of the site, like an ACME challenge).
- THE CLI SHALL refuse private-range and cloud-metadata IP addresses, and SHALL refuse any redirect that leaves the verified host.
- THE gate SHALL run before any ghost action, and its decision SHALL be logged.

### R4 — Oracle-level mutant-check
- THE builder SHALL extend `mutant-check` (created in S02, rule-level in S03) to oracle level: each rule's contract test exposes its actions as a `Step` list, which `mutant-check` replays through the `PlaywrightDriver` on `{mutantIds:[id]}` and on `{clean:true}`, confirming a **mapped** oracle fires only on the mutant.
- `mutant-maker` SHALL re-run `mutant-check` once after this change and it SHALL be green.

### R5 — Benchmark runner
- `packages/scorer` SHALL provide `pnpm bench:run --mutants all|<n> --seeds <list>`, running against a local production build of the shop with `BENCH_MODE=1`, using `{mutantIds:[…]}` sessions with the `BENCH_SECRET`.
- Stdout SHALL be ONLY per-rule `Cn killed/tested` lines plus the overall rate — never mutant ids, seams or per-mutant detail.
- Until S08, `bench:run` SHALL write only to `bench/.private/` (gitignored; denied to `builder`, `ghost-smith`, `judge`).

### R6 — Comparison harness (baseline plumbing)
- `bench/baseline-harness.ts` (~150 lines) SHALL drive a generic LLM agent with Playwright MCP against a `{mutantIds:[…]}` session using the fixed prompt in `bench/baseline-prompt.md`, logging every MCP tool call as a `Step` so the same replayer and oracles can score the trace later (S08).
- IT SHALL exclude rate-limit waits from active time, back off and retry on 429, and record the harness commit, the `@playwright/mcp` and Playwright versions and the model id.
- In this spec IT SHALL complete ONE **dry run** on a `{clean:true}` session, writing to `bench/.private/baseline/dry-run/`, never scored.
- `bench/checklist.md` (rule-credit criteria) and `bench/quota.json` (free-tier limits) SHALL be committed.

### R7 — Smoke haunt
- `pnpm haunt:smoke` SHALL run 1 committed seed, `--budget 15` per ghost, on 3 non-public mutants (first three by sorted id), printing ONLY the aggregate kill rate. It SHALL start its own shop (`next build` if needed, then `next start` on 3000 with `BENCH_MODE=1`, wait for `/api/health`, stop on exit) and finish under 300 s.

### R8 — Fairness commitments respected
- THE manifest hash, baseline prompt, harness and checklist SHALL be committed before any scored run (the first scored run is S08).
- Poltergeist's own runs SHALL use no LLM (deterministic only). Both tools SHALL drive Chromium through Playwright with the same recorded budget (4 min active, 200 calls per mutant per seed).

## Out of scope
- Ghost personas / attack libraries (S06–S07), the first scored benchmark and published results (S08), `DomDriver`/hosted (S09), Séance UI (S10), certificate export detail (S11).
