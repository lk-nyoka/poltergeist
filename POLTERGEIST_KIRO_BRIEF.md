# Poltergeist — Build Brief for Kiro

**Project:** Poltergeist · **Hackathon:** Kiroween 2026, Frankenstein category · **Builder:** Lindokuhle Nyoka (solo) · **Version:** 3.9 (final, reviewed eleven times), 8 Nov 2026
**Hard deadline:** 4 Dec 2026, 14:00 PT (5 Dec, 00:00 SAST). **Our submit date:** 3 Dec 2026. **Must stay live until judging ends:** 29 Jan 2027.

> **Kiro, read this first.** This brief is the single source of truth for the project. Work in this order:
> 1. Create the steering files exactly as written in **Appendix A**, front matter included.
> 2. Create the custom agents in **§13.2**. In S01, check each agent file against the current Kiro custom-agent docs before using it. Their permissions keep the benchmark fair.
> 3. Build one spec at a time, **in the Kiro IDE**, in the order in **§14**. Spec property-based testing works only in the IDE. (S03 may run in Kiro CLI as the main-session `mutant-maker`; it has no property-test tasks.) For each spec, write `requirements.md` in EARS notation, then `design.md`, then `tasks.md`. Do not start the next spec until every task in the current one passes.
> 4. Write each correctness property in **§8** as an EARS acceptance criterion in the matching spec's `requirements.md`, so Kiro extracts it as a correctness property in `design.md`. In `tasks.md`, mark every property-based-test task as **required**, not optional.
> 5. Create each hook in **§13.3** in the spec named in its "Created in" column, never before its command exists.
>
> This brief is committed as `docs/brief.md`. It's too large for an agent's `resources` (the per-file cap is 50,000 characters), so read its sections on demand.
>
> Never read or write `apps/shop/src/mutants/**`, `bench/mutant-manifest.json` or `.kiro/specs/S03-mutation-engine/**` unless you are running as the `mutant-maker` agent.

---

## 1. Product in one paragraph

Poltergeist is a crew of AI "ghost" agents that possess a web app, try to break it the way real people do (impatient, sneaky, blind, chaotic), and show **who gets hurt** by each bug: a customer's phone buzzing with a double charge, a shop till paying money out, a blind user's black screen, a storefront defaced with graffiti. Every finding is replay-verified and becomes a "death certificate": the bug, who it hurts, exact repro steps, a shrunk failing input, and a generated Playwright regression test. A mutation-testing scoreboard shows how many hidden bugs Poltergeist catches compared with a developer's usual setup (a generic LLM agent with Playwright MCP).

**One-line pitch:** *Ghosts that break your app before your customers do, and show you who gets hurt.*

**Why Frankenstein:** Poltergeist stitches together parts that don't normally meet:
- property-based fuzzing (fast-check, a unit-test tool) driving a real browser;
- mutation testing (a research technique) turned into a live scoreboard;
- axe-core plus the browser's speech engine turned into a horror scene;
- deterministic attack code paired with an LLM narrator.

Each part is ordinary on its own. Together they make one QA product.

## 2. Hard constraints (breaking any of these can disqualify us or break the demo)

| # | Constraint |
| --- | --- |
| H1 | Brand-new project. Every commit dated on or after 30 Oct 2026. No code copied from earlier projects. The README lists any starter templates (e.g. `create-next-app`) and third-party libraries. |
| H2 | Public GitHub repo (not GitLab) with an MIT `LICENSE` file that GitHub detects (shows in the About section). |
| H3 | `/.kiro/` at the repo root, committed, never in `.gitignore`. It must contain specs, hooks and steering. |
| H4 | Free tiers only: Vercel Hobby, Supabase Free, GitHub (Pages and Actions), the Gemini API free tier. No paid services. |
| H5 | The hosted demo must work for judges with no install, no login and no credentials, in Chrome (including Incognito), Safari 26+ (macOS and iOS; checked manually on the deployed URLs) and Firefox, **until 29 Jan 2027**. A keep-alive job stops Supabase pausing the project (§12). |
| H6 | No third-party trademarks, logos, real bank names or copyrighted music anywhere in the app or video. The SMS sender is just "Bank". All materials in English. |
| H7 | The deliberately vulnerable shop must not be able to harm anyone (§16). |
| H8 | The CLI must only haunt sites the user controls (§11). |
| H9 | Dev machine: Windows 11 + PowerShell. Everything must run natively on it. Kiro CLI needs Windows 11 and version 3.0.0 or later. |
| H10 | Nothing is sold and nothing takes payment. The Séance Room and shop (Vercel Hobby, non-commercial) are demos. The startup landing page is a static site on GitHub Pages and shows pricing only as a labelled research hypothesis. |

## 3. Who it's for, and why they'd pay

- **Primary user:** small product teams (2–30 engineers) shipping web apps with checkout or forms, with little or no dedicated QA staff.
- **Secondary user:** QA consultancies that test client apps (fintech and e-commerce).
- **The pain:** bugs like double charges, coupon abuse, accessibility failures and crashes on odd input reach production. They cost money, trust and legal risk.
- **Why it's different:** it reports harm in human terms, a manager can read every report, and it measures its own effectiveness with a mutation score.
- **Recurring model (pricing *hypothesis*, labelled "research, not for sale"):** Free for 1 repo and 20 hauntings a month. Team at $29/repo/month for a haunting on every commit plus a nightly deep haunting. Agency at $99/month for 10 client apps and white-label reports. There is no checkout. "Join the waitlist" links to a GitHub Discussions thread on the repo.

## 4. Glossary (use these exact names in code, UI and docs)

| Term | Meaning |
| --- | --- |
| **Haunted Shop** | Our demo online store. Clean by default; mutants can be switched on per session. |
| **Séance Room** | The Poltergeist control-room web app: the Possession, Mansion and Ledger views. |
| **Ghost** | An agent persona with a deterministic attack library, plus optional LLM exploration. |
| **Driver** | Interface a ghost uses to act on a page. `DomDriver` (hosted demo, runs in the Séance Room) and `PlaywrightDriver` (CLI and benchmark). `FakeDriver` (in-memory) is for unit and property tests. |
| **Haunt runtime** | A thin script inside the shop page that runs one DOM command at a time for the `DomDriver`. It holds no ghost logic. |
| **Seam** | A named wrapper around one exported shop function (pricing, session, data access, validation, rendering). A mutant overrides exactly one seam. |
| **Oracle** | A detector that decides, independently of any mutant, whether something harmful happened. |
| **Checkout intent** | One logical attempt to buy one cart version. The **server** mints its `intent_id` (= the Idempotency-Key, `cart_id:version`) when checkout opens. It stores it in the `intents` table, keyed by `session_id` and `cart_id:version`, and reuses it across clicks, reloads, back navigation and re-opened dialogs. Ghosts read it from the oracle API; they never mint it. |
| **Finding** | An oracle firing during a haunting, with the recorded steps that led to it. |
| **Verified finding** | A finding that fires the same oracle again when its steps are replayed in a fresh session with the same mutant set (§7.3). Only these count. |
| **Contract** | The 12 rules the shop must obey (Appendix B). Ghosts may know the contract, like any real tester. |
| **Mutant** | One seam override that breaks exactly one contract rule, switched on for a session. |
| **Possession session** | A shop session with one or more mutants active. |
| **Demo possession** | A fixed, public, labelled possession of 3 mutants (C1, C4, C8), used for the hosted Summon demo and the video. Demo mutants are excluded from the benchmark. |
| **Haunting** | One run of selected ghosts against a target, within a time budget. |
| **Haunting seed** | The seed that fixes a haunting's attack order and choices. Not the same as a **fast-check seed**, which fixes one property run's random inputs. |
| **Death certificate** | The report for one verified finding. |
| **Victim view** | The animation that shows who a finding hurts. |
| **Kill** | A mutant that breaks rule Cₖ is killed in a run when (1) a verified finding appears whose oracle is mapped to Cₖ in §7.1a, and (2) replaying that finding's steps on a `{clean:true}` session does not fire that oracle. Recorded per (mutant, haunting seed). |
| **Kill rate** | Kills ÷ mutants tested, averaged over haunting seeds. This is the standard mutation score. |
| **Baseline** | A generic LLM agent with Playwright MCP and a fixed prompt (Appendix C). |

## 5. Architecture

```
┌────────────────────────────────────┐   postMessage RPC (origin + source checked, zod)   ┌──────────────────────────────┐
│ Séance Room (apps/seance)          │ ◄─────────────────────────────────────────────────► │ Haunted Shop (apps/shop)     │
│ Next.js on Vercel, origin A        │   shop runs in a sandboxed <iframe> on this page    │ Next.js on Vercel, origin B  │
│ - ghost-core runs HERE             │                                                     │ - store UI + API routes      │
│ - DomDriver (RPC client)           │                                                     │ - seams + mutant overrides   │
│ - victim views, Possession,        │                                                     │ - haunt-runtime.js (thin:    │
│   Mansion, Ledger, scoreboard      │                                                     │   one DOM command at a time) │
│ - server routes read shop ledgers  │ ── server-to-server (shared secret) ──────────────► │ - /api/possess, /api/oracle/*│
└──────────────────┬─────────────────┘                                                     └──────────────┬───────────────┘
                   │ Supabase (per-visitor hauntings, findings, certificates)                             │ Supabase (sessions,
                   │ Gemini API free tier (narration only, rate-limited per IP)                           │ orders, ledgers, reviews)
┌──────────────────┴─────────────────┐                     ┌──────────────────────────────────────┐
│ CLI (packages/cli)                 │                     │ Landing page (apps/landing)          │
│ pnpm poltergeist haunt <url>       │                     │ static export on GitHub Pages        │
│ PlaywrightDriver + same ghost-core │                     └──────────────────────────────────────┘
│ (the benchmark uses this path)     │
└────────────────────────────────────┘
```

**Why two origins:** the shop is deliberately vulnerable. On its own origin, a script injected into it can never touch the Séance Room's cookies or storage. The two `*.vercel.app` hostnames are cross-site, because `vercel.app` is on the Public Suffix List. That affects cookies (§6).

**Where the logic lives:** ghost-core (orchestration, recorder, oracles) runs in the **Séance Room page**, not inside the shop. A navigation, reload or fresh session inside the iframe would otherwise destroy the ghost's state halfway through a haunting. Only the thin `haunt-runtime.js` runs inside the shop. It runs one DOM command at a time (click, type, query, focus, axe) and replies over `postMessage`.
- `DomDriver` lives in the Séance Room and is a request/response RPC client.
- `goto` and fresh sessions are done by the parent setting `iframe.src`; the parent always knows those URLs because it builds them.
- `reload` is a runtime command: the runtime calls `location.reload()`, and `DomDriver` waits for a `ready` with a higher `loadId`.
- Every runtime reply and every `ready` message includes `location.pathname + location.search`, so the parent always knows the frame's current URL, even after in-shop `<Link>` navigations.
- `back` is a runtime command that calls `history.back()`.
- `request` is a runtime command: the runtime performs a same-origin `fetch(shopUrl(path))` inside the shop and returns `{status, json}`. A direct fetch from the Séance page would be blocked by CORS and wouldn't carry the shop's cookie.
- Oracle-API reads (intents, ledgers, orders, reads, clean products) never go through the runtime. ghost-core gets them from the Séance proxy routes (§16).
- After every document load, the runtime sends a `ready` handshake whose `loadId` is that document's `performance.timeOrigin`. It is strictly larger for each new load and needs no storage (a module-level counter would reset on every load). `DomDriver` keeps the last `loadId` it saw. For `reload` it sends the command, then resolves on the first `ready` whose `loadId` is larger, with a 10 s timeout. Before any other command after a load, it waits for that load's `ready`, with the same timeout.

**Three architecture rules:**
1. **Deterministic ghosts, LLM narrator.** `packages/ghost-core/src/llm.ts` defines only an `Llm` interface. In the Séance Room it's implemented by calling the Séance route `POST /api/narrate`, which holds `GEMINI_API_KEY` (server env, never `NEXT_PUBLIC_`) and enforces the per-IP limit. The CLI uses a Node implementation. Attack libraries are plain, seeded, repeatable code. The LLM only proposes extra exploration and writes narration and certificate wording. With no API key, when rate-limited, or when a visitor's per-IP LLM limit is reached, everything still works and the narration falls back to templates.
2. **One ghost brain, two drivers.** `packages/ghost-core` never imports DOM or Playwright APIs directly. It talks only to the `Driver` interface.
3. **The shop origin is hostile.** Messages and text from the shop are treated as untrusted data (§16).

### 5.1 Repo structure (pnpm workspaces + Turborepo)

```
poltergeist/
├─ .kiro/                     steering/, specs/S01-…S13-…, hooks/, agents/, settings/mcp.json  (all committed)
├─ apps/
│  ├─ seance/                 Séance Room (Next.js 16, Tailwind): ghost-core + DomDriver run here
│  ├─ shop/                   Haunted Shop (Next.js 16)
│  │  ├─ src/seams/           seam registry (builder, S02)
│  │  └─ src/mutants/         mutant overrides; ONLY the mutant-maker agent touches this
│  └─ landing/                startup landing page (static export → GitHub Pages)
├─ packages/
│  ├─ ghost-core/             ghosts, oracles, recorder, replay, shrinker, FakeDriver, types
│  ├─ driver-dom/             DomDriver (RPC client) + haunt-runtime.js (thin in-shop agent)
│  ├─ driver-playwright/      PlaywrightDriver
│  ├─ cli/                    CLI entry point
│  ├─ protocol/               zod schemas for every message and record, plus the MutantOverride type
│  └─ scorer/                 kill-rate maths, manifest reader, benchmark runner, per-oracle regression runner
├─ bench/                     baseline-prompt.md, baseline-harness.ts, checklist.md, quota.json, smoke-baseline.json,
│                             results/*.json (from S08), .private/ (gitignored, scorer only),
│                             mutant-manifest.json + manifest.sha256 (mutant-maker only)
├─ docs/                      brief.md (this brief), kiro-diary.md, writeup.md, blog-draft.md
└─ LICENSE (MIT)
```

### 5.2 Driver interface (`packages/ghost-core/src/driver.ts`)

```ts
interface Driver {
  goto(path: string): Promise<void>;
  click(target: Locator, opts?: { count?: number; delayMs?: number }): Promise<void>;
  type(target: Locator, text: string): Promise<void>;
  press(key: 'Tab' | 'Shift+Tab' | 'Enter' | 'Escape'): Promise<void>;
  back(): Promise<void>;
  reload(): Promise<void>;
  freshSession(opts: PossessOptions): Promise<void>;   // see §6.1
  request(method: string, path: string, body?: unknown): Promise<{ status: number; json: unknown }>;
  query(selector: string): Promise<ElementInfo[]>;     // role, accessible name, bounding box, focusable
  focused(): Promise<ElementInfo | null>;
  axe(): Promise<AxeViolation[]>;
  onEvent(cb: (e: PageEvent) => void): Unsubscribe;   // page errors, beacons, HTTP 5xx
  pointer(x: number, y: number): void;                // moves the ghost-hand overlay (DomDriver); no-op elsewhere
}
```

**Browser rules for `DomDriver` (synthetic events are "untrusted" and perform no default browser actions; `click` is the only exception):**
- **Clicks:** `el.click()` or a bubbling `MouseEvent('click')`. React 17+ listens at the root, so `onClick` fires. `click({count})` waits `delayMs` (at least one `setTimeout(0)`) between clicks, so React re-renders between them as it would for a human. Back-to-back synchronous clicks would create races no human can cause: false positives.
- **Typing:** set the value with the native setter (`Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value').set.call(el, v)`, or the `HTMLTextAreaElement` one), then dispatch a bubbling `input` event. Checkboxes and radios use `el.click()`. Selects use the `HTMLSelectElement` setter plus a `change` event.
- **Tab:**
  1. Dispatch a bubbling, cancelable `keydown` for Tab on `document.activeElement`.
  2. If `defaultPrevented`, the app moved focus itself (e.g. a dialog's focus trap); stop there.
  3. Otherwise compute the sequential focus order and `.focus()` the next element. The order is positive `tabindex` ascending, then `tabindex=0` and natively focusable elements in DOM order. It skips `disabled` elements, `inert` subtrees, `hidden`, `display:none` and `visibility:hidden`.

  It does **not** special-case dialogs, so a missing focus trap shows up as a bug.
- **Escape:** dispatches `keydown` only.
- **Shop dialogs:** always custom `<div role="dialog" aria-modal="true">` with a JavaScript focus trap and a `keydown` Escape handler. Never the native `<dialog>` or `showModal()`. That way real and synthetic keys behave the same in both drivers.
- `PlaywrightDriver` uses real key presses and real clicks.

## 6. The Haunted Shop (`apps/shop`)

A small, believable store. Clean and correct by default. **Currency is USD only**, for the international judges. There's no currency setting. All stored amounts, API bodies and oracle values are USD cents. There are no accounts and no sign-in. Any "account" shown is a cosmetic, per-session persona.

**Pages:** Home (8 products), Product (details + reviews), Cart, Checkout dialog, Order confirmation, Orders (`/orders/[id]`).

**Sessions (must work inside a cross-site iframe):**
- Each session is a sealed iron-session token. It holds the session id, the active mutant set, the issue time and the Séance haunting id.
- **Cookie:** `__Host-pg_sid` with `HttpOnly; Secure; SameSite=None; Partitioned; Path=/` (iron-session `cookieOptions: { sameSite: 'none', secure: true, partitioned: true }`).
- **Path token `/s/[token]/…`:** this is how the Séance Room starts and switches sessions (fresh sessions, possessions, replays). It's also the fallback for browsers that drop partitioned cookies in iframes (Safari before 26.2, strict privacy settings).
- **Rules in `proxy.ts`:**
  1. A path token is honoured if it was issued in the last 30 minutes **and** either (a) `Sec-Fetch-Dest: iframe` (the Séance Room loading the frame), or (b) `Sec-Fetch-Site: same-origin` (in-shop fetches, Next.js `<Link>`/RSC navigations, assets). It then **wins** over the cookie: re-set the cookie to it, then `NextResponse.rewrite` to the un-prefixed route.
  2. A path token on any request that meets neither 1(a) nor 1(b) is ignored, and a fresh, empty, clean session is minted. Examples: a top-level navigation (`Sec-Fetch-Dest: document`), or a cross-site fetch or subresource. So a link someone was sent never opens another person's session. A path token older than 30 minutes on an iframe or same-origin request is ignored in favour of the cookie; if there is no cookie, a fresh clean session is minted.
  3. With no path token, use the cookie.
  4. With `BENCH_MODE=1` (local benchmark only, never deployed), both the destination check and the age check are waived.
- Every in-shop link, redirect and client `fetch` is built through one `shopUrl(path)` helper. It keeps the `/s/<token>` prefix whenever the current URL has one.
- Sessions are created only in `proxy.ts` or Route Handlers, never in a page component.
- **The sealed token is immutable after it's minted.** Never add fields to it, or call `session.save()` with new data. All mutable per-session state (cart lines, applied coupon, cart version, current intent) lives in Supabase rows keyed by `session_id`, because rule 1 re-sets the cookie from the path token on every request.
- Never rely on unpartitioned third-party cookies.
- **Acceptance test:** the Possession view works in Chrome Incognito and Firefox (automated, §14 S02), and in Safari 26.x on macOS and iOS (manual check on the deployed URLs).

**Per-session sandbox:** carts, intents, orders, reviews, order reads and both ledgers are stored in Supabase rows keyed by `session_id` and deleted after 24 h. **No visitor ever sees another visitor's data**, including reviews. The one exception is a synthetic **stranger session** with a fixed order id `stranger-order-fixed`. It exists only for the PrivacyLeak oracle. It's seeded once per schema by a migration (`is_stranger = true`), excluded from cleanup, and never re-created, so concurrent hauntings can't race on it.

**Fake money (powers the victim views):**
- Customer bank ledger: starting balance $500. Every charge writes a debit (tagged with its `intent_id`) and a "Bank" SMS entry.
- Shop till ledger: starting balance $1,000. Every sale writes a credit. **There is no refund feature**, so the till can only go down through a bug.

**API routes:**
- `GET /api/products` (prices **and** coupon values; every coupon is worth less than the cheapest product, so a clean total is always > 0)
- `POST /api/cart`
- `POST /api/checkout/open` (mints or returns the intent's Idempotency-Key)
- `POST /api/checkout` (requires that key)
- `GET /api/orders/:id`
- `POST /api/reviews`
- `GET /api/health` (one real DB read, for the keep-alive job)
- **Séance-server only**, authenticated with a shared server secret and never callable from a browser: `POST /api/possess` (§6.1), `GET /api/oracle/ledgers`, `GET /api/oracle/orders` (with `?reads=1` for `order_reads`), `GET /api/oracle/intents`, `GET /api/oracle/products` (prices and coupon values computed with no mutants active).

**Headers:**
- `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors <SEANCE_ORIGIN>`
  - `SEANCE_ORIGIN` comes from env: `http://localhost:3001` in dev and test, the production Séance domain in production.
  - Add `'unsafe-eval'` to `script-src` in development only.
  - `'unsafe-inline'` is deliberate: C7 mutants must be detectable through inline-handler payloads. **Never add script nonces, hashes or `strict-dynamic`**, because they silently disable `'unsafe-inline'` and would make C7 mutants undetectable.
- No `X-Frame-Options` header.
- `X-Robots-Tag: noindex`.
- `/.well-known/security.txt` saying this is an intentionally vulnerable, per-session sandboxed demo.
- The shop reflects **no** URL, query or header content into HTML.

**Contract:** the shop obeys the 12 rules in **Appendix B**. Spec S02 includes a full contract test suite, and it must pass on the clean shop.

### 6.1 Seams, mutants and possession

- **Seams (builder, S02):** every exported pricing, session, data-access, validation and render function in the shop is wrapped as `seam('<module>/<export>', fn)` in `src/seams/`.
  - The registry is uniform: every such function is wrapped, so the list of seams says nothing about which ones are mutated.
  - At request time, a seam checks the session's active mutant set and calls an override if one is registered for it. Otherwise it calls the original.
  - Render seams run on the server, so client-side mutants (accessibility, focus) arrive as server-rendered variants, not client flags.
- **Override loading:** in S01, `mutant-maker` is started once as the main agent to create `apps/shop/src/mutants/index.ts` containing only `import type { MutantOverride } from '@poltergeist/protocol'; export const overrides: MutantOverride[] = [];`, and it's committed. The S02 registry imports it **statically**. Never use a guarded dynamic import: bundlers fail on a missing module.
- **Override contract:** the `MutantOverride` type lives in `packages/protocol`: `{ id: string /* random hash */, seam: string, impl: Function, public: boolean }`. The shop uses `public` to pick demo and random mutants and never reads the manifest.
- **Mutants (mutant-maker, S03):**
  - About 40 overrides in `src/mutants/**`, exported from `src/mutants/index.ts`, with **at least 3 non-public mutants per contract rule**. C1, C4 and C8 therefore have at least 4, counting their public demo mutant.
  - Each breaks exactly one rule and must be detectable by an oracle mapped to that rule (§7.1a).
  - Ids are random hashes, never descriptive names.
  - The manifest `bench/mutant-manifest.json` is read only by `packages/scorer`. Its schema is defined in `packages/protocol` in S02: `MutantManifest = z.object({ version: z.literal(1), mutants: z.array(z.object({ id: z.string(), rule: z.enum(['C1', …, 'C12']), seam: z.string(), public: z.boolean() })) })`. The scorer's own tests use `packages/scorer/test/fixtures/manifest.fixture.json`, never the real file. Its SHA-256 is committed to `bench/manifest.sha256` **before the first scored benchmark run**.
  - The three Demo possession mutants are flagged `"public": true` in the manifest and excluded from the benchmark.
- **`POST /api/possess` (builder, S02; Séance server and scorer only):** accepts exactly one of the options below, and returns only an opaque sealed path token.
  - `{clean: true}`: a fresh session with no mutants
  - `{count: 1..3}`: random mutants, picked only from overrides with `public === false`
  - `{demo: true}`: the Demo possession (the overrides with `public === true`)
  - `{cloneOf: <sealed token>}`: a fresh session with the same mutant set
  - `{mutantIds: [...]}`: accepted only with the separate `BENCH_SECRET`, and used only by `packages/scorer` in `BENCH_MODE`
- The `mutant-check` script (§13.3) checks that every mutant breaks its one rule and that the clean shop still passes the full contract suite.

## 7. Ghosts and oracles

### 7.1 Oracles (detectors, independent of mutants)

Money and privacy oracles read the shop's ledgers, orders and intents **from the Séance server** (or the scorer) through `/api/oracle/*`. They never trust values reported by the page. Reads retry for up to 2 s before an oracle fires, to tolerate write delays.

| Oracle | Fires when | Victim view |
| --- | --- | --- |
| `DoubleCharge` | More than one customer debit shares one `intent_id` | **Phone:** a phone slides in and buzzes twice with "Bank: $49.99 debited" SMS |
| `StateLoss` | A customer debit exists for an `intent_id` with no `orders` row for it 2 s after a refresh or back step | **Phone** plus an empty cart with a "where did my order go?" bubble |
| `TillLoss` | The till balance goes down, an order total is < 0, or a total differs from an **independent reference total**. The oracle computes the reference itself (Σ price × qty − min(discount, subtotal), rounded half-up once) from canonical prices **and coupon values** read from `GET /api/oracle/products`: in hosted mode through a Séance proxy route, in the CLI and scorer directly, never through `driver.request` or the runtime. The reference uses `orders.coupon_codes[0]`, if any | **Till:** the shop owner's till counter spins down and coins fly out |
| `QuantityBreach` | An accepted order line has a non-whole quantity, or a quantity outside 1–10 | **Warehouse:** a delivery box opens with half a kettle, or 25 kettles spilling out |
| `PrivacyLeak` | `order_reads` shows **the session under observation** read the stranger's order `stranger-order-fixed`. That's the haunting's session during the haunting, or each replay's own fresh session during verification and the clean-replay check | **Stranger's receipt:** someone else's receipt slides into view, address blurred |
| `ScriptExecution` | A unique beacon token from an injected payload calls `window.__poltergeistBeacon(token)` | **Graffiti:** the storefront gets spray-painted and a fake "enter your card" popup appears |
| `TextCorruption` | A contract-valid name, address or review (Appendix B, C10) comes back with `textContent` not exactly equal to what was submitted | **Receipt:** the printed receipt shows the customer's name mangled |
| `A11yViolation` | axe-core reports any of: `button-name`, `image-alt`, `svg-img-alt`, `input-image-alt`, `label`, `select-name`, `link-name`, `aria-command-name`, `aria-input-field-name` | **Blackout:** the screen fades to black and the browser voice reads the page as a screen reader would ("button… button… image"), with captions |
| `FocusFailure` | With a dialog open, any of: the tab sequence escapes to background content; the tab sequence never reaches a close control and Escape doesn't close it; or after closing, focus doesn't return to the element that opened it | **Blackout** plus a padlock over the dialog |
| `Crash` | A page error, an error boundary rendering, or an HTTP 5xx on any input, including out-of-contract input | **Receipt printer:** torn, garbled paper, and the page cracks like glass |

**Rule:** a victim view plays **only** for a verified finding. No proof, no animation.

### 7.1a Oracle → rule map (published, used by the scorer to decide kills)

| Rule | Oracles that may kill its mutants |
| --- | --- |
| C1 one charge per checkout intent | DoubleCharge |
| C2 refresh/back safety | StateLoss, DoubleCharge |
| C3 quantity 1–10 whole numbers | QuantityBreach, TillLoss |
| C4 one coupon, discount ≤ subtotal | TillLoss |
| C5 server prices only | TillLoss |
| C6 totals ≥ 0, rounded once | TillLoss |
| C7 user text never rendered as HTML | ScriptExecution |
| C8 accessible names and alt text | A11yViolation |
| C9 dialog focus behaviour | FocusFailure |
| C10 text up to 100 code points, unchanged | TextCorruption, Crash |
| C11 own orders only | PrivacyLeak |
| C12 no 5xx on user input | Crash |

Every rule has at least one oracle, so no mutant is a guaranteed survivor.

### 7.2 The four ghosts

Each ghost has a steering file (Appendix A), a seeded attack library, a time budget (default 60 s of active time per ghost per haunting) and its own hand colour.

| Ghost | Persona | Deterministic attacks | Main oracles |
| --- | --- | --- | --- |
| **The Impatient One** | In a hurry, clicks everything twice | Double/triple click on submit buttons (20–150 ms apart); reload mid-checkout; back after paying, then pay again; close and re-open checkout | DoubleCharge, StateLoss |
| **The Fraudster** | Looking for free stuff | Quantities −3, 0, 0.5, 11, 1e9; stacking and reusing coupons; tampered price in API bodies; requesting `stranger-order-fixed`; beacon-only payloads in event-handler form (`<img src=x onerror=…>`, `<svg onload=…>`) as well as `<script>` | TillLoss, QuantityBreach, PrivacyLeak, ScriptExecution |
| **The Night Owl** | Uses a keyboard and screen reader | Tab walk of every page and open dialog (including focus restore after close), Escape on every dialog, axe scan of every state, reading accessible names aloud | A11yViolation, FocusFailure |
| **The Glitch** | Chaos with a maths degree | Property-based fuzzing of every form with fast-check. Contract-valid inputs (C10) must round-trip. Out-of-contract inputs (101–500 code points, control characters, lone surrogates, bad numbers) must get a friendly 4xx, never a 5xx or crash. Failures are **shrunk** to a simpler failing input | Crash, TextCorruption, TillLoss |

**Glitch mechanics:** run with `fc.check` (never `fc.assert`) and `interruptAfterTimeLimit` set to the remaining budget. `details.failed === false`, including an interrupted run, means **no finding**. When `failed` is true, take `details.counterexample` and re-verify it. Each predicate run uses a fresh session (`freshSession({cloneOf})`). fast-check doesn't guarantee the globally smallest input, so the UI says "shrunk failing input", not "smallest".

**How ghosts share a haunting:**
- **Benchmark:** ghosts run one after another, each in its own fresh possession of the same mutant set.
- **Hosted demo:** ghosts interleave round-robin, one command each, in one session, which is why four hands appear to move at once. In hosted mode the Glitch never calls `freshSession`: its predicate runs use `driver.request` against the API inside the shared session. All verification replays (and the Glitch's fresh-session re-checks) are queued and run after the round-robin ends, in a second iframe. That iframe is the same size as the visible one and placed off-screen (`position:fixed; left:-10000px; top:0`), with `aria-hidden="true"` and `tabindex="-1"`. Never hide it with `display:none`, `hidden`, `visibility:hidden`, `opacity:0` or `inert`: the browser would skip layout, and axe and focus replays would fail. Victim views play as each queued verification passes.
- The recorder keeps one merged step list per session (see §7.3 for how a finding's steps are cut from it).

**LLM exploration (optional layer, OFF in the benchmark):** after the deterministic library runs, a ghost may ask the LLM for up to 5 extra actions, based on the page's accessibility tree and the contract. Those actions run through the same driver and oracles. The LLM never decides whether something is a bug. The oracles do. Shop text sent to the LLM is treated as untrusted data, never instructions.

### 7.3 Recording, replay and verification

- Every driver call is recorded as a `Step` (zod schema in `packages/protocol`), with its haunting seed and the time gaps between steps.
- **Steps are session-independent:**
  - `freshSession` is recorded as `{kind: 'freshSession'}` with no options. The replayer supplies the options from its context: `cloneOf` of the replay base, or `{clean: true}` for the kill check.
  - Values read from the oracle API (`intent_id`, order ids) are recorded as placeholders (e.g. `{{intentId}}`) and resolved at replay time.
- **A finding's steps** are the merged prefix since the last `freshSession` of the session it fired in. For a Glitch finding, they are only the shrunk counterexample's run.
- **Verification:** replay the steps in a **fresh session with the same mutant set** (`{cloneOf}`) and the recorded time gaps, 3 times. A finding is verified if the same oracle fires in at least 1 of the 3 replays. The certificate shows the reproduction rate (e.g. "reproduced 3/3").
- **Hosted timing:** hosted Summon and Possess use a 20 s budget per ghost. Hosted replays keep recorded gaps under 1 s exactly and cap longer gaps at 1 s. The victim view plays on the first replay that fires; the remaining replays and the clean replay finish in the background and update the reproduction rate.
- **Hosted demo:** money and privacy oracles are verified from the Séance server. DOM-observed oracles (axe, focus, crash, beacon) are verified by replaying through the `DomDriver`, so they can only be faked by a visitor tampering with their own sandboxed session.
- **Benchmark:** everything is verified through the `PlaywrightDriver`.

## 8. Correctness properties (write each as an EARS criterion; Kiro turns them into property-based tests)

| Id | Property (EARS form) | Spec |
| --- | --- | --- |
| P1 | For any recorded step list **without timing-sensitive steps** and any haunting seed, WHEN the steps are replayed twice through the `FakeDriver` on the same mutant set, THE replayer SHALL produce identical oracle results. (Timing-sensitive steps report a reproduction rate instead.) | S04 |
| P2 | WHEN the shrinker runs **with no time limit** and returns an input, THE input SHALL still fail on replay and SHALL be no longer than the original. WHEN it is re-run with the same fast-check seed and path, IT SHALL return the same input | S04 |
| P3 | For the committed haunting seeds and within fast-check's run budget, WHEN a haunting with all ghosts built so far runs on a `{clean:true}` session, THE system SHALL produce zero verified findings | S06, S07, S08 |
| P4 | For any valid cart (1–10 of each product, at most one valid coupon), WHEN it is checked out on the clean shop, THE total SHALL equal Σ(price × qty) − discount, rounded once half-up to cents, SHALL be ≥ 0, and THE ledger SHALL hold exactly one debit per `intent_id`, however many times Pay is pressed | S02 |
| P5 | For any string that is valid under C10, WHEN it is submitted as a name, address or review on the clean shop, THE shop SHALL store it and render it so its `textContent` equals the input exactly, and THE beacon SHALL never fire. For any string that is not valid under C10, THE shop SHALL return a friendly 4xx | S02 |
| P6 | WHEN the Séance Room receives a message, IT SHALL accept it only if `event.origin` equals the shop origin, `event.source` is the iframe's window, and `safeParse` succeeds against its zod schema (unknown keys stripped); otherwise IT SHALL ignore it. Both sides SHALL call `postMessage` with an explicit target origin, never `'*'` | S09 |
| P7 | WHEN kill rates are computed, EACH SHALL lie in [0, 1], THE killed set SHALL be a subset of the tested set, a kill SHALL count only through the §7.1a map and the clean-replay check, and THE seed mean SHALL equal the mean of the per-seed rates | S04 |
| P8 | WHEN the `DomDriver` and the `PlaywrightDriver` tab through any clean-shop page and open dialog, THEY SHALL produce the same focus sequence, compared up to the last in-page element | S09 |
| P9 | WHEN a certificate is exported to Markdown and parsed back, THE steps, oracle and shrunk input SHALL be preserved | S11 |

**Per-oracle regression tests:** `packages/scorer` runs these, because only it can read the manifest. For each oracle, it picks a mapped mutant and checks that the generated Playwright regression test **fails** with that mutant on and **passes** on a `{clean:true}` session. The builder writes only the generic test harness.

## 9. The Séance Room (`apps/seance`)

**Style:** take inspiration from Refero Styles (https://styles.refero.design/). Use a dark editorial look for the Séance Room, and give the shop a clean, ordinary store look so the haunting contrasts with it. Readable type and high contrast. **The Séance Room must pass its own Night Owl** (zero axe violations, full keyboard use). That's an acceptance criterion, and a strong line for the write-up.

**Embedding:** `<iframe sandbox="allow-scripts allow-same-origin allow-forms">`. The shop is cross-origin, so `allow-same-origin` keeps its own origin and cookies, while still blocking popups and top-level navigation. The `src` uses production domains from env vars, never `VERCEL_URL`. Preview URLs are behind Vercel's deployment protection and would show judges a login page.

**Flow:** Landing → choose ghosts (the Demo possession is on by default) → **Summon** → watch → open certificates → **Possess** (a hidden random mutant) → watch the hunt → Ledger.

| View | What it shows |
| --- | --- |
| **Possession** (the demo) | The shop in the iframe. Ghost hands (one colour per ghost) move with eased motion to each target. A red handprint stays wherever a ghost struck. A side log shows short narration lines (shop text in it is shown as plain text and cut at 80 characters). Victim views play over the shop when findings are verified. Speed control: 0.5×, 1×, 2×. A banner shows **Demo possession**, **Hidden mutant** or **Clean shop**. |
| **Mansion** | An SVG floor plan of the app. Each discovered page is a room and links are doors. Explored rooms are lit, unreached rooms are dark, and handprints mark rooms with verified findings. Coverage % at the top. |
| **Ledger** | This visitor's own death certificates (newest first), plus the public scoreboard. |

**Visitor scoping:** hosted hauntings, findings and certificates belong to the visitor's own Séance session (a first-party cookie on the Séance origin) and expire after 24 h. Visitors never see each other's findings. The public scoreboard reads only the committed `bench/results/*.json`. Summon, Possess and LLM narration are rate-limited per IP; over the limit, the narration uses templates.

**Victim views** (one component each in `apps/seance/src/victims/`):
- **Hero views, must-have and fully animated:** `PhoneSms`, `TillCounter`, `Blackout`. These are the three the Demo possession triggers.
- **Second wave, animated if time allows, otherwise static illustrated cards:** `Graffiti`, `StrangersReceipt`, `Warehouse`, `ReceiptPrinter` + `CrackedGlass`.
- **Always:** `Handprint`.

Each view lasts at most 4 s, can be skipped with Escape, and respects `prefers-reduced-motion` (fades instead of moving).

**Speech:**
- In the Summon and Possess click handlers, synchronously call `speechSynthesis.speak(new SpeechSynthesisUtterance(''))` to unlock speech (iOS and Chrome need it inside the user gesture). The real lines are spoken later.
- If no audio starts within 1 s, or no voices exist, show captions only.
- Captions are always on.

**Death certificate:** styled like an old certificate. Fields:
- Cause of death (oracle)
- Who gets hurt (one plain sentence)
- Ghost
- Severity (Critical / High / Medium / Low)
- Reproduction rate
- Steps to reproduce (numbered)
- Shrunk failing input (with a short "shrank from 214 to 41 characters" animation)
- Screenshot: from the CLI and benchmark replays (`page.screenshot()`). In the hosted demo, a DOM snapshot thumbnail of the last step, or "screenshot available via CLI replay".
- Generated Playwright test (copy button)
- Export as a GitHub issue: opens a prefilled `https://github.com/<owner>/<demo-repo>/issues/new?title=…&body=…` link in a new tab, so the visitor files it under their own GitHub account. Build the URL from the title plus a short body: cause, who gets hurt, severity, reproduction rate and the first 5 steps. Cap the whole URL at 6,000 characters. Before opening the tab, copy the full certificate Markdown to the clipboard and show "Full certificate copied, paste it into the issue". The body ends with that same note. The Séance Room holds no GitHub token. GitHub MCP issue filing (§13.4) runs only from the dev machine.

## 10. Benchmark and scoreboard (`packages/scorer`, `bench/`)

This is mutation testing applied to agents. Each tool acts as a test generator, and the kill rate (mutation score) measures how many seeded faults it exposes. That makes it a standard, auditable way to compare how effective each tool is.

**Where it runs:** on the dev machine, against a local production build of the shop (`next start`), with `BENCH_MODE=1`. In that mode, rate limits are off, it uses a separate bench schema in Supabase, and top-level path tokens are accepted. The hosted demo is never benchmarked.

**Fairness commitments (state these in the write-up):**
1. The mutant manifest hash, the baseline prompt, the harness and the rule-credit checklist are all committed **before** the first scored run.
2. Both tools drive the same browser engine (Chromium through Playwright). Poltergeist runs with **no LLM at all** (deterministic only).
3. The baseline uses the **strongest free-tier Gemini model** whose quota fits the plan in `bench/quota.json`. Its model id is recorded.
4. **Budget:** both tools get 4 minutes of **active** time per mutant per seed, not counting rate-limit waits, capped at 200 tool calls. Both numbers are recorded, so throttling never counts as a baseline failure.
5. Surviving mutants are listed openly, and so are the baseline's wins.
6. The oracle → rule map (§7.1a) is published, so anyone can audit what counts as a kill.

**Protocol (results committed as JSON):**
0. In week 1, record the project's free Gemini limits from AI Studio in `bench/quota.json`, and size the runs to fit. Default plan:
   - Poltergeist: 3 haunting seeds for every non-public mutant (it uses no LLM, so no quota).
   - Baseline: 1 seed per mutant; extra seeds only if quota remains. The baseline harness is built in S05, and its runs start right after, resuming daily around the quota reset (midnight Pacific).
   - If quota can't cover every mutant by 25 Nov, publish the completed subset, clearly labelled, with the coverage count.
1. Run every ghost on `{clean:true}` sessions with the committed seeds. It must produce 0 verified findings (P3).
2. For each non-public mutant m (breaking rule Cₖ), run the ghosts one after another, each in a fresh `{mutantIds:[m]}` session. m is killed under the §4 definition.
3. Run the **baseline** on a fresh `{mutantIds:[m]}` session with the same budget. The harness logs every Playwright MCP tool call as a `Step` and runs all 10 oracles live on the baseline's session. It is scored two ways, and both numbers are reported:
   - (a) **Oracle score:** kills from verified findings, found by replaying that logged trace, under the §4 definition.
   - (b) **Rule-credit:** a fresh LLM session with no stake (or a second person) uses the committed `bench/checklist.md`. It marks m as killed if the baseline's written report names the broken rule and gives a plausible repro, whether or not our replayer reproduces it.
4. Write the results file with per-(mutant, seed) results, active time, tool-call counts, LLM call counts and 429 errors, the harness commit, the `@playwright/mcp` and Playwright versions, and the model id.

**Where results are written:**
- Until S08 starts, `bench:run` writes only to `bench/.private/`. It's gitignored, and denied to `builder`, `ghost-smith` and `judge`: their `fs_read` deny lists, the shell deny list, the `protect-mutants` regex, `.ignore` and `.rgignore`.
- The first file in `bench/results/` is written by the first scored run in S08, after S06–S07 are closed.
- Baseline runs from S05 onwards write their traces, reports and per-run data only to `bench/.private/baseline/`. In S08 the scorer re-scores those traces through the frozen replayer and oracles, and writes them to `bench/results/` together with the Poltergeist results.
- The S05 "harness completes one run" check is a **dry run** on a `{clean:true}` session. It writes to `bench/.private/baseline/dry-run/` and is never scored or re-scored.
- Fairness commitment 1 (manifest hash, prompt, harness and checklist committed) must be met before the first baseline run on a mutant, which starts after S05 closes. If the harness changes after that, discard every earlier baseline trace and re-run.
- **Terminal output:** `bench:run` prints to stdout only one line per rule (`Cn killed/tested`) plus the overall rate. It never prints mutant ids, seams or per-mutant results. The S06 and S07 gates are judged from that output.
- **Ghost code is frozen after S07.** "Ghost code" means the attack libraries, oracles, recorder, replay and verification, the shrinker, and the sequential scheduler `bench:run` uses. Any later change to these means re-running the full benchmark, and is reported in the write-up.
- Hosted-only paths (the round-robin scheduler, 20 s budgets, gap capping, queued second-iframe verification, and the Glitch's `driver.request` mode) live in `packages/ghost-core/src/hosted/`. `bench:run` never executes them, so building them in S09 isn't a ghost change. The Glitch's hosted branch is written in S07, behind a `mode: 'hosted'` flag.

**Scoreboard:**
- Kill rate per tool: mean over seeds, plus the range. For the baseline, both its oracle score and its rule-credit score.
- A breakdown per contract rule.
- The surviving mutants, listed by rule.
- The baseline's kills.

**The result is published whatever it shows.** The only allowed fallback is when the baseline harness cannot run at all (it crashes, or no quota is available), never because the baseline scores higher. In that case, compare with an ablation: the same ghost-core with attack libraries off and LLM exploration on for the **full** budget. Label it honestly. The baseline harness is built in S05 so its quota-limited runs have about 6 days.

**Live "Possess" in the demo** is separate from the benchmark: one hidden random mutant, a live hunt, and a "caught in N seconds" banner (or "survived" if it isn't caught). In hosted Possess, "caught" means any verified finding whose `{clean:true}` replay doesn't fire. The Séance Room never knows the mutant's rule.

## 11. CLI (`packages/cli`)

```
pnpm poltergeist haunt <url> [--ghosts impatient,fraudster,nightowl,glitch] [--budget 60] [--seed 42] [--out ./haunting]
```

- Uses the `PlaywrightDriver` (headless Chromium) and the same ghost-core. Runs from a clone of the repo, so judges need no npm publish.
- **Against the Haunted Shop:** the `PlaywrightDriver` sets `__Host-pg_sid` directly with `context.addCookies` from the sealed token, so it needs no top-level path token.
- **Against any other site:** `freshSession` opens a new isolated browser context, and only the DOM/HTTP oracles run: A11yViolation, FocusFailure, Crash, TextCorruption, and ScriptExecution (via `page.exposeFunction`). The money and privacy oracles need the shop's oracle API, so they don't run there.
- **Ownership check (H8):** it runs only if one of these is true:
  - the host resolves to a loopback address (127.0.0.0/8 or ::1);
  - the site serves `/.well-known/poltergeist.txt` containing the per-run token the CLI generates and prints. The operator must place it there, which proves they control the site, like an ACME challenge.

  It refuses private-range and cloud-metadata IPs, and any redirect off the verified host.
- Outputs certificates as Markdown plus generated Playwright tests. It exits non-zero on Critical findings, so it can be used in CI.
- **Stretch:** publish to npm as `@lk-nyoka/poltergeist`. That needs an npm user or org named `lk-nyoka` (create it in week 1). Do the first publish with `npm publish --access public`, then use trusted publishing from GitHub Actions (OIDC), with no long-lived tokens. The unscoped npm name `poltergeist` belongs to an unrelated, abandoned package. The famous Poltergeist was the Ruby (Capybara) PhantomJS driver, which makes a good nod in the write-up.

## 12. Data model (Supabase Free)

| Table | Key columns |
| --- | --- |
| `shop_sessions` | id, created_at, expires_at, is_stranger bool |
| `carts` | id (uuid), session_id, version int, items jsonb, coupon_codes text[], updated_at. One active cart per session; `version` increments on every change |
| `intents` | id (= Idempotency-Key `cart_id:version`), session_id, created_at |
| `orders` | id, session_id, intent_id, items jsonb, coupon_codes text[] (in the order the server accepted them), total_cents, created_at |
| `ledger_entries` | id, session_id, ledger ('customer' \| 'till'), amount_cents, memo, intent_id, created_at |
| `reviews` | id, session_id, product_id, body, created_at |
| `order_reads` | id, session_id, order_id, created_at. Written by `GET /api/orders/:id` and the `/orders/[id]` page **after** the data-access seam returns, **only when the seam returned an order row that is then sent in the response**. It's outside any seam, so mutants can't suppress it |
| `haunting_sessions` | id, haunting_id, role ('main' \| 'replay' \| 'clean_replay'), sealed_token, created_at. The Séance server writes a row for every shop session it mints for a haunting |
| `hauntings` | id, seance_session_id, target, ghosts, haunting_seed, mode ('summon' \| 'possess' \| 'demo'), started_at, finished_at |
| `findings` | id, haunting_id, ghost, oracle, steps jsonb, verified bool, reproduction_rate, shrunk_input text |
| `certificates` | id, finding_id, who_gets_hurt, severity, test_code text, markdown text |

Benchmark runs use the same tables in a separate `bench` schema. Add `bench` to Supabase's API **Exposed schemas**, and grant usage on it to `service_role` only.

**Access:**
- Only server code (shop and Séance route handlers, and the scorer) talks to Supabase, using the new secret key (`sb_secret_…`, server env only). Do not use the legacy `service_role` key.
- **RLS is enabled with no policies on every table**, and the `anon`/`authenticated` grants are revoked, so the publishable key can read nothing.
- Shop session scoping is enforced through the data-access seams: every query takes `sessionId` from the unsealed session token and adds `.eq('session_id', sessionId)`. C11 mutants weaken exactly that filter, and the C11 contract test checks it.
- Séance data is scoped by `seance_session_id` the same way.
- Cleanup runs daily with `pg_cron` and deletes all per-session rows (carts, intents, orders, ledgers, reviews, order reads, Séance data) older than 24 h, except the seeded stranger session.

**Keep-alive (H5):** a free GitHub Actions scheduled workflow calls `GET /api/health` on the shop every 12 h, from 1 Dec until results are announced. Supabase Free pauses projects after a week of low activity. Check the project is active before the deadline, and weekly through January.

## 13. How we use Kiro (every feature, used for real)

### 13.1 Steering
- Foundation files: `product.md`, `tech.md`, `structure.md`.
- One personality file per ghost.
- `mutants.md`, with `inclusion: manual` front matter so it never loads by default. Full text in Appendix A.

A steering file without front matter is always included. That's why `mutants.md` must start with its front-matter block.

### 13.2 Custom agents (`.kiro/agents/`)

Depending on the Kiro surface, custom agents may also inherit always-included steering (see the `chat.disableInheritingDefaultResources` setting). List every needed file explicitly in `resources` anyway, and never use a glob such as `file://.kiro/steering/**/*.md`. `mutants.md` stays safe because it is `inclusion: manual` and appears only in `mutant-maker`'s `resources`.

| Agent | Purpose | `resources` | Permissions (`permissions.rules`) and hooks |
| --- | --- | --- | --- |
| `builder` | Default agent for every spec except S03 | `product.md`, `tech.md`, `structure.md`, the four `ghost-*.md` | `fs_read` and `fs_write` deny on `apps/shop/src/mutants/**`, `bench/mutant-manifest.json`, `bench/manifest.sha256`, `bench/.private/**`, `.kiro/specs/S03-mutation-engine/**`, `.kiro/steering/mutants.md`; shell deny on any command containing `src/mutants`, `src\mutants`, `mutant-manifest`, `manifest.sha256`, `bench/.private`, `bench\.private` or `S03-mutation-engine`, and on `git show*`, `git log -p*` and `git diff*` without a pathspec; inline `protect-mutants` hook |
| `mutant-maker` | Writes the S03 mutant overrides and the manifest | the same files plus `mutants.md` | `fs_write` allow on `apps/shop/src/mutants/**`, `bench/mutant-manifest.json`, `bench/manifest.sha256`, `.kiro/specs/S03-mutation-engine/**`; `fs_write` deny on `**` with `exclude` set to exactly those four paths |
| `ghost-smith` | Implements and tunes ghosts | same as `builder` | same denials and hook as `builder` |
| `judge` | Reviews each finished spec against this brief and the judging rubric | same as `builder` | `tools: ["read"]`; `fs_write` deny on `**`; same read denials and hook |

**`protect-mutants`:** inline in the `hooks` array of `builder`, `ghost-smith` and `judge` **only, never `mutant-maker`**. It has three entries, all `trigger: PreToolUse`, with `matcher` `read`, `write` and `shell`. The command parses the stdin JSON and checks **only path fields and shell command strings** (never file contents) against `/apps[\\/]shop[\\/]src[\\/]mutants|mutant-manifest\.json|manifest\.sha256|bench[\\/]\.private|S03-mutation-engine|steering[\\/]mutants\.md/i`. On a match it exits with code 2, which blocks the call. Checking contents would wrongly block the seam registry's `import ... from '@/mutants/index'`.

Rules:
- A deny always beats an allow.
- Always start `mutant-maker` as the **main session agent**, never as a sub-agent of `builder`. A parent's stricter policy wins, so `builder`'s deny would block it.
- Do **not** put the mutants folder in `.kiroignore`. That file applies to the whole workspace and would hide the folder from `mutant-maker` too.
- **S03's spec files describe only counts, the spread across rules, and the check procedure.** They never describe individual mutants.
- The S03 diary entry is written by hand afterwards, with counts only.
- The root `.ignore` and `.rgignore` list `apps/shop/src/mutants`, `bench/mutant-manifest.json`, `bench/manifest.sha256`, `bench/.private` and `.kiro/specs/S03-mutation-engine`, so repo-wide searches skip them. `mutant-maker` reads its files by explicit path.
- Be honest in the write-up that this is policy, not a sandbox, and that the isolation is **best-effort**: tests import the mutants at runtime, and a determined agent could still find a way round. The policy is designed so that no agent writing ghost code is shown the mutants.

### 13.3 Hooks

Create workspace hooks through Kiro's hook panel or CLI, so Kiro writes each file in its own current format. The trigger names below are Kiro's documented ones.

File triggers fire **only for the agent's own edits**, not for manual saves. They run after the file is written, so they report failures back to the agent; they can't block the write. Only Pre Tool Use (and Prompt Submit in the IDE) can block.

| Hook | Created in | Trigger | Action |
| --- | --- | --- | --- |
| `pbt-on-save` | S01 | File Save, matching `packages/` | Shell: run that package's property tests in fast mode (100 runs) |
| `contract-guard` | S02 | File Save, matching `apps/shop/` | Shell: run the clean-shop contract suite. Exit non-zero on any failing rule, so the failure goes back to the agent to fix before it continues |
| `mutant-check` | S02 (by builder; disabled until S03, when Lindokuhle switches it on in the Kiro hook panel) | File Save, matching `apps/shop/src/mutants/` | Shell: `pnpm --filter @poltergeist/scorer mutant-check`, a generic script that reads the manifest at runtime and prints counts only. In S03 it checks, for each manifest entry, that with `{mutantIds:[id]}` exactly the mapped rule's contract tests fail and the clean suite passes. In S05 the builder extends it to oracle level: each rule's contract test exposes its actions as a `Step` list, which `mutant-check` replays through the `PlaywrightDriver` on `{mutantIds:[id]}` and on `{clean:true}`, checking that a mapped oracle fires only on the mutant. `mutant-maker` then re-runs it once |
| `smoke-haunt` | S06 | Post Task Execution | Shell: `pnpm haunt:smoke`: 1 committed seed, `--budget 15` per ghost, on 3 non-public mutants (the first three by sorted id). It must finish in under 300 s; hook timeout 600 s. Prints **only the aggregate kill rate**, never mutant ids or rules. It compares its aggregate kill rate with `bench/smoke-baseline.json` (one number, no ids or rules). That file is written once, by `pnpm haunt:smoke --record` at the end of S06 after the gate passes, and re-recorded at the end of S07. Until it exists, the hook prints the rate and exits 0. A non-zero exit when the rate drops below it sends the error to the agent. `haunt:smoke` starts its own shop: it runs `next build` if there's no build (build time excluded from the 300 s), then `next start` on port 3000 with `BENCH_MODE=1`, waits for `/api/health`, and stops the server on exit |
| `self-haunt` | S10 | File Save, matching `apps/seance/` | Shell: run the Night Owl against the Séance Room itself and report any axe violation |
| `diary` | S01 | Post Task Execution | Agent prompt starting: "If the active spec is S03-mutation-engine, reply 'skipped' and change nothing." Otherwise append an entry to `docs/kiro-diary.md` using the Appendix D template (uses credits) |
| `protect-mutants` | S01 | Pre Tool Use (inline in agents, §13.2) | Blocks reads and writes of mutant paths |

**Outside Kiro:**
- A git pre-commit hook (via `simple-git-hooks`) runs only the fast contract suite and the property tests in fast mode. It never runs the slow smoke benchmark.
- `pnpm haunt:smoke` also runs in GitHub Actions on every push, from S06 onwards. The Action builds the shop first, and reads the Supabase secret key and `BENCH_SECRET` from GitHub Actions repository secrets (free).
- Kiro has no git-commit trigger, so say so in the write-up.

### 13.4 MCP servers and Powers
- Config: `.kiro/settings/mcp.json`, committed. Secrets appear only as `${GITHUB_TOKEN}`-style environment variables, never literal values. Add every referenced variable to Kiro's **"Mcp Approved Env Vars"** setting, or it won't be expanded. Agents that need MCP set `includeMcpJson: true`.
- **Playwright MCP** (`@playwright/mcp`): explore the shop while writing ghosts. It also powers the baseline.
- **GitHub MCP:** file death certificates as issues on a demo repo, from the dev machine only (never from the hosted app).
- **Supabase:** prefer the Supabase **Power** if it appears in the Powers catalogue, and record it under Powers. Otherwise use the Supabase MCP. Use it to create tables and to confirm RLS is enabled with zero policies.
- **Powers:** in week 1, check the catalogue for testing, Playwright or Supabase powers. Install and record any that fit.

### 13.5 Other Kiro features
- **Specs:** one per module (§14), with requirements in EARS notation. For the write-up, vibe-code the first ghost quickly, then compare it with the spec-driven version.
- **Property-based testing:** §8. PBT is both how Poltergeist is built and what the Glitch does, so lead the write-up with this. Spec PBT is IDE-only.
- **Kiro CLI:** use it interactively on Windows (`kiro-cli chat --agent builder`; `kiro-cli chat --agent mutant-maker` for S03) and compare it with the IDE in the write-up. Headless CLI needs an API key, which is a paid-plan feature, so GitHub Actions runs `pnpm` scripts directly and doesn't need Kiro. Use headless Kiro only if the hackathon credits turn out to allow API-key login.
- **Kiro Crew:** in S06–S07, open the repo in Crew and run one session per ghost, each on its own git branch or worktree, so the sessions don't conflict. In week 1, confirm whether Crew sessions can use `.kiro/agents/ghost-smith`. If they can't, put the ghost-smith rules in the session prompt, or run the four ghosts as parallel `ghost-smith` sub-agents from the CLI or IDE. Stretch: package Poltergeist as a Crew App with a nightly haunting job. Record which surface did what in the diary.
- **Kiro Web (one session):** open the repo in Kiro Web once, for example to run `judge` as a sub-agent, and record how it differed.
- **Checkpoints:** the IDE makes a checkpoint on every prompt automatically. Before a risky refactor, note the checkpoint and record one Restore in the diary. In the CLI, try one rewind and compare. Checkpoints don't cover changes made by shell commands or MCP tools.

## 14. Spec order (build plan; folder names match build order)

| Spec folder | Agent | What it builds | Done when | Target |
| --- | --- | --- | --- | --- |
| `S01-foundation` | builder (+ mutant-maker once for the stub) | Monorepo, Turborepo, TypeScript strict, ESLint, Vitest + fast-check, CI, MIT license, `.kiro/` with agents, steering, `pbt-on-save`, `diary`; `docs/brief.md`; scaffold `apps/shop` with create-next-app (`--src-dir`, alias `@/*` → `./src/*`) and `packages/protocol` exporting the `MutantOverride` type; then mutant-maker writes the empty `src/mutants/index.ts` stub (§6.1) | `pnpm test` is green on Windows; agent files checked against the Kiro docs | 9 Nov |
| `S02-haunted-shop` | builder | Clean shop, seams + static override import, sessions (cookie + path rules), checkout intents, `order_reads`, `/api/possess`, `/api/oracle/*`, `MutantManifest` schema, `BENCH_MODE` (proxy rule 4, bench schema, rate limits off, `{mutantIds}` + `BENCH_SECRET`), contract suite, health route, `contract-guard`, `mutant-check` script (disabled) | Contract suite + P4/P5 pass. **Automated cross-site check:** serve the shop over HTTPS with `next dev --experimental-https` on `https://localhost:3000`, and a minimal test parent page on `http://127.0.0.1:3001` (a different site), with `SEANCE_ORIGIN=http://127.0.0.1:3001` for this test. The session must survive in the iframe in Playwright Chromium (including a fresh context, `ignoreHTTPSErrors: true`) and Firefox. Safari 26 (macOS/iOS) is a **manual** check by Lindokuhle against the deployed production URLs, recorded in the diary; it's not a Kiro task and doesn't block the next spec | 13 Nov |
| `S03-mutation-engine` | **mutant-maker** | ≥ 40 overrides, ≥ 3 non-public per rule, 3 public demo mutants, manifest + committed hash | `mutant-check` green (rule-level check) | 15 Nov |
| `S04-ghost-core-scorer` | builder | Driver interface, `FakeDriver`, all 10 oracles, recorder, replay, shrinker, scorer-core (kill maths + manifest reader, no UI) | P1, P2, P7 pass on the `FakeDriver` | 17 Nov |
| `S05-playwright-cli` | builder | PlaywrightDriver, CLI (with a `--bench` flag), ownership check, Markdown output, scorer benchmark runner (`pnpm bench:run --mutants all\|<n> --seeds <list>`; stdout is per-rule `Cn killed/tested` lines plus the overall rate only), `pnpm haunt:smoke` (§13.3: 1 seed, 15 s per ghost, 3 fixed non-public mutants, aggregate output only), oracle-level `mutant-check`, baseline harness + `bench/checklist.md` | The CLI haunts the local shop; `bench:run` completes on 3 mutants; the baseline harness completes one dry run on `{clean:true}` (§10); mutant-maker re-runs `mutant-check` green | 19 Nov |
| `S06-ghosts-impatient-fraudster` | ghost-smith | Two ghosts, `smoke-haunt` | Scorer-core shows ≥ 50% kills on C1–C7 and C11 mutants; P3 holds | **21 Nov (gate)** |
| `S07-ghosts-nightowl-glitch` | ghost-smith | Two ghosts, shrinking | ≥ 50% kills on C8–C10 and C12 mutants; P3 holds | 23 Nov |
| `S08-benchmark-baseline` | builder | Finish the baseline runs (started after S05), full Poltergeist benchmark, results JSON, scoreboard data | Results committed and published, whatever the outcome (a labelled subset if quota ran short) | **25 Nov (gate)** |
| `S09-dom-driver-bridge` | builder | DomDriver RPC, haunt runtime, ghost hands, round-robin demo mode | P6, P8 pass; smooth ghost hands in the S02 automated cross-site check (Chromium, Firefox); Safari is the manual check | 27 Nov |
| `S10-seance-core` | builder | Possession + Ledger views, the 3 hero victim views, scoreboard, visitor scoping, `self-haunt` | Passes its own Night Owl | 29 Nov |
| `S11-certificates` | builder | Certificates, generated tests, GitHub issue export, scorer's per-oracle regression runner | P9 passes; every oracle's regression test fails on a mapped mutant and passes clean | 30 Nov |
| `S12-seance-extras` | builder | Mansion view, second-wave victim views | Animated, or static cards if behind (see the cut order below) | 30 Nov |
| `S13-landing` | builder | Static landing page on GitHub Pages: pricing hypothesis labelled research, demo link, waitlist via GitHub Discussions | No checkout or payment links anywhere | 30 Nov |
| — | — | Freeze | Video, write-up, blog post, social post, submission | 1–3 Dec |

**Gate rule:** if a gate is missed, cut in this order:
1. Crew App
2. npm publish
3. S12 extras (Mansion becomes a static coverage list; second-wave victim views become static cards)
4. Ghost hands become simple coloured dots

**Never cut:** the scoreboard, the benchmark, the 3 hero victim views or the video.

## 15. Out of scope (do not build)

- Real payments, or anything sold
- Accounts, sign-in or credentials of any kind
- Haunting sites the user doesn't own
- Mobile apps
- A remote haunting server for arbitrary URLs (the CLI covers real sites)
- Billing
- Any 3D

## 16. Safety and responsibility

- **Per-session sandbox:** the shop's holes affect **only the visitor's own session**.
  - No URL or query content is ever reflected into HTML.
  - Stored text is shown only to the session that wrote it.
  - There are no shared accounts.
  - A path token sent as a top-level link is ignored and gets a fresh empty session (§6). So nobody can send another person a link into a session with planted script.
- **Benign payloads:** they only call `__poltergeistBeacon(token)`. No payload reads cookies or storage, or sends anything anywhere. The CSP (`connect-src`, `img-src`, `form-action`, `base-uri` all limited to self) limits fetch, image, form and base-URI exfiltration. CSP here is defence in depth, not a guarantee; the payloads are safe by construction.
- **Hostile origin:** the shop runs on its own origin inside a sandboxed iframe. The Séance Room treats it as hostile. The origin check only rejects third parties; it doesn't make shop messages trustworthy. So the Séance Room:
  - renders every message field as text only and caps string lengths;
  - never lets a message trigger a privileged action (possess, Supabase writes). Those need a click in the Séance Room plus a server-side check.
- **Visitor isolation in the Séance Room:** findings and certificates are scoped to each visitor's own session, so a visitor who tampers with their own session can't show forged findings to anyone else (§9).
- **Server-only endpoints:** `/api/possess` and `/api/oracle/*` require the server-to-server secret. `{mutantIds}` additionally requires `BENCH_SECRET`.
- **Séance proxy scoping:** Séance server routes that proxy `/api/oracle/*` accept only a `haunting_id` owned by the caller's `seance_session_id`, and look up the shop session server-side. They take `haunting_id` plus a `haunting_sessions.id` owned by that haunting, and every oracle read targets that one session. They never accept a shop session id or token from the browser. All money and privacy oracles always read the session under observation, never the original haunting's session during a replay.
- **Runtime origin check:** `haunt-runtime.js` accepts commands only when `event.origin === SEANCE_ORIGIN` and `event.source === window.parent`.
- **CLI ownership check:** §11.
- **No real personal data:** names, addresses and receipts are synthetic. The "stranger" is a synthetic session we create.
- **Rate limits:** the shop limits checkout, reviews and session creation per visitor IP. Secret-authenticated `/api/possess` and `/api/oracle/*` calls are exempt, because they all come from the Séance server's IPs. The Séance server limits Summon, Possess and LLM narration per visitor IP, read from its own request, before calling the shop. Shop per-IP limits allow at least 5 full hosted hauntings per 10 minutes. Every oracle treats an HTTP 429 as inconclusive (no finding), and a Glitch predicate run that gets a 429 is skipped, not failed.
- **Hosting terms:** in week 1, check that Vercel's fair-use and acceptable-use terms allow a sandboxed, intentionally vulnerable demo. If they don't, host the shop elsewhere for free.
- **Signposting:** `noindex` and `security.txt` (§6) tell scanners and researchers that it's a sandboxed demo.

## 17. Definition of done: the demo video (≤ 2:50, safely under the 3:00 rule)

| Time | Shot |
| --- | --- |
| 0:00–0:10 | Cold open: a phone buzzing twice with double-charge SMS |
| 0:10–0:15 | Title: POLTERGEIST, and the one-line pitch |
| 0:15–0:55 | Summon on the **Demo possession** (labelled on screen): four ghost hands moving at once and **three** victim views (phone, till, blackout). Then 3 s of Summon on the clean shop: 0 findings, every room lit |
| 0:55–1:15 | A death certificate: "who gets hurt", the input shrinking, reproduction rate, the generated test |
| 1:15–1:45 | Possess: a hidden mutant hunted and caught live (any victim view it triggers). Then the scoreboard vs the baseline, with surviving mutants and baseline wins shown |
| 1:45–1:55 | Mansion: lit vs dark rooms (or the coverage list, if S12 was cut) |
| 1:55–2:25 | Kiro proof, two shots: the spec with its PBT properties passing, and a hook stopping a regression (plus a quick flash of the Crew sessions) |
| 2:25–2:50 | Who it's for, why it matters, pricing hypothesis |

The video shows the app running on a desktop browser, with a brief mobile shot. It's public on YouTube and uses royalty-free music only.

## 18. Submission checklist (3 Dec)

- [ ] Category: Frankenstein. Bonus prizes: Best Startup, Best Demo, Blog, Social Blitz (plus Best Kiro Crew App only if a new Crew App is in a public repo under the same GitHub account, with a features write-up)
- [ ] **Do not** enter Best Student Project unless current enrolment can be proven (student email plus proof of enrolment). Enter Best Ghost of Kiroween Past only if you registered for Kiroween 2025
- [ ] Public GitHub repo, MIT license visible in About, `.kiro/` at the root, all commits after 30 Oct, README with setup steps and disclosure of templates and libraries
- [ ] Hosted Séance Room and Haunted Shop production URLs work in Chrome Incognito, Safari and Firefox, on desktop and mobile
- [ ] Landing page live on GitHub Pages
- [ ] Keep-alive workflow running; Supabase project active
- [ ] Judges' credentials field: "None needed"
- [ ] Public YouTube video ≤ 2:50, royalty-free music, no logos, shows the app running
- [ ] Description, plus a Kiro write-up covering every item in §13 (IDE vs CLI vs Web vs Crew, custom agents, hooks, specs vs vibe coding, steering, MCP, PBT, Powers)
- [ ] Founder confirmation, LinkedIn URL, landing page URL
- [ ] Blog post on a third-party platform (DEV, Medium or Hashnode), published by 4 Dec, saying it was written for the Kiroween 2026 hackathon
- [ ] Social post that **starts** with #KiroweenHackathon26 and shares your favourite thing about Kiro and how it changed your approach
- [ ] Confirm the 4,000 Kiro credits were granted (requested in week 1)

---

## Appendix A — Steering files (create exactly these)

### `.kiro/steering/product.md`
```markdown
# Product: Poltergeist
Poltergeist is a crew of AI ghost agents that break web apps the way real people do and show who gets hurt.
Pitch: "Ghosts that break your app before your customers do, and show you who gets hurt."
Users: small product teams without dedicated QA; QA consultancies.
Principles:
- Show harm to a person, not an error message. Every finding maps to a victim view.
- No proof, no animation: only replay-verified findings count or animate.
- Deterministic ghosts, LLM narrator. The LLM never decides what is a bug; oracles do.
- Honest scoring: always show surviving mutants, baseline wins and the oracle→rule map; publish whatever the result.
- Safe by design: sandboxed shop sessions, benign payloads, a hostile-origin model, an ownership check in the CLI.
- Nothing is sold: pricing is a labelled research hypothesis; the landing page is static on GitHub Pages.
Vocabulary: use the glossary in docs/brief.md §4 exactly.
Hackathon: Kiroween 2026, Frankenstein category. Free tiers only. No third-party trademarks. English only.
```

### `.kiro/steering/tech.md`
```markdown
# Tech
- TypeScript strict everywhere. pnpm workspaces (pin "packageManager": "pnpm@<exact>") + Turborepo. Node 22.
- Workspace package names: @poltergeist/<folder name> (e.g. @poltergeist/driver-playwright).
- Apps: Next.js 16 (App Router; request interception lives in proxy.ts) + Tailwind. seance and shop are two separate
  Vercel Hobby projects (separate, cross-site origins). landing is a static export on GitHub Pages.
- Iframe src and allowed origins come from env vars holding the production domains (<project>.vercel.app), never VERCEL_URL.
- Shop CSP: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self';
  img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors <SEANCE_ORIGIN from env>" (+ 'unsafe-eval' in dev only). Never add nonces, hashes or strict-dynamic.
  No X-Frame-Options. X-Robots-Tag: noindex.
- Shop sessions: iron-session sealed token. Cookie __Host-pg_sid (HttpOnly; Secure; SameSite=None; Partitioned; Path=/).
  The /s/[token]/ path token wins when it is under 30 minutes old AND (Sec-Fetch-Dest: iframe OR Sec-Fetch-Site: same-origin);
  proxy.ts then re-sets the cookie and rewrites to the plain route. Any other path token (top-level document, or a cross-site non-iframe request) → fresh empty session.
  BENCH_MODE=1 waives both checks (local only). Build every in-shop URL with shopUrl(path). Create sessions only in proxy.ts
  or Route Handlers.
- Shop dialogs: custom <div role="dialog" aria-modal="true"> with a JS focus trap and a keydown Escape handler; never <dialog>.
- Shop functions: wrap every exported pricing, session, data-access, validation and render function with seam('<module>/<export>', fn).
- Data: Supabase Free. Server-only access with the sb_secret_ key. RLS enabled with zero policies on every table.
  Every shop query is scoped by session_id through the data-access seams. Benchmarks use the bench schema.
- Testing: Vitest + fast-check property tests (100 runs on save, 1000 in CI); Playwright for e2e and the PlaywrightDriver;
  axe-core for accessibility. The Glitch uses fc.check (never fc.assert) with interruptAfterTimeLimit.
- Validation: zod schemas in packages/protocol for every message, step, finding and certificate (safeParse, strip unknown keys).
- LLM: Gemini API free tier. packages/ghost-core/src/llm.ts is only an Llm interface; the Séance Room implements it via its
  server route POST /api/narrate (GEMINI_API_KEY server-only, never NEXT_PUBLIC_, per-IP limits); the CLI has a Node
  implementation. Template fallback for no key, rate limits or per-IP limits. Shop text sent to the LLM is untrusted data. No LLM in the Poltergeist side of the benchmark.
- postMessage: always an explicit targetOrigin; check event.origin AND event.source.
- No paid services. No new dependency without a one-line reason in the spec's design.md.
- Windows 11 + PowerShell is the dev machine: scripts must be cross-platform (node scripts or cross-env, no bash-only commands).
- Never read or write apps/shop/src/mutants/**, bench/mutant-manifest.json, bench/manifest.sha256, bench/.private/** or
  .kiro/specs/S03-mutation-engine/** unless you are the mutant-maker agent (bench/.private is written only by the scorer). Never run repo-wide search, git show, git log -p
  or git diff without excluding those paths.
```

### `.kiro/steering/structure.md`
```markdown
# Structure
apps/seance (Séance Room: ghost-core + DomDriver run here), apps/shop (Haunted Shop + seams + haunt-runtime.js),
apps/landing (static, GitHub Pages)
packages/ghost-core (ghosts, oracles, recorder, replay, shrinker, FakeDriver), packages/driver-dom (DomDriver RPC client +
thin runtime), packages/driver-playwright, packages/cli, packages/protocol (zod + MutantOverride type), packages/scorer
bench/ (baseline prompt, harness, checklist, quota, results; manifest + hash are mutant-maker only), docs/ (kiro-diary.md, writeup.md)
Specs live in .kiro/specs/S01-… to S13-…, numbered in build order.
Rules: ghost-core imports only the Driver interface, never DOM or Playwright APIs. The haunt runtime holds no ghost logic.
Victim views live in apps/seance/src/victims/, one component each. Property tests sit next to the code as *.prop.test.ts.
```

### `.kiro/steering/ghost-impatient.md`
```markdown
# Ghost: The Impatient One
Persona: in a hurry, never waits, clicks everything twice.
Attacks (in order, seeded): double and triple click on every submit (20–150 ms gaps, never 0 ms); reload during checkout;
back after paying, then pay again; close and re-open checkout; abandon midway and return.
Read the checkout intent id from the oracle API (GET /api/oracle/intents); never mint one.
Oracles: DoubleCharge, StateLoss. Hand colour: amber. Narration tone: breathless, short ("Pay. Pay! PAY!").
```

### `.kiro/steering/ghost-fraudster.md`
```markdown
# Ghost: The Fraudster
Persona: wants something for nothing; reads the contract looking for loopholes.
Attacks: quantities -3, 0, 0.5, 11, 1e9; stacking and reusing coupons; tampered prices in API bodies;
requesting the stranger's order id stranger-order-fixed; beacon-only payloads in every text field, in event-handler form
(<img src=x onerror=…>, <svg onload=…>) as well as <script>. Payloads ONLY call window.__poltergeistBeacon(token):
never read cookies or storage, never send anything anywhere.
Oracles: TillLoss, QuantityBreach, PrivacyLeak, ScriptExecution. Hand colour: green.
Narration tone: sly, quiet ("Let's see if the till notices.").
```

### `.kiro/steering/ghost-nightowl.md`
```markdown
# Ghost: The Night Owl
Persona: navigates by keyboard and screen reader only.
Attacks: tab walk of every page and open dialog (DomDriver follows the Tab rules in brief §5.2, with no dialog special-casing;
Playwright uses real keys); check focus stays inside open dialogs, a close control is reachable, Escape closes, and focus
returns to the opener; axe-core scan of every state; read accessible names aloud for the Blackout view.
Oracles: A11yViolation, FocusFailure. Hand colour: pale blue. Narration tone: calm, factual ("Three buttons. None have names.").
```

### `.kiro/steering/ghost-glitch.md`
```markdown
# Ghost: The Glitch
Persona: chaos with a maths degree.
Attacks: fast-check arbitraries for every input. Contract-valid text (brief Appendix B, C10: ≤100 code points, well-formed,
no U+0000–U+001F) must round-trip exactly. Out-of-contract input (101–500 code points, control characters, lone surrogates,
boundary and malformed numbers) must get a friendly 4xx, never a 5xx or crash.
Run with fc.check (never fc.assert) and interruptAfterTimeLimit = remaining budget. failed === false (even if interrupted)
means no finding. On failure take details.counterexample and re-verify. One fresh session per run (freshSession({cloneOf})) in the CLI and
benchmark; in hosted mode never call freshSession; use driver.request in the shared session (brief §7.2).
Say "shrunk failing input", never "smallest".
Oracles: Crash, TextCorruption, TillLoss. Hand colour: violet with a flicker. Narration tone: glitchy ("41 characters did it.").
```

### `.kiro/steering/mutants.md` (the front matter must be the very first lines)
```markdown
---
inclusion: manual
---
# Mutant maker rules
Load this file only through the mutant-maker agent's resources.
Write overrides in apps/shop/src/mutants/ only, exported from apps/shop/src/mutants/index.ts as MutantOverride[]
(type in packages/protocol: { id, seam, impl, public }). Each override replaces exactly one existing seam and breaks exactly ONE
contract rule (brief Appendix B). Each must be detectable by at least one oracle mapped to that rule (brief §7.1a).
At least 3 NON-public per rule, ~40 total. Ids are random hashes. The manifest must pass the MutantManifest zod schema in packages/protocol. Pick 3 public demo mutants (one each for C1, C4, C8) and flag them
"public": true. Set public on each override to match its manifest entry. Record id → rule (+ public flag) in bench/mutant-manifest.json and its SHA-256 in bench/manifest.sha256.
S03 spec files describe only counts, the spread across rules and the check procedure, never individual mutants.
Never describe mutants anywhere outside the mutant-maker paths.
Mutants must be realistic mistakes a developer could make (a removed check, an off-by-one, a missing idempotency check,
a missing session filter, unescaped rendering, a missing label, a broken focus trap), never absurd sabotage.
```

## Appendix B — The shop contract (what correct looks like)

| Rule | The shop must… |
| --- | --- |
| C1 | Record exactly one customer debit per checkout intent. The server mints one Idempotency-Key per cart version when checkout opens, and reuses it across clicks, reloads, back navigation and re-opened dialogs. (The Pay button also disables after the first click, as a courtesy only; correctness never relies on it.) |
| C2 | Never lose a paid order or allow paying again after a refresh or back navigation |
| C3 | Accept only whole-number quantities from 1 to 10 |
| C4 | Allow at most one coupon per order; a discount never exceeds the subtotal. A second coupon on the same cart is rejected with a friendly 4xx and the first coupon stays |
| C5 | Take prices from the server only; ignore prices sent by the client |
| C6 | Compute totals ≥ 0, rounded half-up to cents once at the end |
| C7 | Render all user text (names, addresses, reviews) as text, never as HTML |
| C8 | Give every interactive control an accessible name and every product image alt text |
| C9 | Keep focus inside an open dialog, make a close control reachable, close on Escape (through the dialog's own key handler), and return focus to the opener afterwards |
| C10 | Accept names, addresses and reviews of up to 100 Unicode code points (`[...s].length`) of well-formed text with no control characters (U+0000–U+001F), and store and show them **exactly** as submitted: no trimming, no normalising, no truncation. Anything else gets a friendly 4xx |
| C11 | Let a session see and act on its own orders only |
| C12 | Never return a 5xx for any user input; reject bad input with a friendly error |

## Appendix C — Baseline (`bench/baseline-prompt.md`, `bench/baseline-harness.ts`, `bench/checklist.md`)

**Prompt:**
```
You are testing a web shop at {URL} using the Playwright MCP tools. You have {BUDGET} minutes of active time and
at most {MAX_CALLS} tool calls. Here are the rules the shop must follow: {CONTRACT_RULES}.
Find as many bugs as you can that break these rules. For each bug, name the rule it breaks
and give the exact steps to reproduce it.
```

**Harness:** our own small script (about 150 lines). It uses an `@modelcontextprotocol/sdk` client over stdio to `npx @playwright/mcp@<pinned version> --headless --isolated --browser chromium` (check the accepted `--browser` values in the pinned version's `--help`; use `chrome` if `chromium` is rejected), and `@google/genai` function calling with a free AI Studio key.
- It logs every MCP tool call as a `Step`, so the replayer and oracles can score the baseline's trace (§10 step 3a).
- Active time excludes rate-limit waits. It backs off and retries on 429s.
- Pinned versions make it reproducible and free.
- Record the harness commit, the `@playwright/mcp` and Playwright versions, and the model id in each results file.

**Checklist (`bench/checklist.md`):** for each contract rule, what a report must state to earn rule-credit: the rule named, the action taken, and the observed wrong result. It's committed before the first scored run.

## Appendix D — Kiro diary entry template (`docs/kiro-diary.md`)

```
## 2026-11-DD · Spec Sxx · task N
Kiro surface: IDE / CLI / Web / Crew · Agent: builder / ghost-smith / judge
Feature used: spec / steering / hook / PBT / MCP / power / checkpoint
What happened (2–3 lines):
What it changed for the build (1 line):
Screenshot: docs/img/YYYYMMDD-x.png
```

## Appendix E — Setup (Windows 11, PowerShell)

```powershell
Set-ExecutionPolicy -Scope CurrentUser RemoteSigned
irm 'https://cli.kiro.dev/install.ps1' | iex
kiro-cli --version          # must be 3.0.0 or later; run `kiro-cli update` if not
kiro-cli login
npm install -g pnpm@latest  # then pin "packageManager": "pnpm@<exact>" in package.json
pnpm install
pnpm --filter @poltergeist/driver-playwright exec playwright install chromium
# Baseline browser: install the Chromium build that matches the Playwright version the pinned @playwright/mcp depends on
npx -y playwright@<that version> install chromium
```

**Kiro Crew on Windows:** install the signed Windows desktop app. It bundles a tested Kiro CLI and completes device-code sign-in itself. If a session won't start, follow https://kiro.dev/docs/crew/troubleshooting/.

**Week-1 checks:**
- Request the 4,000 free Kiro credits on the Devpost Resources tab now (deadline 1 Dec, 12:00 PT)
- Kiro Crew can use `.kiro/agents/ghost-smith`
- Hackathon credits allow API-key (headless) login
- Gemini free limits recorded in `bench/quota.json`
- Vercel terms allow the sandboxed demo
- Supabase Power is available
- npm `lk-nyoka` name (stretch only)
