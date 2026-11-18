/**
 * FakeShop: a tiny in-memory model of the Haunted Shop's API, correct by default (contract Appendix B).
 * Faults are switched on per session. They are fixtures for oracle tests and have nothing to do with
 * the real mutants. All ids come from a seeded PRNG, so a run is a pure function of (seed, faults).
 */
import { isContractText } from '../contract';

export const FAULT_NAMES = [
  'skipClaim', // C1: no idempotency claim; every checkout call debits again
  'loseOrderOnRefresh', // C2: reload/back drops the paid order
  'negativeQty', // C3: any quantity is accepted
  'stackCoupons', // C4: several coupons stack
  'trustClientPrice', // C5: price in the cart body is honoured
  'noRounding', // C6: total is not rounded to whole cents
  'renderHtml', // C7: user text is rendered as HTML
  'dropAlt', // C8: product images lose their alt text
  'noFocusTrap', // C9: Tab escapes the open dialog
  'noFocusReturn', // C9: focus is not returned to the opener on close
  'truncateText', // C10: text over 50 code points is cut
  'leakOrders', // C11: another session's order can be read
  'throwOnLongName', // C12: a name over 40 code points gives a 500
] as const;
export type FaultName = (typeof FAULT_NAMES)[number];

/** Fixed fault set used for `{ demo: true }`. */
export const DEMO_FAULTS: readonly FaultName[] = ['skipClaim', 'stackCoupons', 'dropAlt'];

export const STRANGER_ORDER_ID = 'stranger-order-fixed';
export const CUSTOMER_START_CENTS = 50_000;
export const TILL_START_CENTS = 100_000;

export type Product = { id: string; name: string; price: number; altText: string };
export type Coupon = { code: string; kind: 'fixed' | 'percent'; cents?: number; percent?: number };
export type LedgerEntry = {
  id: number;
  sid: string;
  ledger: 'customer' | 'till';
  amount_cents: number;
  memo: string;
  intent_id: string | null;
  created_at: number;
};
export type OrderRow = {
  id: string;
  sid: string;
  intent_id: string;
  items: { productId: string; qty: number }[];
  coupon_codes: string[];
  total_cents: number;
  name: string;
  address: string;
  created_at: number;
};
export type ApiResult = { status: number; json: unknown };

type CartLine = { productId: string; qty: number; price?: number };
type IntentRow = { id: string; sid: string; created_at: number; lines: CartLine[]; couponCodes: string[] };
type Session = {
  sid: string;
  token: string;
  faults: ReadonlySet<FaultName>;
  cartId: string;
  version: number;
  lines: CartLine[];
  couponCodes: string[];
  intents: Map<string, IntentRow>;
  orders: OrderRow[];
  reads: { orderId: string; at: number }[];
  reviews: { productId: string; body: string }[];
  ledger: LedgerEntry[];
};

export const PRODUCTS: readonly Product[] = [
  { id: 'p1', name: 'Kettle', price: 4999, altText: 'A steel kettle' },
  { id: 'p2', name: 'Lantern', price: 2450, altText: 'A brass lantern' },
  { id: 'p3', name: 'Candle', price: 1000, altText: 'A white candle' },
  { id: 'p4', name: 'Mirror', price: 3999, altText: 'A round mirror' },
  { id: 'p5', name: 'Teapot', price: 2999, altText: 'A ceramic teapot' },
  { id: 'p6', name: 'Rug', price: 7500, altText: 'A woven rug' },
  { id: 'p7', name: 'Clock', price: 1999, altText: 'A wall clock' },
  { id: 'p8', name: 'Vase', price: 1299, altText: 'A glass vase' },
];

/** Every coupon is worth less than the cheapest product, so a clean total is always > 0. */
export const COUPONS: readonly Coupon[] = [
  { code: 'SAVE5', kind: 'fixed', cents: 500 },
  { code: 'SAVE3', kind: 'fixed', cents: 300 },
  { code: 'TENOFF', kind: 'percent', percent: 10 },
];

/** mulberry32: small seeded PRNG. */
export function makeRng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const err = (status: number, code: string): ApiResult => ({ status, json: { error: { code } } });
const ok = (json: unknown, status = 200): ApiResult => ({ status, json });
const cut = (s: string, n: number) => [...s].slice(0, n).join('');

export class FakeShop {
  private readonly rng: () => number;
  private readonly sessions = new Map<string, Session>();
  private readonly stranger: OrderRow;
  private clock = 0;
  private counter = 0;

  constructor(seed: number) {
    this.rng = makeRng(seed);
    this.stranger = {
      id: STRANGER_ORDER_ID,
      sid: 'stranger',
      intent_id: 'stranger:1',
      items: [{ productId: 'p3', qty: 1 }],
      coupon_codes: [],
      total_cents: 1000,
      name: 'Sam Stranger',
      address: '1 Hidden Lane',
      created_at: 0,
    };
  }

  /** Deterministic pick helper for the driver (`{count}` possessions). */
  random(): number {
    return this.rng();
  }

  tick(): number {
    return ++this.clock;
  }

  createSession(faults: Iterable<FaultName>): string {
    let token: string;
    do {
      token = 'fake_' + Math.floor(this.rng() * 0xffffffffff).toString(16).padStart(10, '0');
    } while (this.sessions.has(token));
    const sid = `sid_${++this.counter}`;
    this.sessions.set(token, {
      sid,
      token,
      faults: new Set(faults),
      cartId: `cart_${sid}`,
      version: 1,
      lines: [],
      couponCodes: [],
      intents: new Map(),
      orders: [],
      reads: [],
      reviews: [],
      ledger: [],
    });
    return token;
  }

  has(token: string): boolean {
    return this.sessions.has(token);
  }

  faults(token: string): ReadonlySet<FaultName> {
    return this.must(token).faults;
  }

  /** The fault behind a reload or back step: the paid order disappears, the debit stays. */
  onRefresh(token: string): void {
    const s = this.must(token);
    if (s.faults.has('loseOrderOnRefresh')) s.orders = [];
  }

  reviews(token: string, productId: string): string[] {
    return this.must(token)
      .reviews.filter((r) => r.productId === productId)
      .map((r) => r.body);
  }

  cartSummary(token: string): { lines: { productId: string; qty: number }[]; couponCodes: string[] } {
    const s = this.must(token);
    return { lines: s.lines.map((l) => ({ productId: l.productId, qty: l.qty })), couponCodes: [...s.couponCodes] };
  }

  // ── Observer reads (the four oracle reads, for a later ShopObserver) ──────────────────────────
  ledgers(token: string) {
    const s = this.must(token);
    const pick = (l: 'customer' | 'till') => s.ledger.filter((e) => e.ledger === l).map((e) => ({ ...e }));
    return {
      customer: { start: CUSTOMER_START_CENTS, entries: pick('customer') },
      till: { start: TILL_START_CENTS, entries: pick('till') },
    };
  }
  orders(token: string): { orders: OrderRow[]; reads: { orderId: string }[] } {
    const s = this.must(token);
    return {
      orders: s.orders.map((o) => structuredClone(o)),
      reads: s.reads.map((r) => ({ orderId: r.orderId })),
    };
  }
  intents(token: string): { id: string }[] {
    return [...this.must(token).intents.values()].map((i) => ({ id: i.id }));
  }
  cleanProducts(): { prices: Record<string, number>; coupons: Record<string, Coupon> } {
    return {
      prices: Object.fromEntries(PRODUCTS.map((p) => [p.id, p.price])),
      coupons: Object.fromEntries(COUPONS.map((c) => [c.code, { ...c }])),
    };
  }

  // ── HTTP-shaped API ───────────────────────────────────────────────────────────────────────────
  handle(token: string, method: string, rawPath: string, body?: unknown): ApiResult {
    const s = this.must(token);
    const path = rawPath.split('?')[0] ?? rawPath;
    const m = method.toUpperCase();
    if (m === 'GET' && path === '/api/products') {
      return ok({
        products: PRODUCTS.map((p) => ({ ...p })),
        coupons: COUPONS.map((c) => ({ ...c })),
      });
    }
    if (m === 'POST' && path === '/api/cart') return this.postCart(s, body);
    if (m === 'POST' && path === '/api/checkout/open') return this.checkoutOpen(s);
    if (m === 'POST' && path === '/api/checkout') return this.checkout(s, body);
    if (m === 'POST' && path === '/api/reviews') return this.postReview(s, body);
    if (m === 'GET' && path.startsWith('/api/orders/')) return this.getOrder(s, decodeURIComponent(path.slice(12)));
    if (m === 'GET' && path === '/api/health') return ok({ ok: true });
    return err(404, 'not_found');
  }

  private postCart(s: Session, body: unknown): ApiResult {
    if (!isRecord(body)) return err(400, 'bad_body');
    const hasLine = body.productId !== undefined;
    const hasCoupon = body.couponCode !== undefined;
    if (!hasLine && !hasCoupon) return err(400, 'bad_body');
    if (hasLine) {
      const product = typeof body.productId === 'string' ? PRODUCTS.find((p) => p.id === body.productId) : undefined;
      if (!product) return err(404, 'unknown_product');
      const qty = body.qty;
      if (typeof qty !== 'number' || !Number.isFinite(qty)) return err(422, 'bad_quantity');
      if (!s.faults.has('negativeQty') && (!Number.isInteger(qty) || qty < 1 || qty > 10)) {
        return err(422, 'bad_quantity');
      }
      const line: CartLine = { productId: product.id, qty };
      if (s.faults.has('trustClientPrice') && typeof body.price === 'number') line.price = body.price;
      s.lines = [...s.lines.filter((l) => l.productId !== product.id), line];
    }
    if (hasCoupon) {
      const coupon = typeof body.couponCode === 'string' ? COUPONS.find((c) => c.code === body.couponCode) : undefined;
      if (!coupon) return err(422, 'unknown_coupon');
      if (s.couponCodes.length >= 1 && !s.faults.has('stackCoupons')) return err(409, 'coupon_already_applied');
      s.couponCodes = [...s.couponCodes, coupon.code];
    }
    s.version += 1;
    return ok({ lines: s.lines.length, couponCodes: [...s.couponCodes], version: s.version });
  }

  private checkoutOpen(s: Session): ApiResult {
    if (s.lines.length === 0) return err(409, 'empty_cart');
    const id = `${s.cartId}:${s.version}`;
    if (!s.intents.has(id)) {
      s.intents.set(id, {
        id,
        sid: s.sid,
        created_at: this.tick(),
        lines: s.lines.map((l) => ({ ...l })),
        couponCodes: [...s.couponCodes],
      });
    }
    return ok({ intentId: id });
  }

  private checkout(s: Session, body: unknown): ApiResult {
    if (!isRecord(body) || typeof body.intentId !== 'string') return err(400, 'bad_body');
    const intent = s.intents.get(body.intentId);
    if (!intent) return err(404, 'unknown_intent');
    const name = body.name ?? '';
    const address = body.address ?? '';
    if (typeof name !== 'string' || typeof address !== 'string') return err(422, 'bad_text');
    if (s.faults.has('throwOnLongName') && [...name].length > 40) return err(500, 'internal');
    if (!isContractText(name) || !isContractText(address)) return err(422, 'bad_text');

    const existing = s.orders.find((o) => o.intent_id === intent.id);
    if (existing && !s.faults.has('skipClaim')) return ok({ order: structuredClone(existing) });

    const total = this.total(s, intent);
    const order: OrderRow = {
      id: `ord_${s.sid}_${s.orders.length + 1}_${Math.floor(this.rng() * 0xffffff).toString(16)}`,
      sid: s.sid,
      intent_id: intent.id,
      items: intent.lines.map((l) => ({ productId: l.productId, qty: l.qty })),
      coupon_codes: [...intent.couponCodes],
      total_cents: total,
      name: s.faults.has('truncateText') ? cut(name, 50) : name,
      address: s.faults.has('truncateText') ? cut(address, 50) : address,
      created_at: this.tick(),
    };
    s.orders.push(order);
    const at = this.tick();
    const memo = `Bank: ${(total / 100).toFixed(2)} debited`;
    s.ledger.push(
      { id: s.ledger.length + 1, sid: s.sid, ledger: 'customer', amount_cents: -total, memo, intent_id: intent.id, created_at: at },
      { id: s.ledger.length + 2, sid: s.sid, ledger: 'till', amount_cents: total, memo: 'Sale', intent_id: intent.id, created_at: at },
    );
    // The cart is spent. The intent stays, so a repeat call with the same key finds the order.
    s.lines = [];
    s.couponCodes = [];
    s.version += 1;
    return ok({ order: structuredClone(order) }, 201);
  }

  /** Σ price × qty − min(discount, subtotal), rounded half-up once (contract C5, C6). */
  private total(s: Session, intent: IntentRow): number {
    const sub = intent.lines.reduce((acc, l) => {
      const price = s.faults.has('trustClientPrice') && l.price !== undefined ? l.price : productPrice(l.productId);
      return acc + price * l.qty;
    }, 0);
    const codes = s.faults.has('stackCoupons') ? intent.couponCodes : intent.couponCodes.slice(0, 1);
    const discount = codes.reduce((acc, code) => {
      const c = COUPONS.find((x) => x.code === code);
      if (!c) return acc;
      return acc + (c.kind === 'fixed' ? (c.cents ?? 0) : (sub * (c.percent ?? 0)) / 100);
    }, 0);
    // The cap only matters for valid carts (sub ≥ 0); with an accepted negative quantity the total stays negative.
    const raw = sub - Math.min(discount, Math.max(sub, 0));
    return s.faults.has('noRounding') ? raw : Math.floor(raw + 0.5 + 1e-9);
  }

  private postReview(s: Session, body: unknown): ApiResult {
    if (!isRecord(body)) return err(400, 'bad_body');
    if (typeof body.productId !== 'string' || !PRODUCTS.some((p) => p.id === body.productId)) {
      return err(404, 'unknown_product');
    }
    if (typeof body.body !== 'string' || !isContractText(body.body)) return err(422, 'bad_text');
    const text = s.faults.has('truncateText') ? cut(body.body, 50) : body.body;
    s.reviews.push({ productId: body.productId, body: text });
    return ok({ ok: true }, 201);
  }

  private getOrder(s: Session, id: string): ApiResult {
    const own = s.orders.find((o) => o.id === id);
    if (own) {
      s.reads.push({ orderId: id, at: this.tick() });
      return ok({ order: structuredClone(own) });
    }
    if (id === STRANGER_ORDER_ID && s.faults.has('leakOrders')) {
      s.reads.push({ orderId: id, at: this.tick() });
      return ok({ order: structuredClone(this.stranger) });
    }
    return err(404, 'not_found');
  }

  private must(token: string): Session {
    const s = this.sessions.get(token);
    if (!s) throw new Error(`FakeShop: unknown session token ${token}`);
    return s;
  }
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function productPrice(id: string): number {
  return PRODUCTS.find((p) => p.id === id)?.price ?? 0;
}
