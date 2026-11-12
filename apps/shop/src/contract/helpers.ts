/**
 * Contract-suite plumbing (design §13).
 *
 * EVERY contract test gets its session from contractSession(). It seals the mutant ids listed in
 * process.env.PG_MUTANTS (comma-separated, default none) into the session token, exactly as the real
 * shop does, so `mutant-check` can re-run this same suite under one mutant and read the [Cn] tags of
 * the FAILING tests to see which rule broke.
 *
 * Writing a contract test (so breaking one rule fails only that rule's tests):
 *  - tag the title with its rule: `it('[C4] ...')`. An untagged contract test makes a mutant undetectable;
 *    contract/tags.test.ts enforces the tagging convention.
 *  - set the scene with benign data (valid quantities, no coupon, short plain text) that no OTHER rule's
 *    mutant can disturb, and assert only this rule's behaviour.
 *  - find things structurally (roles, form order), never by the accessible name or label that a C8 mutant removes.
 */
import type { ComponentType } from 'react';
import fc from 'fast-check';
import { vi } from 'vitest';
import { sealToken, unsealToken } from '@/lib/session';
import { _resetRateLimitsForTest } from '@/lib/rate-limit';
import { requestContext } from '@/seams/registry';
import { PRODUCTS } from '@/domain/catalogue';
import { _resetMemoryStoreForTest, getMemoryStore } from '@/store/memory';
import type { LedgerEntry, Order, OrderRead } from '@/store/types';
import { makeRequest } from '@/test/helpers';
import { GET as routeCartGet, POST as routeCartPost } from '@/app/api/cart/route';
import { POST as routeOpenPost } from '@/app/api/checkout/open/route';
import { POST as routePayPost } from '@/app/api/checkout/route';
import { GET as routeOrderGet } from '@/app/api/orders/[id]/route';
import { GET as routeReviewsGet, POST as routeReviewsPost } from '@/app/api/reviews/route';

/** Fixed fast-check seed: the contract suite must be deterministic so a mutant is killed (or not) the same way every run. */
export const PROP = { seed: 20261109 } as const;

/**
 * Every request unseals a token and every property run makes many requests, so 100 runs take seconds and
 * the 1000 CI runs take minutes. The default 5 s test timeout would fail them (flakily, under load).
 * This is generous on purpose: it only exists to catch a genuine hang.
 */
export const TEST_TIMEOUT_MS = 120_000 + Number(process.env['FC_NUM_RUNS'] ?? 100) * 200;
vi.setConfig({ testTimeout: TEST_TIMEOUT_MS });

// ─── response shapes ──────────────────────────────────────────────────────────

export type ErrBody = { error: { code: string; message: string } };
export type CartLineBody = { productId: string; name: string; qty: number; unitCents: number; lineCents: number };
export type CartBody = {
  cart: {
    version: number;
    couponCode: string | null;
    lines: CartLineBody[];
    subtotalCents: number;
    discountCents: number;
    totalCents: number;
  };
};
export type OpenBody = { intentId: string; total: number; lines: { productId: string; qty: number }[] };
export type OrderDto = {
  id: string;
  intentId: string;
  items: { productId: string; qty: number }[];
  couponCodes: string[];
  totalCents: number;
  name: string | null;
  address: string | null;
  createdAt: number;
};
export type OrderBody = { order: OrderDto };
export type ReviewsBody = { reviews: { productId: string; body: string; createdAt: number }[] };

export type Res<T> = { status: number; body: T | ErrBody };

/** Unwraps a successful (200) response; throws loudly otherwise. For SET-UP steps, never for the assertion under test. */
export function ok<T>(res: Res<T>): T {
  if (res.status !== 200) throw new Error(`expected 200, got ${res.status}: ${JSON.stringify(res.body)}`);
  return res.body as T;
}

export function errCode(res: Res<unknown>): string | undefined {
  return (res.body as ErrBody | null)?.error?.code;
}

// ─── mutants and the world ────────────────────────────────────────────────────

export function activeMutantIds(): string[] {
  return (process.env['PG_MUTANTS'] ?? '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Fresh store and rate limiter. Call in beforeEach. */
export function resetContractWorld(): void {
  _resetMemoryStoreForTest();
  _resetRateLimitsForTest();
}

/**
 * Makes the in-memory store behave like a networked one: every store call yields to the event loop first.
 *
 * Why: MemoryStore resolves in microtasks, so a "concurrent" press finishes its whole check-claim-write
 * before the next press has even started, and there is no gap between the check and the write for a
 * double charge to slip through. Against Supabase that gap is real. Use this in tests whose point is
 * concurrency (C1) so a missing atomic claim is actually observable.
 * Patches the CURRENT store instance only; resetContractWorld() gives the next test a normal one.
 */
export function slowStore(ms = 1): void {
  const store = getMemoryStore() as unknown as Record<string, unknown>;
  for (const name of Object.getOwnPropertyNames(Object.getPrototypeOf(store))) {
    const original = store[name];
    if (name === 'constructor' || typeof original !== 'function') continue;
    store[name] = async (...args: unknown[]) => {
      await new Promise((resolve) => setTimeout(resolve, ms));
      return (original as (...a: unknown[]) => unknown).apply(store, args);
    };
  }
}

// ─── the session ──────────────────────────────────────────────────────────────

export type PostPath = '/api/cart' | '/api/checkout/open' | '/api/checkout' | '/api/reviews';

const POSTS: Record<PostPath, (req: Request) => Promise<Response>> = {
  '/api/cart': routeCartPost,
  '/api/checkout/open': routeOpenPost,
  '/api/checkout': routePayPost,
  '/api/reviews': routeReviewsPost,
};

export interface ContractSession {
  readonly sid: string;
  /** The sealed token, as the proxy would forward it in x-pg-session. */
  readonly token: string;
  /** This session's mutant ids (from PG_MUTANTS). */
  readonly mutants: readonly string[];
  /** Runs fn inside this session's request context, so seams (including render seams) see its mutants. */
  run<T>(fn: () => T): T;
  /** Resolves a render seam for this session. */
  resolve<P>(seam: { resolve(): ComponentType<P> }): ComponentType<P>;

  post(path: PostPath, body: unknown, headers?: Record<string, string>): Promise<Res<unknown>>;
  addToCart(productId: string, qty: unknown): Promise<Res<CartBody>>;
  setQty(productId: string, qty: unknown): Promise<Res<CartBody>>;
  removeLine(productId: string): Promise<Res<CartBody>>;
  applyCoupon(code: string): Promise<Res<CartBody>>;
  cart(): Promise<Res<CartBody>>;
  openCheckout(): Promise<Res<OpenBody>>;
  pay(key: string | null, name: unknown, address: unknown): Promise<Res<OrderBody>>;
  order(id: string): Promise<Res<OrderBody>>;
  postReview(productId: string, body: unknown): Promise<Res<unknown>>;
  reviews(productId: string): Promise<Res<ReviewsBody>>;

  /** Benign set-up: adds each [productId, qty]. Does not assert. */
  fillCart(items: readonly (readonly [string, number])[]): Promise<void>;
  /**
   * Benign set-up: puts `items` in the cart (default: two mugs; pass `[]` if the cart is already filled),
   * opens checkout and pays with plain short text. Does not assert.
   */
  payNow(opts?: {
    name?: string;
    address?: string;
    items?: readonly (readonly [string, number])[];
  }): Promise<{ open: OpenBody; order: OrderDto }>;

  // Oracle-style reads straight from the store, bypassing every seam.
  debits(): Promise<LedgerEntry[]>;
  credits(): Promise<LedgerEntry[]>;
  storedOrders(): Promise<Order[]>;
  orderReads(): Promise<OrderRead[]>;
}

/** A URL cannot carry a lone surrogate, and encodeURIComponent would throw on one: encode the well-formed form. */
const enc = (s: string) => encodeURIComponent(s.toWellFormed());

/** HTTP header values are printable ASCII; the Headers constructor throws on anything else, so no real client could send it. */
const headerSafe = (s: string) => s.replace(/[^\x20-\x7e]/g, '?');

/** The benign scene most tests share: two mugs, valid quantity, no coupon. */
const BENIGN_CART: readonly (readonly [string, number])[] = [['mug', 2]];

let sessionCounter = 0;
let realmFixed = false;

/**
 * Under jsdom the global ArrayBuffer is jsdom's own realm, but Node's WebCrypto returns Node-realm buffers.
 * iron-webcrypto's `arr instanceof ArrayBuffer` then fails and sealing throws "arr.toBase64 is not a function".
 * This lets `instanceof ArrayBuffer` accept the Node-realm buffer. It is a no-op in the plain node environment.
 */
async function fixCryptoRealm(): Promise<void> {
  if (realmFixed) return;
  realmFixed = true;
  const fromNode: unknown = await crypto.subtle.digest('SHA-256', new Uint8Array(1));
  if (fromNode instanceof ArrayBuffer) return; // same realm: nothing to do
  const NodeArrayBuffer = (fromNode as { constructor: Function }).constructor; // eslint-disable-line @typescript-eslint/no-unsafe-function-type
  const original = Function.prototype[Symbol.hasInstance];
  Object.defineProperty(ArrayBuffer, Symbol.hasInstance, {
    configurable: true,
    value: (v: unknown) => original.call(ArrayBuffer, v) || original.call(NodeArrayBuffer, v),
  });
}

export async function contractSession(): Promise<ContractSession> {
  await fixCryptoRealm();
  const mutants = activeMutantIds();
  const token = await sealToken({ sid: crypto.randomUUID(), mutants, iat: Date.now(), hid: null });
  const sid = (await unsealToken(token))!.sid;
  // Every session is its own "client" for the per-IP rate limiter, so a suite that places hundreds of orders never sees a 429.
  const n = ++sessionCounter;
  const ip = `10.${(n >> 16) & 255}.${(n >> 8) & 255}.${n & 255}`;
  const ctx = { sid, token, mutants: new Set(mutants) };

  const request = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}) =>
    makeRequest(method, path, { token, body, headers: { 'x-forwarded-for': ip, ...headers } });

  async function send<T>(call: Promise<Response>): Promise<Res<T>> {
    const res = await call;
    const text = await res.text();
    let body: unknown = null;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body: body as T | ErrBody };
  }

  const post = (path: PostPath, body: unknown, headers?: Record<string, string>) =>
    send<unknown>(POSTS[path](request('POST', path, body, headers)));
  const cartOp = (body: unknown) => send<CartBody>(routeCartPost(request('POST', '/api/cart', body)));

  const session: ContractSession = {
    sid,
    token,
    mutants,
    run: (fn) => requestContext.run(ctx, fn),
    resolve: (seam) => requestContext.run(ctx, () => seam.resolve()),

    post,
    addToCart: (productId, qty) => cartOp({ op: 'add', productId, qty }),
    setQty: (productId, qty) => cartOp({ op: 'set', productId, qty }),
    removeLine: (productId) => cartOp({ op: 'remove', productId }),
    applyCoupon: (code) => cartOp({ op: 'coupon', code }),
    cart: () => send<CartBody>(routeCartGet(request('GET', '/api/cart'))),
    openCheckout: () => send<OpenBody>(routeOpenPost(request('POST', '/api/checkout/open'))),
    pay: (key, name, address) =>
      send<OrderBody>(
        routePayPost(request('POST', '/api/checkout', { name, address }, key === null ? {} : { 'idempotency-key': headerSafe(key) })),
      ),
    order: (id) =>
      send<OrderBody>(routeOrderGet(request('GET', `/api/orders/${enc(id)}`), { params: Promise.resolve({ id }) })),
    postReview: (productId, body) => post('/api/reviews', { productId, body }),
    reviews: (productId) => send<ReviewsBody>(routeReviewsGet(request('GET', `/api/reviews?productId=${enc(productId)}`))),

    async fillCart(items) {
      for (const [productId, qty] of items) await session.addToCart(productId, qty);
    },
    async payNow({ name = 'Ada Lovelace', address = '1 Analytical Way', items = BENIGN_CART } = {}) {
      await session.fillCart(items);
      const open = ok(await session.openCheckout());
      const { order } = ok(await session.pay(open.intentId, name, address));
      return { open, order };
    },

    debits: () => getMemoryStore().listLedger(sid, 'customer'),
    credits: () => getMemoryStore().listLedger(sid, 'till'),
    storedOrders: () => getMemoryStore().listOrders(sid),
    orderReads: () => getMemoryStore().listOrderReads(sid),
  };
  return session;
}

// ─── shared arbitraries ───────────────────────────────────────────────────────

export const productIds = PRODUCTS.map((p) => p.id);

/** A valid cart: 1–6 distinct products, 1–10 of each. */
export const validCartArb = fc.uniqueArray(
  fc.record({ productId: fc.constantFrom(...productIds), qty: fc.integer({ min: 1, max: 10 }) }),
  { selector: (i) => i.productId, minLength: 1, maxLength: 6 },
);

export const couponArb = fc.constantFrom<string | null>(null, 'SPOOKY5', 'HAUNT15');

/** Contract-valid text (C10): 1–100 well-formed code points, none in U+0000–U+001F. */
const scalar = fc.integer({ min: 0x20, max: 0x10ffff }).filter((cp) => cp < 0xd800 || cp > 0xdfff);
export const validTextArb = fc
  .array(scalar, { minLength: 1, maxLength: 100 })
  .map((cps) => String.fromCodePoint(...cps));

export const codePoints = (s: string) => [...s].length;
