# S02 — Haunted Shop: Requirements

**Spec:** S02-haunted-shop  
**Agent:** builder  
**Target done date:** 13 Nov 2026  
**Source of truth:** docs/brief.md §6, §6.1, §7.1 (oracle data needs), §12, §13.3, §16, Appendix B (contract C1–C12)  
**Prepared:** requirements and design drafted with Claude (planning/review) on 9 Nov 2026; Kiro generates tasks.md and writes all code and tests. The session/proxy design in design.md §5 was prototyped and tested on Next.js 16.4.5 before this spec was written.

The Haunted Shop is a small, believable online store that obeys the 12 contract rules exactly. In S02 it is **clean**: no mutants exist yet. S02 also builds every hook later specs need to break it on purpose (seams, possession, oracle API), without any knowledge of which mutants will exist.

---

## 1. Catalogue and cart

- REQ-1.1: THE shop SHALL sell exactly 8 products, each with a fixed id, name, price in integer USD cents, description and image with alt text (design §6).
- REQ-1.2: THE cheapest product SHALL cost more than every fixed-amount coupon, so a clean order total is always greater than 0.
- REQ-1.3: Each session SHALL have one active cart, stored server-side with a `version` that increases by 1 on every change.
- REQ-1.4: WHEN a cart line is added or changed, THE shop SHALL accept the quantity only if it is a whole number from 1 to 10; otherwise it SHALL return a friendly 4xx and leave the cart unchanged. (C3)
- REQ-1.5: THE cart SHALL store product ids and quantities only. Any price, total or discount sent by the client SHALL be ignored. (C5)
- REQ-1.6: WHEN a coupon is applied to a cart that already has a coupon, THE shop SHALL reject it with a friendly 4xx and keep the first coupon. (C4)
- REQ-1.7: THE shop SHALL offer exactly two coupons: `SPOOKY5` ($5.00 off) and `HAUNT15` (15% off).

## 2. Pricing

- REQ-2.1: THE order total SHALL be computed on the server only, from canonical catalogue prices: subtotal = Σ(price × qty); total = subtotal − min(discount, subtotal), rounded half-up to whole cents **once**, at the end. (C5, C6)
- REQ-2.2: THE total SHALL never be negative. (C6)
- REQ-2.3: For any valid cart (1–10 of each product, at most one valid coupon), WHEN it is checked out on the clean shop, THE total SHALL equal the REQ-2.1 formula and SHALL be ≥ 0. (P4, part 1)

## 3. Checkout intents and payment

- REQ-3.1: WHEN checkout opens, THE server SHALL return the checkout intent for the cart's current version. Its id SHALL be `cart_id:version`, it SHALL be stored in the `intents` table, and opening checkout again on the same cart version SHALL return the same id. Ghosts and clients never mint intent ids.
- REQ-3.2: `POST /api/checkout` SHALL require an `Idempotency-Key` header equal to an intent id that belongs to the caller's session and matches the cart's current version; otherwise it SHALL return a friendly 4xx.
- REQ-3.3: THE server SHALL record **exactly one** customer debit per intent, however many times Pay is pressed or the request is repeated, including concurrent requests. (C1, P4 part 2)
- REQ-3.4: WHEN a paid intent is submitted again, THE server SHALL return the existing order with 200 and SHALL NOT charge again.
- REQ-3.5: WHEN payment succeeds, THE server SHALL write in one logical step: one customer debit (with a "Bank" SMS memo), one till credit, and one order row (intent id, items, accepted coupon codes, total). It SHALL then start a new empty cart.
- REQ-3.6: WHEN the checkout or confirmation page is refreshed or navigated back to after payment, THE shop SHALL show the existing order and SHALL NOT offer Pay again for that intent. (C2)
- REQ-3.7: THE Pay button SHALL disable itself after the first click, as a courtesy only. Correctness SHALL NOT depend on it. (C1)
- REQ-3.8: THE shop SHALL have no refund feature. The till ledger SHALL only ever receive credits on the clean shop.

## 4. Orders and privacy

- REQ-4.1: A session SHALL be able to read and list only its own orders. Requesting another session's order SHALL return 404. (C11)
- REQ-4.2: WHEN `GET /api/orders/:id` or the `/orders/[id]` page returns an order to the caller, THE shop SHALL record one `order_reads` row (session id, order id) **after** the data-access seam returns, outside any seam, and only when an order row is actually sent.
- REQ-4.3: THE stranger session (`is_stranger = true`) and its order `stranger-order-fixed` SHALL be seeded once per store (migration, or memory-store start-up), SHALL be excluded from cleanup, and SHALL never be re-created.

## 5. User text: names, addresses, reviews

- REQ-5.1: THE shop SHALL accept a name, address or review only if it is well-formed Unicode (`String.prototype.isWellFormed()`), has 1–100 code points (`[...s].length`), and contains no character U+0000–U+001F; otherwise it SHALL return a friendly 4xx. (C10)
- REQ-5.2: THE shop SHALL store accepted text exactly as submitted: no trimming, no normalisation, no truncation. (C10)
- REQ-5.3: THE shop SHALL render all user text as text, never as HTML. (C7)
- REQ-5.4: For any string valid under REQ-5.1, WHEN it is submitted as a name, address or review on the clean shop, THE rendered `textContent` SHALL equal the input exactly, and THE page SHALL never call `window.__poltergeistBeacon`. For any invalid string, THE shop SHALL return a friendly 4xx. (P5)
- REQ-5.5: Reviews SHALL be visible only to the session that wrote them.

## 6. Accessibility and dialogs

- REQ-6.1: Every interactive control SHALL have an accessible name, and every product image SHALL have meaningful alt text. axe-core SHALL report zero violations for `button-name`, `image-alt`, `svg-img-alt`, `input-image-alt`, `label`, `select-name`, `link-name`, `aria-command-name` and `aria-input-field-name` on every page and dialog state. (C8)
- REQ-6.2: THE checkout dialog SHALL be a custom `<div role="dialog" aria-modal="true">` (never native `<dialog>` or `showModal()`). While it is open, Tab and Shift+Tab SHALL keep focus inside it, a close control SHALL be reachable by Tab, Escape SHALL close it through the dialog's own `keydown` handler, and closing SHALL return focus to the element that opened it. (C9)

## 7. Errors

- REQ-7.1: THE shop SHALL never return a 5xx for any user input. Invalid input SHALL get a friendly 4xx JSON body `{ error: { code, message } }`. (C12)
- REQ-7.2: Every API route SHALL be wrapped in one shared handler that maps validation errors to 4xx and lets only genuine bugs surface as 500.

## 8. Sessions

- REQ-8.1: Each session SHALL be a sealed iron-session token holding exactly: session id, active mutant ids, issue time and Séance haunting id. THE token SHALL be immutable after it is minted; no route SHALL add fields to it or re-seal it with new data.
- REQ-8.2: All mutable per-session state (cart, coupon, cart version, intents) SHALL live in the store, keyed by session id.
- REQ-8.3: THE session cookie SHALL be `__Host-pg_sid` with `HttpOnly; Secure; SameSite=None; Partitioned; Path=/`.
- REQ-8.4: `src/proxy.ts` SHALL apply these rules in order (brief §6):
  1. A path token `/s/<token>/…` is honoured only if it unseals, was issued in the last 30 minutes, AND the request has `Sec-Fetch-Dest: iframe` or `Sec-Fetch-Site: same-origin`. It then wins over the cookie: the cookie is re-set to it and the request is rewritten to the un-prefixed path.
  2. Any other path token (top-level document, cross-site non-iframe, expired, or unsealable) is ignored. If there is no valid cookie either, a fresh, empty, clean session is minted.
  3. With no path token, the cookie is used if it unseals.
  4. With `BENCH_MODE=1`, rule 1's destination and age checks are waived.
- REQ-8.5: THE proxy SHALL pass the active token to the app only through the request header `x-pg-session`, and SHALL delete any `x-pg-session` header sent by the client first.
- REQ-8.6: Every in-shop link, redirect and client `fetch` SHALL be built through one `shopUrl(path)` helper that keeps the `/s/<token>` prefix whenever the current URL has one.
- REQ-8.7: Sessions SHALL be minted only in `proxy.ts` or Route Handlers, never in a page component.

## 9. Seams and overrides

- REQ-9.1: Every exported pricing, cart, checkout, order, review, text-validation and render function in the shop SHALL be wrapped with `seam('<module>/<export>', fn)` (or `seamComponent` for render seams). The wrapping SHALL be uniform, so the seam list reveals nothing about which seams are mutated.
- REQ-9.2: WHEN a seam is called, THE registry SHALL look up the active mutant ids for the current request and, if an override with an active id is registered for that seam key, call `override.impl(original, ...args)`; otherwise it SHALL call the original.
- REQ-9.3: THE registry SHALL import overrides **statically** from `@/mutants/index` (`overrides: MutantOverride[]`). Builder SHALL NOT read or write anything in `apps/shop/src/mutants/`.
- REQ-9.4: Render seams SHALL be resolved in server components only, so client-side mutants arrive as server-rendered variants.
- REQ-9.5: THE registry SHALL export `listSeamKeys()`, used by `mutant-check` to reject overrides that name an unknown seam.
- REQ-9.6: Data access SHALL apply the session filter inside seam code (e.g. `orders/getOrderForSession` checks `order.sessionId === sid`), not in the store query, so C11 mutants can weaken it.

## 10. Possession and the oracle API (server-only)

- REQ-10.1: `POST /api/possess`, `GET /api/oracle/ledgers`, `GET /api/oracle/orders` (`?reads=1` adds order reads), `GET /api/oracle/intents` and `GET /api/oracle/products` SHALL require the header `x-poltergeist-secret` equal to `SEANCE_SERVER_SECRET`, compared in constant time; otherwise they SHALL return 404.
- REQ-10.2: `POST /api/possess` SHALL accept exactly one of `{clean:true}`, `{count:1..3}`, `{demo:true}`, `{cloneOf:<sealed token>}` or `{mutantIds:[…]}`, and SHALL return only `{ token }`, an opaque sealed token. `{mutantIds}` SHALL additionally require the header `x-poltergeist-bench` equal to `BENCH_SECRET`, and SHALL be accepted only when `BENCH_MODE=1`.
- REQ-10.3: `{count}` SHALL pick only overrides with `public === false`; `{demo}` SHALL pick the overrides with `public === true`. THE shop SHALL never read the manifest. WHEN not enough overrides exist (e.g. in S02, with none), possess SHALL return 409 `{ error: { code: "no_mutants" } }`.
- REQ-10.4: Oracle routes SHALL read the session named by the header `x-pg-observe` (a sealed token), the "session under observation". They SHALL never use the caller's own cookie.
- REQ-10.5: `GET /api/oracle/products` SHALL return prices and coupon values computed with **no** mutants active.

## 11. Store, data model and housekeeping

- REQ-11.1: All persistence SHALL go through one `Store` interface with two implementations: `MemoryStore` (tests, `next dev` without Supabase env, and `BENCH_MODE`) and `SupabaseStore` (deployed). This replaces the brief's separate Supabase `bench` schema.
- REQ-11.2: Intent claiming SHALL be atomic in both stores: claiming an already-claimed intent SHALL return `false`. In Supabase this uses a unique key on `intent_claims.intent_id`, **not** a constraint on the ledger, so C1 mutants (which bypass the claim) can still double-charge.
- REQ-11.3: THE Supabase migration SHALL create the tables in design §9, enable RLS with **no policies** on every table, revoke `anon` and `authenticated` access, seed the stranger session, and schedule a daily `pg_cron` cleanup of rows older than 24 h (except the stranger).
- REQ-11.4: Only server code SHALL talk to Supabase, using `SUPABASE_SECRET_KEY` (`sb_secret_…`). No Supabase key SHALL be sent to the browser.
- REQ-11.5: `GET /api/health` SHALL perform one real store read and return `{ ok: true }`.

## 12. Headers, safety and rate limits

- REQ-12.1: Every shop response SHALL send `Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self'; frame-ancestors <SEANCE_ORIGIN>`, plus `'unsafe-eval'` in `script-src` in development only. It SHALL NOT add script nonces, hashes or `strict-dynamic`.
- REQ-12.2: THE shop SHALL send `X-Robots-Tag: noindex` and SHALL NOT send `X-Frame-Options`.
- REQ-12.3: THE shop SHALL serve `/.well-known/security.txt` stating it is an intentionally vulnerable, per-session sandboxed demo.
- REQ-12.4: THE shop SHALL NOT reflect any URL, query or header content into HTML.
- REQ-12.5: THE shop SHALL rate-limit checkout, reviews and session minting per client IP, allowing at least 5 full hosted hauntings per 10 minutes. Requests authenticated with `x-poltergeist-secret` SHALL be exempt. `BENCH_MODE=1` SHALL disable rate limits. A limited request SHALL get 429 `{ error: { code: "rate_limited" } }`.

## 13. Protocol additions (`packages/protocol`)

- REQ-13.1: `packages/protocol` SHALL export the zod schema `MutantManifest` exactly as brief §6.1 specifies, plus `PossessOptions`, `ApiError` and the oracle response schemas.
- REQ-13.2: THE `MutantOverride` doc comment SHALL state that `impl` is called as `impl(original, ...args)`.

## 14. Hooks and scripts

- REQ-14.1: A `contract-guard` hook SHALL run the shop's contract suite on agent File Save under `apps/shop/`, and exit non-zero on any failing rule.
- REQ-14.2: `pnpm --filter @poltergeist/scorer mutant-check` SHALL exist as a generic script that reads `bench/mutant-manifest.json` at runtime and prints **counts only**. In S02, with no manifest, it SHALL print `no manifest yet` and exit 0. The `mutant-check` hook SHALL be created **disabled**.

## 15. Cross-site check

- REQ-15.1: An automated check SHALL serve the shop over HTTPS (`next dev --experimental-https` on `https://localhost:3000`) inside an iframe on a parent page at `http://127.0.0.1:3001`, and SHALL pass in Playwright Chromium (fresh context) and Firefox: a cart change survives an iframe reload.
- REQ-15.2: Safari 26 is a manual check by Lindokuhle on the deployed URLs and does not block S03.

## 16. Acceptance criteria

- AC-1: `pnpm test` exits 0 on Windows; the shop's contract suite covers every rule C1–C12 with at least one test named `[Cn] …`, and P4/P5 property tests pass.
- AC-2: `pnpm lint` and `pnpm --filter @poltergeist/shop typecheck` exit 0.
- AC-3: `pnpm --filter @poltergeist/shop build` exits 0.
- AC-4: `pnpm --filter @poltergeist/shop e2e:crosssite` passes in Chromium and Firefox.
- AC-5: No file under `apps/shop/src/mutants/` was read or written by builder.
- AC-6: `pnpm --filter @poltergeist/scorer mutant-check` prints `no manifest yet` and exits 0.
- AC-7: CI is green on ubuntu-latest and windows-latest.
