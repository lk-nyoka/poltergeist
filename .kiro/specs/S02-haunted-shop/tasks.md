# S02 — Haunted Shop: Tasks

**Spec:** S02-haunted-shop  
**Agent:** builder  
**Design order:** follows §18 exactly — do not reorder.  
**Hard rule:** never read or write `apps/shop/src/mutants/` at any point in this spec.  
**Tested snippets:** design §4 (session.ts), §5 (proxy.ts), §7 (registry.ts) — implement around them exactly; do not rewrite.

---

- [x] 1. Add dependencies and apply config changes
  - Add to `apps/shop/package.json` dependencies: `iron-session@9.0.1`, `zod@4.6.7`, `@supabase/supabase-js@2.119.0`
  - Add to `apps/shop/package.json` devDependencies: `@playwright/test@1.65.0`, `axe-core@4.14.0`, `jsdom@31.0.0`, `@testing-library/react@16.3.3`, `@testing-library/dom@10.4.2`
  - Add `zod@4.6.7` to `packages/protocol/package.json` dependencies
  - Run `pnpm install` — must exit 0
  - Remove `cacheComponents: true` and `partialPrefetching: true` from `apps/shop/next.config.ts` (design §2). Leave `apps/seance/next.config.ts` unchanged
  - Replace `apps/shop/vitest.config.ts` with the `mergeConfig` form that adds the `@/` alias (design §14):
    ```ts
    import { fileURLToPath } from 'node:url';
    import { mergeConfig } from 'vitest/config';
    import shared from '../../vitest.shared';
    export default mergeConfig(shared, {
      resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
    });
    ```
  - Create `apps/shop/.env.local` by copying `.env.example` (gitignored; no Supabase account needed yet)
  - Verify `pnpm test` still exits 0 after all config changes

- [x] 2. Session token, proxy, shopUrl — with unit tests
  - Create `apps/shop/src/lib/session.ts` — exactly the tested snippet from design §4 (no changes)
  - Create `apps/shop/src/proxy.ts` — exactly the tested snippet from design §5 (no changes). Export `config` for Next.js middleware
  - Rename or update `apps/shop/src/middleware.ts` (or create it) to import and re-export from `./proxy`; Next.js middleware entry point is `src/middleware.ts`
  - Create `apps/shop/src/lib/shop-url.ts` with `shopUrlServer(path)` (reads `x-pg-prefix` header via `next/headers`) and `shopUrlClient(path)` / `useShopUrl()` hook (reads `location.pathname`), per design §5.3
  - Write unit tests for the proxy rules table in design §5 (all 7 cases). Call the `proxy()` function directly with synthetic `NextRequest` objects. Use `// @vitest-environment node`
  - Write session unit tests: `sealToken` → `unsealToken` round-trips; corrupted token returns null; missing `SESSION_SECRET` in production throws
  - Run `pnpm --filter @poltergeist/shop test` — must pass

- [x] 3. Seam registry and context — with registry tests
  - Create `apps/shop/src/seams/registry.ts` — exactly the tested snippet from design §7 (no changes)
  - Create `apps/shop/src/seams/context.ts` with `withRequest()`, `withPage()`, `cleanContext()`, `observeContext()` per design §7.2
  - Create `apps/shop/src/seams/all.ts` — a barrel that imports every seam-defining module (initially empty; updated as domain files are created)
  - Write registry unit tests: `seam()` calls the original when no mutant is active; calls override when its id is in the context; `_setOverridesForTest` is used in tests only; duplicate seam key throws; `listSeamKeys()` returns sorted keys
  - Run `pnpm --filter @poltergeist/shop test` — must pass

- [x] 4. Protocol additions — with property tests
  - Create `packages/protocol/src/manifest.ts` exporting `MutantManifest` zod schema (design §12)
  - Create `packages/protocol/src/possess.ts` exporting `PossessOptions` zod discriminated union of all 5 shapes, each `.strict()` (design §10.2, §12)
  - Create `packages/protocol/src/api.ts` exporting `ApiError` body schema and oracle response schemas (design §12)
  - Update `MutantOverride` doc comment: `impl` is called as `impl(original, ...args)`; for render seams, `impl(original)` returns a component (REQ-13.2)
  - Update `packages/protocol/src/index.ts` to re-export everything from the new files
  - Write a property test for each schema in `packages/protocol/src/`: a valid manifest round-trips through `MutantManifest.parse`; all five `PossessOptions` shapes validate; invalid shapes are rejected
  - Run `pnpm --filter @poltergeist/protocol test` — must pass with all protocol property tests

- [x] 5. Store: types, MemoryStore, and store selector — with concurrency test
  - Create `apps/shop/src/store/types.ts` with the full `Store` interface from design §9.1, plus `Cart`, `Intent`, `Order`, `LedgerEntry`, `Review` types
  - Create `apps/shop/src/store/memory.ts` implementing the full `Store` interface:
    - Module-level singleton
    - Seeds stranger session (`sid='stranger'`) and order `stranger-order-fixed` on first use
    - `claimIntent(id)` is atomic (Map-based, no async gap)
    - Exports `_resetMemoryStoreForTest()` that re-seeds the stranger; only `*.test.ts` may call it
    - Customer start balance 50000 cents, till start balance 100000 cents (balances computed as start + Σ entries)
  - Create `apps/shop/src/store/index.ts` — `getStore()` picks: `BENCH_MODE=1` → MemoryStore; `SUPABASE_URL`+`SUPABASE_SECRET_KEY` both set → SupabaseStore (imported lazily); otherwise MemoryStore
  - Write the `claimIntent` concurrency test: 5 concurrent calls with the same id → exactly 1 returns `true`
  - Run `pnpm --filter @poltergeist/shop test` — must pass

- [ ] 6. Domain: text, catalogue, pricing, cart, checkout, orders, reviews
  - Create `apps/shop/src/lib/text.ts` with `validateText` seam — exactly the snippet from design §8.5 (no changes)
  - Create `apps/shop/src/domain/catalogue.ts` with all 8 products and 2 coupons from design §6.1 (plain data, not a seam)
  - Create `apps/shop/src/domain/pricing.ts` with `subtotal`, `discount`, `total` seams from design §6.2 (exact snippets; the `1e-9` guard is intentional)
  - Create `apps/shop/src/domain/cart.ts` with all 5 cart seams (`cart/get`, `cart/addLine`, `cart/setQty`, `cart/removeLine`, `cart/applyCoupon`), validation rules and `ApiError` throws from design §8.1
  - Create `apps/shop/src/domain/checkout.ts` with `checkout/open`, `checkout/pay`, `checkout/claim` seams and the 7-step pay flow from design §8.2
  - Create `apps/shop/src/domain/orders.ts` with `orders/getForSession` and `orders/listForSession` seams; session check (`o.sid === sid`) lives inside the seam per design §8.3 / REQ-9.6
  - Create `apps/shop/src/domain/reviews.ts` with `reviews/add` and `reviews/list` seams and render seam `render/ReviewBody` per design §8.4
  - Update `apps/shop/src/seams/all.ts` to import all domain files so `listSeamKeys()` is complete
  - Run `pnpm --filter @poltergeist/shop test` — must pass (domain logic is now under test via the store; no routes yet)

- [ ] 7. HTTP utilities and public API routes
  - Create `apps/shop/src/lib/http.ts` with `handle()`, `ApiError`, and `requireSecret()` per design §10.1–§10.2
  - Create `apps/shop/src/lib/rate-limit.ts` with in-memory token buckets (checkout 60/10 min, reviews 60/10 min, session minting 120/10 min) per design §11
  - Create all public API route handlers (design §10.1): `GET /api/products`, `GET /api/cart`, `POST /api/cart`, `POST /api/checkout/open`, `POST /api/checkout`, `GET /api/orders/[id]`, `GET /api/reviews`, `POST /api/reviews`, `GET /api/health`
  - All routes wrapped in `handle()` and `withRequest()`
  - Run `pnpm --filter @poltergeist/shop test`

- [ ] 8. Server-only routes and their tests
  - Create `POST /api/possess`, `GET /api/oracle/ledgers`, `GET /api/oracle/orders`, `GET /api/oracle/intents`, `GET /api/oracle/products` per design §10.2
  - Write tests: secret required (404 without it); each possess option returns a sealed token; `{mutantIds}` rejected unless `BENCH_MODE=1` and bench secret present; `{count:2}` with no non-public overrides → 409 `no_mutants`; oracle routes use `x-pg-observe`, never the caller's cookie
  - Run `pnpm --filter @poltergeist/shop test`

- [ ] 9. Pages, components, and styling
  - Create all pages: `/` (product grid), `/products/[id]`, `/cart`, `/checkout`, `/orders/[id]`, `/orders` per design §10.3
  - Create components: `ProductCard`, `ReviewBody`, `PayButton`, `CheckoutDialog`, `CartView` per design §8.6
  - `CheckoutDialog`: `<div role="dialog" aria-modal="true">`, focus trap (Tab/Shift+Tab cycle), Escape handler, focus-return on close, `inert` on background
  - Every button has accessible text or `aria-label`; every input has `<label>`; every product image uses the §6.1 alt text
  - All render seams (`render/ProductImage`, `render/PayButton`, `render/CheckoutDialog`, `render/ReviewBody`, `render/CartLine`) implemented
  - All `<Link>`, `router.push`, `redirect()` and `fetch()` go through `shopUrl` helpers — no bare `"/"` URLs
  - Add Refero-inspired styling: clean, ordinary store look (Tailwind)
  - No `dangerouslySetInnerHTML` anywhere
  - Generate SVG product images `public/products/<id>.svg` for all 8 products (simple shapes)

- [ ] 10. Headers and security.txt
  - Add `async headers()` block to `apps/shop/next.config.ts` for CSP (`frame-ancestors` from `SEANCE_ORIGIN` env, `unsafe-eval` only in dev) and `X-Robots-Tag: noindex`, per design §11
  - Create `apps/shop/public/.well-known/security.txt` per design §11

- [ ] 11. Full contract suite — C1–C12 all green
  - Create `apps/shop/src/contract/*.test.ts` — one file per rule group, test names starting with `[Cn]`
  - Every test calls route handlers directly with `new Request(...)` and a fresh `MemoryStore` via `_resetMemoryStoreForTest()`
  - Tests use `requestContext` from the registry to apply mutant sets (via `process.env.PG_MUTANTS`)
  - Create `apps/shop/src/contract/helpers.ts` with `contractSession()`: seals a token whose `mutants` = `process.env.PG_MUTANTS` split on commas (empty by default) and returns headers `{ 'x-pg-session': token }`. Every contract request uses it. Component tests (C7–C9) render inside `requestContext.run({ sid, token, mutants }, …)` with the same mutant set
  - All C1–C12 tests pass on the clean shop
  - P4 property test: any valid cart → total = independent formula, ≥ 0, one debit per intent
  - P5 property test: valid strings round-trip exactly; invalid → 400
  - C12 property: `fc.json()` bodies to every public POST → never 5xx
  - Run `pnpm --filter @poltergeist/shop test` — all green

- [ ] 12. SupabaseStore and migration SQL
  - Create `apps/shop/src/store/supabase.ts` implementing the full `Store` interface using `@supabase/supabase-js`
  - `claimIntent`: uses `.upsert({ intent_id }, { onConflict: 'intent_id', ignoreDuplicates: true }).select()`; claimed when the returned array has one row
  - Create `apps/shop/supabase/migrations/0001_init.sql` — exactly the SQL from design §9.3 (no changes)
  - Lazy import in `store/index.ts` so the Supabase client is never loaded in `MemoryStore` mode

- [ ] 13. `mutant-check` script
  - Create `packages/scorer/src/mutant-check.ts` per design §16
  - Add run script `"mutant-check": "tsx src/mutant-check.ts"` to `packages/scorer/package.json`; add `tsx` (latest 4.x, pinned) as a devDependency with justification: runs TS scripts on Windows without a build step
  - S02 behaviour: missing manifest → print `no manifest yet` and exit 0; present manifest → validate with `MutantManifest`, print counts only
  - Run `pnpm --filter @poltergeist/scorer mutant-check` — must print `no manifest yet` and exit 0
  - **Rule-level mode (needed by S03; mutant-maker cannot write this script):** when the manifest exists, for each entry run `vitest run --reporter=json` in `apps/shop` with `PG_MUTANTS=<id>`, collect the `[Cn]` tags of failing tests, and count the entry OK only if at least one test fails and every failing tag equals the entry's rule. Also run the suite once with no mutants (must be all green). Print only `checked N · ok K · wrong-rule W · undetected U · clean-suite PASS|FAIL`; exit 1 unless every entry is OK and the clean suite passes. Never print ids, seams or rules per entry
  - Add `"seams:list": "tsx scripts/list-seams.ts"` to `apps/shop/package.json`: imports `src/seams/all.ts` and prints `listSeamKeys()`, one per line (mutant-maker uses this list in S03)
  - Write a scorer unit test for the rule-level logic using a fake runner and `test/fixtures/manifest.fixture.json` (never the real manifest)

- [ ] 14. Cross-site e2e check
  - Create `apps/shop/e2e/crosssite.spec.ts`, `apps/shop/e2e/parent-server.mjs`, and `apps/shop/playwright.config.ts` per design §15
  - Add script `"e2e:crosssite": "playwright test e2e/crosssite.spec.ts"` to `apps/shop/package.json`
  - Install Playwright browsers: `pnpm --filter @poltergeist/shop exec playwright install chromium firefox`
  - Run `pnpm --filter @poltergeist/shop e2e:crosssite` — must pass in Chromium and Firefox

- [ ] 15. Hooks in the Kiro Hooks panel
  - Create `contract-guard` hook: trigger File Save, pattern `apps/shop/`, shell `pnpm --filter @poltergeist/shop test` — **enabled**
  - Create `mutant-check` hook: trigger File Save, pattern `apps/shop/src/mutants/`, shell `pnpm --filter @poltergeist/scorer mutant-check` — **disabled**
  - Confirm both hooks appear in the Kiro Hooks panel with the correct enabled/disabled state

- [ ] 16. Final verification — all green; commit and push
  - `pnpm test` exits 0 (all packages, including protocol property tests and shop contract suite C1–C12)
  - `pnpm lint` exits 0
  - `pnpm --filter @poltergeist/shop typecheck` exits 0
  - `pnpm --filter @poltergeist/shop build` exits 0
  - `pnpm --filter @poltergeist/scorer mutant-check` prints `no manifest yet` and exits 0
  - Confirm no file under `apps/shop/src/mutants/` was read or written (AC-5)
  - `git add .`
  - `git commit -m "S02: haunted shop — clean shop, seams, sessions, contract suite C1–C12"`
  - `git push`
