// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as orders from '@/domain/orders';
import {
  PROP,
  contractSession,
  ok,
  productIds,
  resetContractWorld,
  type PostPath,
} from './helpers';

beforeEach(resetContractWorld);

// ─── C11: a session sees and acts on its own orders only ──────────────────────

describe('C11: own orders only', () => {
  it("[C11] a session cannot read another session's order: 404, and no read is recorded", async () => {
    const owner = await contractSession();
    const other = await contractSession();
    const { order } = await owner.payNow();
    const res = await other.order(order.id);
    expect(res.status).toBe(404);
    expect(await other.orderReads()).toEqual([]);
  });

  it('[C11] the owner can read their own order, and that records exactly one read', async () => {
    const owner = await contractSession();
    const { order } = await owner.payNow();
    expect((await owner.order(order.id)).status).toBe(200);
    const reads = await owner.orderReads();
    expect(reads).toHaveLength(1);
    expect(reads[0]?.orderId).toBe(order.id);
  });

  it("[C11] the stranger's order is invisible to every session, and reading it records nothing", async () => {
    const s = await contractSession();
    await s.payNow();
    const res = await s.order('stranger-order-fixed');
    expect(res.status).toBe(404);
    expect((await s.orderReads()).filter((r) => r.orderId === 'stranger-order-fixed')).toEqual([]);
  });

  it("[C11] listing orders returns only the session's own", async () => {
    const a = await contractSession();
    const b = await contractSession();
    const { order: orderA } = await a.payNow();
    const { order: orderB } = await b.payNow();
    const listA = await a.run(() => orders.listForSession(a.sid));
    const listB = await b.run(() => orders.listForSession(b.sid));
    expect(listA.map((o) => o.id)).toEqual([orderA.id]);
    expect(listB.map((o) => o.id)).toEqual([orderB.id]);
    expect(await a.run(() => orders.listForSession('a-session-that-never-ordered'))).toEqual([]);
  });

  it("[C11] a session cannot pay on another session's checkout: 409, and nobody is charged", async () => {
    const owner = await contractSession();
    const thief = await contractSession();
    await owner.addToCart('mug', 1);
    const open = ok(await owner.openCheckout());
    const res = await thief.pay(open.intentId, 'Eve', '2 Elm St');
    expect(res.status).toBe(409);
    expect(await owner.debits()).toEqual([]);
    expect(await thief.debits()).toEqual([]);
    expect(await thief.storedOrders()).toEqual([]);
  });

  it('[C11] carts and reviews are private to their session', async () => {
    const a = await contractSession();
    const b = await contractSession();
    await a.addToCart('mug', 3);
    await a.postReview('mug', 'only I can see this');
    expect(ok(await b.cart()).cart.lines).toEqual([]);
    expect(ok(await b.reviews('mug')).reviews).toEqual([]);
    expect(ok(await a.reviews('mug')).reviews).toHaveLength(1);
  });

  it('[C11] property: with several sessions each holding an order, each reads only its own', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 2, max: 4 }), async (n) => {
        const sessions = await Promise.all(Array.from({ length: n }, () => contractSession()));
        const placed = [];
        for (const s of sessions) placed.push((await s.payNow()).order);
        for (let i = 0; i < n; i++) {
          for (let j = 0; j < n; j++) {
            const res = await sessions[i]!.order(placed[j]!.id);
            expect(res.status, `session ${i} reading order ${j}`).toBe(i === j ? 200 : 404);
          }
        }
      }),
      PROP,
    );
  });
});

// ─── C12: never a 5xx for any user input ──────────────────────────────────────

const POST_PATHS: PostPath[] = ['/api/cart', '/api/checkout/open', '/api/checkout', '/api/reviews'];

describe('C12: no 5xx for any user input', () => {
  it('[C12] property: arbitrary JSON sent to every public POST route never gives a 5xx', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.constantFrom(...POST_PATHS),
        fc.jsonValue(),
        fc.option(fc.string(), { nil: undefined }),
        async (path, value, key) => {
          const s = await contractSession();
          const res = await s.post(path, value, key === undefined ? {} : { 'idempotency-key': key });
          expect(res.status, `${path} ${JSON.stringify(value)}`).toBeLessThan(500);
        },
      ),
      PROP,
    );
  });

  it('[C12] property: arbitrary non-JSON bodies never give a 5xx', async () => {
    await fc.assert(
      fc.asyncProperty(fc.constantFrom(...POST_PATHS), fc.string({ unit: 'binary', maxLength: 400 }), async (path, raw) => {
        const s = await contractSession();
        const res = await s.post(path, raw);
        expect(res.status, `${path} ${JSON.stringify(raw)}`).toBeLessThan(500);
      }),
      PROP,
    );
  });

  it('[C12] property: hostile values in every field of a ready checkout never give a 5xx', async () => {
    const hostileString = fc.string({ unit: 'binary', maxLength: 300 });
    const hostileId = fc.oneof(
      fc.constantFrom(...productIds, 'constructor', '__proto__', 'toString', 'hasOwnProperty', '', ' ', 'x'.repeat(5000)),
      hostileString,
    );
    const hostileNumber = fc.oneof(
      fc.double(),
      fc.constantFrom(0, -0, 0.5, -3, 11, 1e9, 1e308, -1e308, Number.MIN_VALUE, Number.MAX_SAFE_INTEGER),
    );
    await fc.assert(
      fc.asyncProperty(hostileString, hostileString, hostileId, hostileNumber, async (a, b, productId, num) => {
        const s = await contractSession();
        await s.addToCart('mug', 1);
        const open = ok(await s.openCheckout());
        const results = [
          await s.addToCart(productId, num),
          await s.setQty(productId, num),
          await s.removeLine(productId),
          await s.applyCoupon(a),
          await s.postReview(productId, a),
          await s.reviews(productId),
          await s.order(a),
          await s.pay(open.intentId, a, b),
          await s.pay(a, b, a),
        ];
        for (const [i, res] of results.entries()) expect(res.status, `step ${i}`).toBeLessThan(500);
      }),
      PROP,
    );
  });

  it('[C12] awkward bodies and ids never give a 5xx', async () => {
    const s = await contractSession();
    const deep = '['.repeat(2000) + ']'.repeat(2000);
    const bodies: unknown[] = ['', 'null', '[]', '{}', '"text"', '42', 'true', '{"op":', deep, '{"__proto__":{"op":"add"}}', '\u0000'];
    for (const body of bodies) {
      for (const path of POST_PATHS) {
        const res = await s.post(path, body, { 'idempotency-key': 'k' });
        expect(res.status, `${path} ${String(body).slice(0, 20)}`).toBeLessThan(500);
      }
    }
    for (const id of ['', '..', '../../etc/passwd', '%00', '\u0000', 'x'.repeat(20_000), '👻', 'constructor', '__proto__']) {
      expect((await s.order(id)).status, `order ${id.slice(0, 20)}`).toBeLessThan(500);
      expect((await s.reviews(id)).status, `reviews ${id.slice(0, 20)}`).toBeLessThan(500);
    }
  });

  it('[C12] user input that is merely invalid gets a friendly 4xx with an error body, not a crash', async () => {
    const s = await contractSession();
    // Only inputs that no other rule owns: unknown things and malformed requests (not quantities, coupons or text length).
    const cases = [
      await s.addToCart('no-such-product', 1),
      await s.setQty('no-such-product', 1),
      await s.removeLine('no-such-product'),
      await s.post('/api/cart', { op: 'teleport' }),
      await s.post('/api/cart', {}),
      await s.post('/api/reviews', { productId: 'no-such-product', body: 'fine' }),
      await s.post('/api/checkout', 'not json at all'),
      await s.openCheckout(), // nothing in the cart yet
      await s.order('no-such-order'),
    ];
    for (const res of cases) {
      expect(res.status).toBeGreaterThanOrEqual(400);
      expect(res.status).toBeLessThan(500);
      expect((res.body as { error?: { code?: string } }).error?.code).toEqual(expect.any(String));
    }
  });
});
