// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { _resetMemoryStoreForTest, getMemoryStore } from '@/store/memory';
import { _resetRateLimitsForTest } from '@/lib/rate-limit';
import { json, makeRequest as rq, newSession, withEnv } from '@/test/helpers';
import { GET as getProducts } from './products/route';
import { GET as getCart, POST as postCart } from './cart/route';
import { POST as openCheckout } from './checkout/open/route';
import { POST as postCheckout } from './checkout/route';
import { GET as getOrder } from './orders/[id]/route';
import { GET as getReviews, POST as postReview } from './reviews/route';
import { GET as getHealth } from './health/route';

type Err = { error: { code: string; message: string } };
type CartRes = { cart: { version: number; totalCents: number; subtotalCents: number; couponCode: string | null; lines: { productId: string; qty: number }[] } };
type OrderRes = { order: { id: string; totalCents: number; name: string; address: string; sid?: string } };

beforeEach(() => {
  _resetMemoryStoreForTest();
  _resetRateLimitsForTest();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

const add = (token: string, productId: string, qty: unknown) =>
  postCart(rq('POST', '/api/cart', { token, body: { op: 'add', productId, qty } }));

async function placeOrder(token: string) {
  await add(token, 'mug', 2);
  const open = await json<{ intentId: string }>(await openCheckout(rq('POST', '/api/checkout/open', { token })));
  const res = await postCheckout(
    rq('POST', '/api/checkout', { token, headers: { 'idempotency-key': open.intentId }, body: { name: 'Ada', address: '1 Elm St' } }),
  );
  return { open, res };
}

describe('GET /api/products', () => {
  it('lists the 8 products and 2 coupons', async () => {
    const res = await getProducts(rq('GET', '/api/products'));
    expect(res.status).toBe(200);
    const body = await json<{ products: unknown[]; coupons: { code: string }[] }>(res);
    expect(body.products).toHaveLength(8);
    expect(body.coupons.map((c) => c.code).sort()).toEqual(['HAUNT15', 'SPOOKY5']);
  });
});

describe('/api/cart', () => {
  it('adds a line and returns server-computed amounts', async () => {
    const { token } = await newSession();
    const res = await add(token, 'mug', 2);
    expect(res.status).toBe(200);
    const { cart } = await json<CartRes>(res);
    expect(cart.subtotalCents).toBe(2400);
    expect(cart.totalCents).toBe(2400);
    const again = await json<CartRes>(await getCart(rq('GET', '/api/cart', { token })));
    expect(again.cart.lines).toEqual([expect.objectContaining({ productId: 'mug', qty: 2 })]);
  });

  it('applies one coupon, rejects the second with 409 and keeps the first', async () => {
    const { token } = await newSession();
    await add(token, 'mug', 2);
    const ok = await postCart(rq('POST', '/api/cart', { token, body: { op: 'coupon', code: 'SPOOKY5' } }));
    expect((await json<CartRes>(ok)).cart.totalCents).toBe(1900);
    const second = await postCart(rq('POST', '/api/cart', { token, body: { op: 'coupon', code: 'HAUNT15' } }));
    expect(second.status).toBe(409);
    expect((await json<Err>(second)).error.code).toBe('coupon_already_applied');
    expect((await json<CartRes>(await getCart(rq('GET', '/api/cart', { token })))).cart.couponCode).toBe('SPOOKY5');
  });

  it('rejects client-sent prices, totals and discounts (strict body)', async () => {
    const { token } = await newSession();
    for (const extra of [{ price: 1 }, { total: 0 }, { discount: 9999 }, { unitCents: 1 }]) {
      const res = await postCart(rq('POST', '/api/cart', { token, body: { op: 'add', productId: 'mug', qty: 1, ...extra } }));
      expect(res.status).toBe(400);
    }
    expect((await json<CartRes>(await getCart(rq('GET', '/api/cart', { token })))).cart.lines).toEqual([]);
  });

  it('rejects bad quantities from the seam with bad_quantity and leaves the cart unchanged', async () => {
    const { token } = await newSession();
    for (const q of [0, -3, 0.5, 11, 1e9]) {
      const res = await add(token, 'mug', q);
      expect(res.status).toBe(400);
      expect((await json<Err>(res)).error.code).toBe('bad_quantity');
    }
    expect((await json<CartRes>(await getCart(rq('GET', '/api/cart', { token })))).cart.version).toBe(0);
  });

  it('sessions are isolated', async () => {
    const a = await newSession();
    const b = await newSession();
    await add(a.token, 'mug', 1);
    expect((await json<CartRes>(await getCart(rq('GET', '/api/cart', { token: b.token })))).cart.lines).toEqual([]);
  });
});

describe('checkout routes', () => {
  it('open returns the same intent id until the cart changes', async () => {
    const { token } = await newSession();
    await add(token, 'mug', 1);
    const a = await json<{ intentId: string }>(await openCheckout(rq('POST', '/api/checkout/open', { token })));
    const b = await json<{ intentId: string }>(await openCheckout(rq('POST', '/api/checkout/open', { token })));
    expect(b.intentId).toBe(a.intentId);
    await add(token, 'kettle', 1);
    const c = await json<{ intentId: string }>(await openCheckout(rq('POST', '/api/checkout/open', { token })));
    expect(c.intentId).not.toBe(a.intentId);
  });

  it('open on an empty cart is 400', async () => {
    const { token } = await newSession();
    expect((await openCheckout(rq('POST', '/api/checkout/open', { token }))).status).toBe(400);
  });

  it('pay returns 200 with the order, and repeating it returns the same order with one debit', async () => {
    const { token, sid } = await newSession();
    const { open, res } = await placeOrder(token);
    expect(res.status).toBe(200);
    const first = await json<OrderRes>(res);
    expect(first.order).toMatchObject({ totalCents: 2400, name: 'Ada', address: '1 Elm St' });
    expect(first.order.sid).toBeUndefined(); // internal session id is never sent
    const again = await postCheckout(
      rq('POST', '/api/checkout', { token, headers: { 'idempotency-key': open.intentId }, body: { name: 'Ada', address: '1 Elm St' } }),
    );
    expect(again.status).toBe(200);
    expect((await json<OrderRes>(again)).order.id).toBe(first.order.id);
    expect(await getMemoryStore().listLedger(sid, 'customer')).toHaveLength(1);
  });

  it('pay without an Idempotency-Key is 400 missing_key; with a foreign key it is 409', async () => {
    const a = await newSession();
    const b = await newSession();
    await add(a.token, 'mug', 1);
    const open = await json<{ intentId: string }>(await openCheckout(rq('POST', '/api/checkout/open', { token: a.token })));
    const noKey = await postCheckout(rq('POST', '/api/checkout', { token: a.token, body: { name: 'x', address: 'y' } }));
    expect(noKey.status).toBe(400);
    expect((await json<Err>(noKey)).error.code).toBe('missing_key');
    const foreign = await postCheckout(
      rq('POST', '/api/checkout', { token: b.token, headers: { 'idempotency-key': open.intentId }, body: { name: 'x', address: 'y' } }),
    );
    expect(foreign.status).toBe(409);
  });

  it('bad name or address is a friendly 400', async () => {
    const { token } = await newSession();
    await add(token, 'mug', 1);
    const { intentId } = await json<{ intentId: string }>(await openCheckout(rq('POST', '/api/checkout/open', { token })));
    for (const body of [{ name: '', address: 'y' }, { name: 'x', address: 'a'.repeat(101) }, { name: 'x\u0000', address: 'y' }, { name: 'x' }, { name: 1, address: 2 }]) {
      const res = await postCheckout(rq('POST', '/api/checkout', { token, headers: { 'idempotency-key': intentId }, body }));
      expect(res.status).toBe(400);
      expect((await json<Err>(res)).error.code).toMatch(/^bad_/);
    }
  });
});

describe('GET /api/orders/[id]', () => {
  const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

  it('returns the owner their order and records exactly one order_reads row', async () => {
    const { token, sid } = await newSession();
    const { res } = await placeOrder(token);
    const { order } = await json<OrderRes>(res);
    const got = await getOrder(rq('GET', `/api/orders/${order.id}`, { token }), ctx(order.id));
    expect(got.status).toBe(200);
    expect((await json<OrderRes>(got)).order.id).toBe(order.id);
    expect(await getMemoryStore().listOrderReads(sid)).toEqual([expect.objectContaining({ orderId: order.id })]);
  });

  it("another session and the stranger's order get 404 and record no read", async () => {
    const owner = await newSession();
    const other = await newSession();
    const { order } = await json<OrderRes>((await placeOrder(owner.token)).res);
    for (const id of [order.id, 'stranger-order-fixed', 'no-such-order']) {
      const res = await getOrder(rq('GET', `/api/orders/${id}`, { token: other.token }), ctx(id));
      expect(res.status).toBe(404);
    }
    expect(await getMemoryStore().listOrderReads(other.sid)).toEqual([]);
  });
});

describe('/api/reviews', () => {
  it('stores a review exactly and shows it only to its author', async () => {
    const a = await newSession();
    const b = await newSession();
    const body = '  <img src=x onerror=alert(1)> ';
    const res = await postReview(rq('POST', '/api/reviews', { token: a.token, body: { productId: 'mug', body } }));
    expect(res.status).toBe(200);
    const mine = await json<{ reviews: { body: string }[] }>(await getReviews(rq('GET', '/api/reviews?productId=mug', { token: a.token })));
    expect(mine.reviews.map((r) => r.body)).toEqual([body]);
    const theirs = await json<{ reviews: unknown[] }>(await getReviews(rq('GET', '/api/reviews?productId=mug', { token: b.token })));
    expect(theirs.reviews).toEqual([]);
  });

  it('bad text is 400, unknown product is 404, missing productId is 400', async () => {
    const { token } = await newSession();
    expect((await postReview(rq('POST', '/api/reviews', { token, body: { productId: 'mug', body: '' } }))).status).toBe(400);
    expect((await postReview(rq('POST', '/api/reviews', { token, body: { productId: 'nope', body: 'fine' } }))).status).toBe(404);
    expect((await getReviews(rq('GET', '/api/reviews', { token }))).status).toBe(400);
  });
});

describe('GET /api/health', () => {
  it('does one real store read', async () => {
    const res = await getHealth(rq('GET', '/api/health'));
    expect(res.status).toBe(200);
    expect(await json(res)).toEqual({ ok: true });
  });
});

describe('error handling (C12)', () => {
  it('malformed, empty and non-object JSON bodies are 400, never 5xx', async () => {
    const { token } = await newSession();
    for (const body of ['{not json', '', 'null', '[]', '"str"', '42']) {
      for (const [handler, path] of [
        [postCart, '/api/cart'],
        [postCheckout, '/api/checkout'],
        [postReview, '/api/reviews'],
      ] as const) {
        const res = await handler(rq('POST', path, { token, body, headers: { 'idempotency-key': 'k' } }));
        expect(res.status, `${path} ${JSON.stringify(body)}`).toBeLessThan(500);
        expect(res.status).toBeGreaterThanOrEqual(400);
      }
    }
  });

  it('errors use the { error: { code, message } } shape', async () => {
    const { token } = await newSession();
    const e = await json<Err>(await add(token, 'mug', 0));
    expect(e).toEqual({ error: { code: 'bad_quantity', message: expect.any(String) } });
  });

  it('a genuine bug surfaces as a 500 response with the same error shape', async () => {
    const { handle } = await import('@/lib/http');
    const boom = handle(async () => {
      throw new Error('kaboom');
    });
    const res = await boom(rq('GET', '/x'));
    expect(res.status).toBe(500);
    expect((await json<Err>(res)).error.code).toBe('internal');
  });
});

describe('rate limits (REQ-12.5)', () => {
  const hit = (ip: string, extra: Record<string, string> = {}) =>
    postCheckout(rq('POST', '/api/checkout', { headers: { 'x-forwarded-for': ip, ...extra }, body: {} }));

  it('the 61st checkout request from one IP in 10 minutes is 429', async () => {
    for (let i = 0; i < 60; i++) expect((await hit('9.9.9.9')).status).toBe(400); // missing_key, not limited
    const limited = await hit('9.9.9.9');
    expect(limited.status).toBe(429);
    expect((await json<Err>(limited)).error.code).toBe('rate_limited');
    expect((await hit('8.8.8.8')).status).toBe(400); // other IPs are unaffected
  });

  it('BENCH_MODE=1 turns limits off', async () => {
    await withEnv({ BENCH_MODE: '1' }, async () => {
      for (let i = 0; i < 70; i++) expect((await hit('7.7.7.7')).status).toBe(400);
    });
  });

  it('requests with the server secret are exempt', async () => {
    await withEnv({ SEANCE_SERVER_SECRET: 'unit-test-secret' }, async () => {
      for (let i = 0; i < 70; i++) expect((await hit('6.6.6.6', { 'x-poltergeist-secret': 'unit-test-secret' })).status).toBe(400);
    });
  });
});
