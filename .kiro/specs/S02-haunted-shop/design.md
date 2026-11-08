# S02 — Haunted Shop: Design

**Spec:** S02-haunted-shop · **Agent:** builder · **Requirements:** requirements.md
**Prepared with Claude on 9 Nov 2026.** The code in §4 (sessions), §5 (proxy) and §7 (seam registry) was prototyped and tested on Next.js 16.4.5 + Vitest 5.1.0 before this design was written:
- All seven session rules behave as specified against a running `next start` server.
- The registry calls overrides only when their id is active, including across `await`.
- Route handlers can be unit-tested by calling `GET(new Request(...))` directly.
- `next build` succeeds with `proxy.ts`.

**Do not re-derive versions or rewrite the tested snippets; implement around them.**

---

## 1. Versions (new dependencies, all checked on npm 8 Nov 2026, pinned exactly)

`apps/shop/package.json` adds:

| Package | Version | Why |
| --- | --- | --- |
| `iron-session` | 9.0.1 | seals and unseals the immutable session token (`sealData` / `unsealData`) |
| `zod` | 4.6.7 | request validation and the protocol schemas (also added to `packages/protocol`) |
| `@supabase/supabase-js` | 2.119.0 | `SupabaseStore` (server only) |
| `@playwright/test` | 1.65.0 (dev) | the cross-site iframe check (REQ-15) |
| `axe-core` | 4.14.0 (dev) | C8 contract tests in jsdom |
| `jsdom` | 31.0.0 (dev) | DOM environment for component contract tests |
| `@testing-library/react` | 16.3.3 (dev) | render components in C7/C8/C9 tests |
| `@testing-library/dom` | 10.4.2 (dev) | peer of the above |

`packages/protocol/package.json` adds `zod` 4.6.7 as a dependency.

## 2. Next.js config change (S01 left the defaults)

Remove `cacheComponents: true` and `partialPrefetching: true` from `apps/shop/next.config.ts`. Every shop page is per-session and dynamic, and Cache Components would force a Suspense/`connection()` boundary around every cookie and header read. Tested: `next build` passes without them. Keep `transpilePackages` and the Turbopack CSS rule. **Leave `apps/seance/next.config.ts` unchanged** (S10 decides for the Séance Room).

## 3. File layout (`apps/shop/src`)

```
proxy.ts                    session rules (§5) — tested code
lib/session.ts              seal/unseal token (§4) — tested code
lib/shop-url.ts             shopUrl() client + server helpers (§5.3)
lib/http.ts                 handle() wrapper, ApiError, secret checks (§10)
lib/rate-limit.ts           per-IP token bucket (§11)
lib/text.ts                 validateText (C10) — wrapped as seam 'text/validateText'
seams/registry.ts           seam(), seamComponent(), requestContext, listSeamKeys (§7) — tested code
seams/context.ts            withRequest(), withPage(), cleanContext() (§7.2)
mutants/index.ts            EXISTS (S01 stub). Builder must not read or write it.
domain/catalogue.ts         8 products + 2 coupons (§6)
domain/pricing.ts           seams pricing/* (§6.2)
domain/cart.ts              seams cart/* (§8.1)
domain/checkout.ts          seams checkout/* (§8.2)
domain/orders.ts            seams orders/* (§8.3)
domain/reviews.ts           seams reviews/* (§8.4)
store/types.ts              Store interface (§9.1)
store/memory.ts             MemoryStore
store/supabase.ts           SupabaseStore
store/index.ts              getStore(): picks the implementation (§9.2)
app/…                       pages and API routes (§10)
components/…                ProductCard, ReviewBody, PayButton, CheckoutDialog, CartView
contract/…                  contract suite, one file per rule group (§13)
```

`apps/shop/supabase/migrations/0001_init.sql` holds the migration (§9.3).

## 4. Session token — `lib/session.ts` (tested)

```ts
import { sealData, unsealData } from 'iron-session';

export type SessionToken = { sid: string; mutants: string[]; iat: number; hid: string | null };

const password = () => {
  const p = process.env.SESSION_SECRET;
  if (p && p.length >= 32) return p;
  if (process.env.NODE_ENV === 'production') throw new Error('SESSION_SECRET must be set (≥32 chars)');
  return 'dev-only-secret-at-least-32-characters-long!!';
};

export const sealToken = (t: SessionToken) => sealData(t, { password: password(), ttl: 0 });

export async function unsealToken(s: string): Promise<SessionToken | null> {
  try {
    const t = await unsealData<SessionToken>(s, { password: password(), ttl: 0 });
    return t && typeof t.sid === 'string' && Array.isArray(t.mutants) ? t : null;
  } catch {
    return null;
  }
}

export const COOKIE = '__Host-pg_sid';
export const HEADER = 'x-pg-session';
```

Tokens are only ever created by `proxy.ts` (fresh clean sessions) and `POST /api/possess`. Nothing re-seals an existing token (REQ-8.1).

## 5. Proxy — `src/proxy.ts` (tested)

```ts
import { NextResponse, type NextRequest } from 'next/server';
import { sealToken, unsealToken, COOKIE, HEADER } from '@/lib/session';

const MAX_AGE_MS = 30 * 60 * 1000;

export async function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  const headers = new Headers(req.headers);
  headers.delete(HEADER); // REQ-8.5: never trust a client-sent session header
  const m = url.pathname.match(/^\/s\/([^/]+)(\/.*)?$/);
  const bench = process.env.BENCH_MODE === '1';
  let token: string | null = null;
  let fromPath = false;

  if (m) {
    const raw = decodeURIComponent(m[1]!);
    const t = await unsealToken(raw);
    const dest = req.headers.get('sec-fetch-dest');
    const site = req.headers.get('sec-fetch-site');
    const fresh = t ? Date.now() - t.iat < MAX_AGE_MS : false;
    const okCtx = dest === 'iframe' || site === 'same-origin';
    if (t && ((fresh && okCtx) || bench)) { token = raw; fromPath = true; }
    url.pathname = m[2] ?? '/';
    headers.set('x-pg-prefix', fromPath ? `/s/${m[1]}` : '');
  }
  if (!token) {
    const c = req.cookies.get(COOKIE)?.value;
    if (c && (await unsealToken(c))) token = c;
  }
  let minted = false;
  if (!token) {
    token = await sealToken({ sid: crypto.randomUUID(), mutants: [], iat: Date.now(), hid: null });
    minted = true;
  }
  headers.set(HEADER, token);
  const res = m ? NextResponse.rewrite(url, { request: { headers } }) : NextResponse.next({ request: { headers } });
  if (fromPath || minted) {
    res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'none', partitioned: true, path: '/' });
  }
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.well-known).*)'] };
```

Tested outcomes (curl against `next start`):

| Case | Result |
| --- | --- |
| no cookie | new sid; cookie has `Secure; HttpOnly; SameSite=none; Partitioned` |
| path token + `Sec-Fetch-Dest: iframe` | path sid used, cookie re-set |
| path token + `Sec-Fetch-Dest: document` | new clean sid |
| path token + `Sec-Fetch-Site: same-origin` | path sid used |
| spoofed `x-pg-session` from client | ignored, new sid |
| expired path token in iframe | ignored |
| path token with no fetch headers (CLI) | ignored unless `BENCH_MODE=1` |

Session minting rate limits (REQ-12.5) are applied in `proxy.ts` only when `minted` is true, and not when `BENCH_MODE=1`.

**Server-to-server calls:** when a request carries a valid `x-poltergeist-secret` (the possess and oracle routes), the proxy must **not** mint a session or count it against any limit. Otherwise every Séance oracle call would mint a throwaway session, and all judges would share one rate-limit bucket (the Séance server's IP). Check the secret in the proxy with the same constant-time compare as `requireSecret`, then return `NextResponse.next({ request: { headers } })` with `x-pg-session` deleted.

### 5.3 `shopUrl(path)`

- **Server** (`lib/shop-url.ts`, `shopUrlServer(path)`): reads the `x-pg-prefix` request header (set by the proxy) via `headers()` and returns `prefix + path`.
- **Client** (`useShopUrl()` hook and `shopUrlClient(path)`): reads `location.pathname`. If it starts with `/s/<token>/`, it keeps that prefix.
- Every `<Link href>`, `router.push`, `redirect()` and `fetch()` in the shop goes through one of these. **Never write a bare `"/…"` URL in shop code.**

## 6. Catalogue and pricing

### 6.1 `domain/catalogue.ts` (plain data, not a seam)

| id | name | price (cents) | alt text |
| --- | --- | --- | --- |
| `kettle` | Haunted Kettle | 2400 | A black kettle with steam shaped like a ghost |
| `lantern` | Ghost Lantern | 1850 | A paper lantern glowing pale green |
| `mug` | Cursed Mug | 1200 | A chipped white mug with a crack shaped like a face |
| `broom` | Witch's Broom | 3500 | A straw broom with a twisted handle |
| `candle` | Skull Candle | 1499 | A white candle carved into a skull |
| `plant` | Never-Dying Fern | 2100 | A fake fern in a cracked pot |
| `cauldron` | Cauldron Bowl | 2999 | A small iron cauldron used as a bowl |
| `clock` | Raven Clock | 4200 | A wall clock with a raven perched on top |

Coupons: `SPOOKY5` = fixed 500 cents; `HAUNT15` = 15 percent. The cheapest product (1200) is worth more than `SPOOKY5` (REQ-1.2). Product images are local SVGs in `public/products/<id>.svg`, simple shapes Kiro draws; no stock photos.

### 6.2 `domain/pricing.ts` (seams)

```ts
export const subtotal = seam('pricing/subtotal', (lines: CartLine[]) =>
  lines.reduce((s, l) => s + priceOf(l.productId) * l.qty, 0));

export const discount = seam('pricing/discount', (sub: number, code: string | null) => {
  const c = code ? COUPONS[code] : undefined;
  if (!c) return 0;
  return c.kind === 'fixed' ? Math.min(c.cents, sub) : (sub * c.percent) / 100; // may be fractional
});

/** Round half-up once, at the end (C6). Integer maths only. */
export const total = seam('pricing/total', (lines: CartLine[], code: string | null) => {
  const sub = subtotal(lines);
  const d = Math.min(discount(sub, code), sub);
  return Math.floor(sub - d + 0.5 + 1e-9);
});
```

The `1e-9` guards against binary noise when `sub − d` lands exactly on .5 (e.g. `1999 × 0.85 = 1699.15`). The P4 property test (§13) uses its own independent formula, `Math.floor((sub * (100 - p) + 50) / 100)`, to catch any drift.

## 7. Seam registry — `seams/registry.ts` (tested)

```ts
import { AsyncLocalStorage } from 'node:async_hooks';
import type { ComponentType } from 'react';
import type { MutantOverride } from '@poltergeist/protocol';
import { overrides as shipped } from '@/mutants/index';

export type RequestCtx = { sid: string; token: string; mutants: ReadonlySet<string> };
export const requestContext = new AsyncLocalStorage<RequestCtx>();

let overrides: readonly MutantOverride[] = shipped;
const originals = new Map<string, unknown>();

/** Test-only hook for registry unit tests. Never import outside *.test.ts. */
export function _setOverridesForTest(o: readonly MutantOverride[]) { overrides = o; }
export function getOverrides() { return overrides; }

export function seam<A extends unknown[], R>(key: string, fn: (...args: A) => R): (...args: A) => R {
  if (originals.has(key)) throw new Error(`duplicate seam key: ${key}`);
  originals.set(key, fn);
  return (...args: A): R => {
    const active = requestContext.getStore()?.mutants;
    if (active && active.size > 0) {
      const o = overrides.find((x) => x.seam === key && active.has(x.id));
      if (o) return (o.impl as (orig: (...a: A) => R, ...a: A) => R)(fn, ...args);
    }
    return fn(...args);
  };
}

/** Render seam: returns the component to render for the current request. Call inside withPage(). */
export function seamComponent<P>(key: string, C: ComponentType<P>) {
  const pick = seam(key, () => C);
  return { resolve: (): ComponentType<P> => pick() };
}

export const listSeamKeys = () => [...originals.keys()].sort();
```

Render overrides return a different component: `impl(original) → Component`.

### 7.2 `seams/context.ts`

- `withRequest(req, fn)`: for route handlers. Reads `x-pg-session`, unseals it, and runs `fn(ctx)` inside `requestContext.run({ sid, token, mutants: new Set(t.mutants) }, …)`.
- `withPage(fn)`: for server components. Reads `headers()` from `next/headers`, same as above. The page computes data **and** resolves render seams inside `fn`, then returns JSX.
- `cleanContext(fn)`: runs `fn` with an empty mutant set (used by `GET /api/oracle/products`).
- `observeContext(token, fn)`: runs `fn` as the session under observation (oracle routes).

Every file that defines seams must be imported by `src/seams/all.ts`, which the registry tests and `mutant-check` import, so `listSeamKeys()` is complete.

## 8. Domain flows

### 8.1 Cart (`domain/cart.ts`)

All of these are seams:
- `cart/get(sid)`
- `cart/addLine(sid, productId, qty)`
- `cart/setQty(sid, productId, qty)`
- `cart/removeLine(sid, productId)`
- `cart/applyCoupon(sid, code)`

Rules:
- `qty` must satisfy `Number.isInteger(qty) && qty >= 1 && qty <= 10`, else `ApiError(400, 'bad_quantity')` (C3).
- An unknown product gives 404. An unknown coupon gives 400 `bad_coupon`. A second coupon gives 409 `coupon_already_applied`, and the first stays (C4).
- Request bodies are parsed with `z.object({...}).strict()`, so any `price`, `total` or `discount` field is rejected (C5).
- Every change increments `cart.version`.

### 8.2 Checkout (`domain/checkout.ts`)

1. **`checkout/open(sid)`** → `intentId = \`${cart.id}:${cart.version}\``; `store.upsertIntent({ id, sid })`; returns `{ intentId, total, lines }`. Opening again on the same version returns the same id (REQ-3.1).
2. **`checkout/pay(sid, intentId, name, address)`**:
   1. Load the intent. It must belong to `sid`; the cart must have the same id and version. Else 409 `stale_intent`.
   2. Validate name and address with `text/validateText` (C10).
   3. If `store.getOrderByIntent(intentId)` exists, return it (REQ-3.4).
   4. `claimed = checkout/claim(intentId)` → `store.claimIntent(intentId)` (atomic). If `false`, wait for and return the existing order (REQ-3.3).
   5. `amount = pricing/total(lines, coupon)`.
   6. Write the customer debit `-amount` with memo `Bank: $X.XX debited` and `intentId`; the till credit `+amount`; then the order `{ id: uuid, sid, intentId, items, couponCodes, total: amount }`.
   7. Start a new empty cart: new `cart.id`, version 0.
3. Pages:
   - `/checkout` shows the existing order when the current intent is already paid (C2).
   - `/orders/[id]` is the confirmation.
   - The Pay button disables after the first click (REQ-3.7, courtesy only).

### 8.3 Orders (`domain/orders.ts`)

- `orders/getForSession(sid, id)`: `const o = await store.getOrder(id); return o && o.sid === sid ? o : null;`. The session check lives here, in the seam (REQ-9.6, C11).
- `orders/listForSession(sid)`: `store.listOrders(sid)`, filtered with the same check.
- Route `GET /api/orders/:id` and page `/orders/[id]`: on a non-null result, call `store.recordOrderRead(sid, id)` **after** the seam returns, in route or page code, not inside a seam (REQ-4.2).

### 8.4 Reviews (`domain/reviews.ts`)

- `reviews/add(sid, productId, body)`: validates the body with `text/validateText`, then stores it.
- `reviews/list(sid, productId)`: returns only that session's reviews (REQ-5.5).
- Render seam `render/ReviewBody`: renders `{body}` as a React text child (C7). **Never use `dangerouslySetInnerHTML` anywhere in clean shop code.**

### 8.5 Text (`lib/text.ts`)

```ts
export const validateText = seam('text/validateText', (s: unknown): string => {
  if (typeof s !== 'string' || !s.isWellFormed()) throw new ApiError(400, 'bad_text');
  const n = [...s].length;
  if (n < 1 || n > 100 || /[\u0000-\u001F]/.test(s)) throw new ApiError(400, 'bad_text');
  return s; // exactly as submitted: no trim, no normalise (C10)
});
```

### 8.6 Render seams and accessibility

- Render seams: `render/ProductImage`, `render/PayButton`, `render/CheckoutDialog`, `render/ReviewBody`, `render/CartLine`.
- `CheckoutDialog` is a client component: `<div role="dialog" aria-modal="true" aria-labelledby="checkout-title">`.
  - On open, focus moves to the first field.
  - A keydown handler cycles Tab and Shift+Tab between its first and last focusable elements.
  - Escape closes it.
  - On close, focus returns to the opener: store `document.activeElement` on open and restore it.
  - The page behind it gets `inert` while it's open.
- Every button has visible text or `aria-label`, every input has a `<label>`, and every image has the §6.1 alt text (C8).

## 9. Store

### 9.1 `store/types.ts`

```ts
export interface Store {
  ensureSession(sid: string): Promise<void>;
  getCart(sid: string): Promise<Cart>;                       // creates an empty cart if none
  saveCart(cart: Cart): Promise<void>;
  upsertIntent(i: { id: string; sid: string }): Promise<void>;
  getIntent(id: string): Promise<Intent | null>;
  claimIntent(id: string): Promise<boolean>;                 // atomic; false if already claimed
  addLedger(e: LedgerEntry): Promise<void>;
  listLedger(sid: string, ledger: 'customer' | 'till'): Promise<LedgerEntry[]>;
  insertOrder(o: Order): Promise<void>;
  getOrder(id: string): Promise<Order | null>;
  getOrderByIntent(intentId: string): Promise<Order | null>;
  listOrders(sid: string): Promise<Order[]>;
  addReview(r: Review): Promise<void>;
  listReviews(sid: string, productId: string): Promise<Review[]>;
  recordOrderRead(sid: string, orderId: string): Promise<void>;
  listOrderReads(sid: string): Promise<{ orderId: string; at: number }[]>;
  listIntents(sid: string): Promise<Intent[]>;
  health(): Promise<boolean>;                                 // one real read
}
```

The till ledger is per session (`sid`). Its starting balance is $1,000 (100000 cents); the customer's starting balance is $500 (50000 cents). Both are computed as start + Σ entries.

### 9.2 Choosing the store (`store/index.ts`)

- `BENCH_MODE=1` → `MemoryStore` (one process, `next start` locally). This replaces the brief's separate Supabase `bench` schema (REQ-11.1).
- `SUPABASE_URL` and `SUPABASE_SECRET_KEY` both set → `SupabaseStore`.
- Otherwise → `MemoryStore` (tests and `next dev`).
- `MemoryStore` is a module-level singleton. It seeds the stranger session (`sid = 'stranger'`) and order `stranger-order-fixed` on first use.
- Export `_resetMemoryStoreForTest()` (re-seeds the stranger), so each contract test starts from a clean store. Only `*.test.ts` files may call it.

### 9.3 Migration — `apps/shop/supabase/migrations/0001_init.sql`

```sql
create table shop_sessions (id text primary key, is_stranger boolean not null default false, created_at timestamptz not null default now());
create table carts (id text primary key, sid text not null, version int not null default 0, items jsonb not null default '[]', coupon_codes text[] not null default '{}', updated_at timestamptz not null default now());
create unique index carts_one_per_session on carts (sid);
create table intents (id text primary key, sid text not null, created_at timestamptz not null default now());
create table intent_claims (intent_id text primary key, claimed_at timestamptz not null default now());
create table orders (id text primary key, sid text not null, intent_id text not null, items jsonb not null, coupon_codes text[] not null default '{}', total_cents int not null, created_at timestamptz not null default now());
create table ledger_entries (id bigint generated always as identity primary key, sid text not null, ledger text not null check (ledger in ('customer','till')), amount_cents int not null, memo text not null, intent_id text, created_at timestamptz not null default now());
create table reviews (id bigint generated always as identity primary key, sid text not null, product_id text not null, body text not null, created_at timestamptz not null default now());
create table order_reads (id bigint generated always as identity primary key, sid text not null, order_id text not null, created_at timestamptz not null default now());

-- No unique constraint on orders.intent_id or the ledger: C1 mutants must be able to double-charge (REQ-11.2).

do $$ declare t text; begin
  foreach t in array array['shop_sessions','carts','intents','intent_claims','orders','ledger_entries','reviews','order_reads'] loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on %I from anon, authenticated', t);
  end loop;
end $$;

insert into shop_sessions (id, is_stranger) values ('stranger', true);
insert into orders (id, sid, intent_id, items, total_cents)
  values ('stranger-order-fixed', 'stranger', 'stranger:0', '[{"productId":"clock","qty":1}]', 4200);

create extension if not exists pg_cron;
select cron.schedule('poltergeist-cleanup', '17 3 * * *', $$
  delete from order_reads    where created_at < now() - interval '24 hours';
  delete from reviews        where created_at < now() - interval '24 hours';
  delete from ledger_entries where created_at < now() - interval '24 hours';
  delete from orders         where created_at < now() - interval '24 hours' and sid <> 'stranger';
  delete from intent_claims  where claimed_at < now() - interval '24 hours';
  delete from intents        where created_at < now() - interval '24 hours';
  delete from carts          where updated_at < now() - interval '24 hours';
  delete from shop_sessions  where created_at < now() - interval '24 hours' and not is_stranger;
$$);
```

`SupabaseStore.claimIntent(id)`: `insert into intent_claims (intent_id) values ($1) on conflict do nothing returning intent_id`. In supabase-js: `.upsert({ intent_id: id }, { onConflict: 'intent_id', ignoreDuplicates: true }).select()`. Claimed when the returned array has one row.

## 10. Routes

### 10.1 Public API (all wrapped in `handle()` and `withRequest()`)

| Route | Body / params | Success | Errors |
| --- | --- | --- | --- |
| `GET /api/products` | — | `{ products, coupons }` | — |
| `GET /api/cart` | — | cart view with server-computed total | — |
| `POST /api/cart` | `{ op: 'add'\|'set'\|'remove', productId, qty? }` or `{ op: 'coupon', code }` (strict) | cart view | 400 `bad_quantity`, `bad_coupon`, `bad_request`; 404 `no_product`; 409 `coupon_already_applied`; 429 |
| `POST /api/checkout/open` | — | `{ intentId, total, lines }` | 400 `empty_cart` |
| `POST /api/checkout` | header `Idempotency-Key`; `{ name, address }` (strict) | `{ order }` (200 for both new and repeated) | 400 `bad_text`, `missing_key`; 409 `stale_intent`; 429 |
| `GET /api/orders/:id` | — | `{ order }` | 404 |
| `GET /api/reviews?productId=` | — | `{ reviews }` | 400 |
| `POST /api/reviews` | `{ productId, body }` (strict) | `{ review }` | 400 `bad_text`; 404; 429 |
| `GET /api/health` | — | `{ ok: true }` | 503 when the store read fails |

`handle(fn)`:
- `ApiError` → its status and `{ error: { code, message } }`.
- `ZodError` and JSON parse errors → 400 `bad_request`.
- Anything else → 500 (a genuine bug, which is what the Crash oracle detects).

### 10.2 Server-only routes (REQ-10)

`requireSecret(req)` compares `x-poltergeist-secret` with `SEANCE_SERVER_SECRET` using `crypto.timingSafeEqual` on equal-length buffers. On failure → **404** (don't reveal the route exists). These routes skip rate limits.

| Route | Input | Output |
| --- | --- | --- |
| `POST /api/possess` | one of the `PossessOptions` (zod discriminated union in protocol) | `{ token }` |
| `GET /api/oracle/ledgers` | header `x-pg-observe: <token>` | `{ customer: { start, entries }, till: { start, entries } }` |
| `GET /api/oracle/orders` | `x-pg-observe`; `?reads=1` | `{ orders, reads? }` |
| `GET /api/oracle/intents` | `x-pg-observe` | `{ intents }` |
| `GET /api/oracle/products` | — | `{ products, coupons }` computed inside `cleanContext` |

Possess rules:
- `{clean:true}` → mutants `[]`.
- `{count:n}` → n random distinct ids from `getOverrides().filter(o => !o.public)`.
- `{demo:true}` → `getOverrides().filter(o => o.public).map(o => o.id)`.
- `{cloneOf}` → unseal and copy its mutant ids. Bad token → 400.
- `{mutantIds}` → only with `BENCH_MODE=1` **and** `x-poltergeist-bench === BENCH_SECRET`, and every id must exist in `getOverrides()`.
- Too few overrides → 409 `no_mutants`.
- Always mint a new sid and `iat = Date.now()`. Optional `hid` from the body.

### 10.3 Pages

- `/` — product grid
- `/products/[id]` — detail, reviews, add-to-cart
- `/cart` — lines, quantities, coupon field, Checkout button that opens `CheckoutDialog`
- `/checkout` — shows the dialog directly; shows the existing order if the intent is paid
- `/orders/[id]` — confirmation
- `/orders` — this session's orders

Every page uses `withPage()`. No page reads query strings into HTML (REQ-12.4).

## 11. Headers and rate limits

- **Headers:** add an `async headers()` block to `next.config.ts` for `source: '/:path*'` with the REQ-12.1 CSP (built from `process.env.SEANCE_ORIGIN ?? 'http://localhost:3001'`; `'unsafe-eval'` only when `NODE_ENV === 'development'`) and `X-Robots-Tag: noindex`. Never add nonces, hashes or `strict-dynamic`.
- **security.txt:** `public/.well-known/security.txt` with `Contact: https://github.com/lk-nyoka/poltergeist/issues` and a comment line saying the site is an intentionally vulnerable, per-session sandboxed demo, so please don't report its bugs.
- **Rate limits:** `lib/rate-limit.ts` is an in-memory token bucket per instance, keyed by `x-forwarded-for`'s first value (or `'local'`):
  - checkout: 60 per 10 min
  - reviews: 60 per 10 min
  - session minting: 120 per 10 min

  These limits are well above 5 hosted hauntings per 10 min. They're skipped when `BENCH_MODE=1` and on secret-authenticated routes. Over the limit: 429 `rate_limited`.

## 12. Protocol additions (`packages/protocol/src`)

- `manifest.ts`: `MutantManifest` exactly as brief §6.1:
  ```ts
  z.object({
    version: z.literal(1),
    mutants: z.array(z.object({
      id: z.string(),
      rule: z.enum(['C1','C2','C3','C4','C5','C6','C7','C8','C9','C10','C11','C12']),
      seam: z.string(),
      public: z.boolean(),
    })),
  })
  ```
- `possess.ts`: `PossessOptions` = `z.union` of the five shapes in §10.2, each `.strict()`.
- `api.ts`: `ApiError` body schema and the oracle response schemas.
- Update the `MutantOverride` doc comment: `impl` is called as `impl(original, ...args)`; for render seams, `impl(original)` returns a component.
- Each file gets a property test for its schema (e.g. any valid manifest round-trips through `parse`).

## 13. Tests

All tests run with Vitest. Component tests start with `// @vitest-environment jsdom`.

**Contract suite (`src/contract/*.test.ts`):** each test name starts with `[Cn]` so `mutant-check` can map failures to rules. Route handlers are called directly (`POST(new Request(...))`), with a fresh `MemoryStore` per test. Tests run under the active mutant set from `process.env.PG_MUTANTS` (comma-separated ids, default empty), applied through `requestContext`, so `mutant-check` can re-run the same suite under one mutant.

| Rule | Tests (at least) |
| --- | --- |
| C1 | 5 parallel `POST /api/checkout` with the same key → exactly 1 debit |
| C2 | pay, then reopen and repay the same intent → same order, 1 debit; `/checkout` render after pay shows the order |
| C3 | qty 0, −1, 0.5, 11, `"3"` → 400 and the cart is unchanged; 1 and 10 accepted |
| C4 | second coupon → 409 and the first is kept; discount never exceeds the subtotal |
| C5 | body with `price` → 400; the total uses catalogue prices |
| C6 | **P4** property: any valid cart + optional coupon → total = independent formula, ≥ 0, one debit per intent |
| C7 | review containing `<img src=x onerror=window.__poltergeistBeacon('t')>` renders as text: no `img` element, beacon never called |
| C8 | axe-core on ProductCard, CartView, CheckoutDialog, PayButton: zero violations of the 9 rules |
| C9 | CheckoutDialog: Tab from last wraps to first; Shift+Tab from first wraps to last; Escape closes; focus returns to the opener |
| C10 | **P5** property: valid strings round-trip exactly (`textContent` equal); invalid ones (101 code points, U+0007, lone surrogate) → 400 |
| C11 | session B requesting session A's order → 404; `stranger-order-fixed` → 404; `order_reads` row only on success |
| C12 | **property**: arbitrary JSON bodies (fast-check `fc.json()`) to every public POST route never give 5xx |

**Plus:**
- registry tests (from the §7 prototype)
- session and proxy unit tests (the §5 table as cases)
- possess and oracle tests (secret required, 404 without it, `{mutantIds}` rejected unless BENCH_MODE)
- a `MemoryStore` concurrency test for `claimIntent`

## 14. Vitest config for the apps (fix carried over from S01)

The S01 one-line re-export doesn't resolve the `@/` alias. Replace `apps/shop/vitest.config.ts` **and** `apps/seance/vitest.config.ts` with:

```ts
import { fileURLToPath } from 'node:url';
import { mergeConfig } from 'vitest/config';
import shared from '../../vitest.shared';

export default mergeConfig(shared, {
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
});
```

Tested: route-handler tests importing `@/lib/session` pass.

## 15. Cross-site check (REQ-15) — `apps/shop/e2e/crosssite.spec.ts`

- Script: `"e2e:crosssite": "playwright test e2e/crosssite.spec.ts"`. It is **not** part of `pnpm test` or CI in S02.
- `playwright.config.ts` has projects `chromium` and `firefox`, `ignoreHTTPSErrors: true`, and two `webServer` entries:
  1. `next dev --experimental-https -p 3000` with `SEANCE_ORIGIN=http://127.0.0.1:3001` and `SEANCE_SERVER_SECRET=e2e-secret`
  2. `node e2e/parent-server.mjs` on 127.0.0.1:3001
- `parent-server.mjs` calls `POST https://localhost:3000/api/possess {clean:true}` with the secret (Node fetch with `NODE_TLS_REJECT_UNAUTHORIZED=0`, test only). It then serves `<iframe id="shop" src="https://localhost:3000/s/<token>/">`.
- The test opens `http://127.0.0.1:3001`, adds a product inside the frame, reloads the frame, and expects the cart count to still be 1.
- Install browsers once: `pnpm --filter @poltergeist/shop exec playwright install chromium firefox`.

## 16. Hooks and scripts

- **`contract-guard`:** create it in the Kiro Hooks panel: trigger File Save, pattern `apps/shop/`, action shell `pnpm --filter @poltergeist/shop test`. It must show as enabled.
- **`mutant-check` script:** in `packages/scorer/src/mutant-check.ts`, run with `pnpm --filter @poltergeist/scorer mutant-check` (via `node --experimental-strip-types` or `tsx`; pick `tsx` 4.x, latest, pinned, justified as running TS scripts on Windows).
  - S02 behaviour: if `bench/mutant-manifest.json` is missing, print `no manifest yet` and exit 0.
  - Otherwise, validate it with `MutantManifest` and print only:
    - `mutants: N`
    - `per rule: C1=a C2=b …`
    - `public: k`
    - `unknown seams: u`

  It never prints ids, seams or rule-to-id pairs. The S03 rule-level check and the S05 oracle-level check extend this script later.
- **`mutant-check` hook:** create it in the Hooks panel, **disabled**: File Save, pattern `apps/shop/src/mutants/`, shell `pnpm --filter @poltergeist/scorer mutant-check`.

## 17. Environment (`.env.example` already lists these)

S02 uses: `SESSION_SECRET`, `SEANCE_ORIGIN`, `SEANCE_SERVER_SECRET`, `BENCH_SECRET`, `BENCH_MODE`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`. Locally, copy `.env.example` to `apps/shop/.env.local` (gitignored). No Supabase account is needed to finish S02: tests and `next dev` use `MemoryStore`.

## 18. Build order (tasks.md follows this)

1. Add dependencies (§1); config changes (§2, §14)
2. `lib/session.ts`, `proxy.ts`, `lib/shop-url.ts`, with the §5 unit tests
3. `seams/registry.ts`, `seams/context.ts`, `seams/all.ts`, with registry tests
4. Protocol additions (§12) and their property tests
5. `store/types.ts`, `store/memory.ts` (with stranger seed), `store/index.ts`, and the claim concurrency test
6. `lib/text.ts`, `domain/*` (§6, §8)
7. `lib/http.ts`, `lib/rate-limit.ts`, the public API routes (§10.1)
8. Server-only routes (§10.2) and their tests
9. Pages and components (§8.6, §10.3), with Refero-inspired styling for a clean, ordinary store look
10. Headers and security.txt (§11)
11. Contract suite (§13), all C1–C12 green
12. `store/supabase.ts` and the migration SQL (§9.3). It isn't exercised by tests until deployment
13. `mutant-check` script (§16)
14. Cross-site e2e (§15); run it locally
15. Hooks in the panel (§16)
16. `pnpm test`, `pnpm lint`, `pnpm --filter @poltergeist/shop typecheck`, `pnpm --filter @poltergeist/shop build` all green → commit and push

## 19. Out of scope for S02

- No mutants (S03).
- No ghosts or drivers (S04+).
- No `haunt-runtime.js` (S09).
- No Séance Room work.
- No deployment: Vercel and Supabase setup is a manual step after S02, before the Safari check.
