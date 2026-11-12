# S05 — Playwright driver + CLI + benchmark plumbing (design)

Agent: **builder**. Packages: `packages/driver-playwright`, `packages/cli`, `packages/scorer` (runner + oracle-level `mutant-check`), and `bench/` (harness, prompt, checklist, quota). All benchmark output in this spec goes to the gitignored `bench/.private/`.

## PlaywrightDriver

Implements the S04 `Driver` on headless Chromium:
- `goto/click/type/press/back/reload` map to real Playwright actions (real clicks and key presses, unlike the synthetic `DomDriver`).
- Shop target: `freshSession` calls `/api/possess` server-side, then `context.addCookies` sets `__Host-pg_sid` from the sealed token — no path token needed.
- Non-shop target: `freshSession` opens a fresh isolated context; `request` uses Playwright's APIRequest; `axe` injects axe-core; the beacon is wired with `page.exposeFunction('__poltergeistBeacon', …)`. Only the DOM/HTTP oracles are constructed for non-shop targets.
- `pointer` is a no-op here (ghost hands are a `DomDriver` concern).

## CLI (`packages/cli`)

`poltergeist haunt <url> [flags]`. Flow:
1. Parse flags; generate a per-run ownership token; print it.
2. **Ownership gate (below).** Refuse or continue.
3. Build the driver (shop vs other-site oracle set) and run the available ghosts + oracle/replay pipeline for `--budget` seconds each, seeded by `--seed`.
4. Verify findings (replay ×3 + clean replay), write Markdown certificates and generated Playwright tests to `--out`.
5. Exit non-zero if any Critical finding exists (CI gate). `--bench` switches to deterministic-only, machine-readable output for the runner.

In S05 the ghost personas are empty; the command still exercises driver → oracle → recorder → replay → certificate end to end against the local shop, which is the done-criterion.

## Ownership gate (H8) — authorized targets only

This is the responsibility boundary of the whole tool: Poltergeist drives a browser hard against a site, so it must only ever touch a site the operator controls. `assertOwnership(url, token)`:

1. Resolve the host. If it is loopback (`127.0.0.0/8`, `::1`) → allow (local dev).
2. Else fetch `https://<host>/.well-known/poltergeist.txt` and require it to contain the exact per-run `token` the CLI printed. Placing that file proves control of the site (same idea as an ACME HTTP challenge).
3. Refuse private-range hosts (RFC1918, link-local) and cloud-metadata IPs (e.g. `169.254.169.254`) outright — these are never valid targets and refusing them prevents the tool being pointed at internal infrastructure.
4. Follow no redirect off the verified host; a redirect to another host fails the gate.
5. Log the decision (allowed/refused + reason) into the run output.

Unit-test the gate hard: loopback allowed; correct token allowed; missing/wrong token refused; private, metadata and off-host redirect refused.

## Oracle-level `mutant-check`

Extend the generic `mutant-check` (reads the manifest at runtime; prints counts only):
- For each manifest entry, take its rule's contract test, expose that test's actions as a `Step` list.
- Replay the steps through the `PlaywrightDriver` on `{mutantIds:[id]}` and on `{clean:true}`.
- Pass = a **mapped** oracle (§7.1a) fires on the mutant session and not on the clean one.
- Output stays counts-only: `checked N · ok K · wrong-rule W · undetected U · clean-suite PASS|FAIL`. `mutant-maker` re-runs it once after this lands.

## Benchmark runner (`bench:run`)

`pnpm bench:run --mutants all|<n> --seeds <list>`:
- Requires a local production build (`next build` then `next start`) with `BENCH_MODE=1` (rate limits off, bench schema, top-level path tokens accepted) and `BENCH_SECRET` for `{mutantIds}` possessions.
- For each (mutant, seed): fresh `{mutantIds:[m]}` session, run the deterministic ghosts (none yet in S05 → the plumbing path), verify, decide kills via the scorer (§7.1a + clean replay).
- Writes per-(mutant,seed) detail to `bench/.private/` only (until S08).
- **Stdout = per-rule `Cn killed/tested` + overall rate only.** Never prints ids, seams or per-mutant results (the S06/S07 gates are read from this).

## Comparison harness (baseline plumbing)

`bench/baseline-harness.ts` (~150 lines): an `@modelcontextprotocol/sdk` stdio client to `npx @playwright/mcp@<pinned> --headless --isolated --browser chromium` (fall back to `--browser chrome` if `chromium` is rejected), plus `@google/genai` function-calling with a free AI Studio key. It:
- runs the fixed `bench/baseline-prompt.md` against a session, logging **every** MCP tool call as a `Step` so the same replayer + oracles score the trace later (S08);
- excludes rate-limit waits from active time; backs off on 429;
- records its commit, the `@playwright/mcp` + Playwright versions and the model id in each output file.
- In S05 it does ONE dry run on `{clean:true}` → `bench/.private/baseline/dry-run/`, never scored.

Commit `bench/baseline-prompt.md`, `bench/checklist.md` (what a baseline report must state to earn rule-credit) and `bench/quota.json` (the project's free Gemini limits). These are fairness commitments frozen before any scored run.

This harness is a **measurement instrument**: it runs a generic agent against the operator's own shop to compare tool effectiveness. It is not a general-purpose attack tool — the ownership gate and the shop-local, `BENCH_MODE` wiring keep it pointed only at the sandbox.

## Smoke haunt (`haunt:smoke`)

Starts its own shop (build if missing — build time excluded from the 300 s budget — then `next start` on 3000 with `BENCH_MODE=1`, wait `/api/health`, stop on exit), runs 1 committed seed at `--budget 15` per ghost on the 3 lowest-sorted-id non-public mutants, prints only the aggregate kill rate, finishes < 300 s. The `smoke-haunt` hook (S06) and GitHub Actions call this.

## Done-criteria checks
- `pnpm --filter @poltergeist/cli test` — ownership gate + CLI wiring unit tests pass.
- CLI haunts the local shop and writes certificates.
- `pnpm bench:run --mutants 3 --seeds 1` completes (plumbing path) to `bench/.private/`.
- `bench/baseline-harness.ts` completes one `{clean:true}` dry run to `bench/.private/baseline/dry-run/`.
- `mutant-maker` re-runs `mutant-check` green at oracle level.

## Guardrails
- Never weaken or bypass the ownership gate; never add a flag that skips it for non-loopback hosts.
- Never write scored results to `bench/results/` in this spec (that is S08).
- Keep the baseline prompt, harness, checklist and manifest hash frozen once committed; if the harness changes after the first baseline run, discard earlier traces and re-run.
