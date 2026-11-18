import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { FakeDriver } from './FakeDriver';
import { COUPONS, FAULT_NAMES, PRODUCTS, type FaultName } from './FakeShop';
import { isContractText } from '../contract';
import type { Locator } from '../driver';

const faultSet = fc.subarray([...FAULT_NAMES]);

type Act =
  | { t: 'goto'; path: string }
  | { t: 'click'; target: Locator; count: number }
  | { t: 'type'; target: Locator; text: string }
  | { t: 'press'; key: 'Tab' | 'Shift+Tab' | 'Enter' | 'Escape' }
  | { t: 'back' }
  | { t: 'reload' }
  | { t: 'req'; method: string; path: string; body: unknown };

const names = ['Home', 'Cart', 'Add to cart', 'Checkout', 'Pay', 'Close', 'Apply coupon', 'Post review', 'Kettle'];
const actArb: fc.Arbitrary<Act> = fc.oneof(
  fc.record({ t: fc.constant('goto' as const), path: fc.constantFrom('/', '/cart', '/product/p1', '/product/p2', '/nope') }),
  fc.record({
    t: fc.constant('click' as const),
    target: fc.record({ name: fc.constantFrom(...names) }),
    count: fc.integer({ min: 1, max: 3 }),
  }),
  fc.record({
    t: fc.constant('type' as const),
    target: fc.constantFrom<Locator>({ name: 'Quantity' }, { name: 'Name' }, { name: 'Review' }, { name: 'Coupon code' }),
    text: fc.oneof(fc.string({ maxLength: 120 }), fc.constantFrom('1', '3', '0.5', '11', 'SAVE5', 'SAVE3')),
  }),
  fc.record({ t: fc.constant('press' as const), key: fc.constantFrom('Tab', 'Shift+Tab', 'Enter', 'Escape') }),
  fc.record({ t: fc.constant('back' as const) }),
  fc.record({ t: fc.constant('reload' as const) }),
  fc.record({
    t: fc.constant('req' as const),
    method: fc.constantFrom('GET', 'POST'),
    path: fc.constantFrom('/api/products', '/api/cart', '/api/checkout/open', '/api/orders/stranger-order-fixed'),
    body: fc.oneof(
      fc.constant(undefined),
      fc.record({ productId: fc.constantFrom('p1', 'p3', 'zz'), qty: fc.oneof(fc.integer({ min: -5, max: 12 }), fc.double({ noNaN: true })) }),
      fc.record({ couponCode: fc.constantFrom('SAVE5', 'SAVE3', 'TENOFF', 'X') }),
    ),
  }),
);

async function run(seed: number, faults: FaultName[], acts: Act[]) {
  const d = new FakeDriver({ seed, faults });
  const log: unknown[] = [];
  d.onEvent((e) => log.push(e));
  for (const a of acts) {
    try {
      switch (a.t) {
        case 'goto': await d.goto(a.path); break;
        case 'click': await d.click(a.target, { count: a.count }); break;
        case 'type': await d.type(a.target, a.text); break;
        case 'press': await d.press(a.key); break;
        case 'back': await d.back(); break;
        case 'reload': await d.reload(); break;
        case 'req': log.push(await d.request(a.method, a.path, a.body)); break;
      }
    } catch (e) {
      log.push(`threw: ${(e as Error).message}`);
    }
  }
  const t = d.sessionToken();
  return {
    log,
    token: t,
    path: await d.currentPath(),
    ledgers: d.shop.ledgers(t),
    orders: d.shop.orders(t),
    intents: d.shop.intents(t),
    focused: await d.focused(),
  };
}

describe('FakeDriver determinism', () => {
  it('same (seed, faults, steps) gives identical results', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat(), faultSet, fc.array(actArb, { minLength: 1, maxLength: 20 }), async (seed, faults, acts) => {
        expect(await run(seed, faults, acts)).toEqual(await run(seed, faults, acts));
      }),
    );
  });

  it('different seeds give different session tokens', async () => {
    const a = await run(1, [], []);
    const b = await run(2, [], []);
    expect(a.token).not.toBe(b.token);
  });
});

describe('clean FakeShop keeps the contract', () => {
  const cartArb = fc.record({
    lines: fc.uniqueArray(fc.record({ id: fc.constantFrom(...PRODUCTS.map((p) => p.id)), qty: fc.integer({ min: 1, max: 10 }) }), {
      selector: (l) => l.id,
      minLength: 1,
    }),
    coupon: fc.option(fc.constantFrom(...COUPONS.map((c) => c.code)), { nil: undefined }),
    presses: fc.integer({ min: 1, max: 5 }),
  });

  it('P4-style: total is the rounded reference, ≥ 0, one debit per intent', async () => {
    await fc.assert(
      fc.asyncProperty(cartArb, async ({ lines, coupon, presses }) => {
        const d = new FakeDriver({ seed: 5 });
        for (const l of lines) expect((await d.request('POST', '/api/cart', { productId: l.id, qty: l.qty })).status).toBe(200);
        if (coupon) await d.request('POST', '/api/cart', { couponCode: coupon });
        const open = await d.request('POST', '/api/checkout/open');
        const intentId = (open.json as { intentId: string }).intentId;
        for (let i = 0; i < presses; i++) await d.request('POST', '/api/checkout', { intentId, name: 'N', address: 'A' });
        const t = d.sessionToken();
        const sub = lines.reduce((a, l) => a + PRODUCTS.find((p) => p.id === l.id)!.price * l.qty, 0);
        const c = COUPONS.find((x) => x.code === coupon);
        const disc = !c ? 0 : c.kind === 'fixed' ? c.cents! : (sub * c.percent!) / 100;
        const ref = Math.floor(sub - Math.min(disc, sub) + 0.5 + 1e-9);
        const orders = d.shop.orders(t).orders;
        expect(orders).toHaveLength(1);
        expect(orders[0]!.total_cents).toBe(ref);
        expect(ref).toBeGreaterThanOrEqual(0);
        expect(d.shop.ledgers(t).customer.entries.filter((e) => e.intent_id === intentId)).toHaveLength(1);
      }),
    );
  });

  it('P5-style: contract-valid text round-trips exactly; anything else gets a 4xx', async () => {
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'binary', maxLength: 130 }), async (text) => {
        const d = new FakeDriver({ seed: 5 });
        const r = await d.request('POST', '/api/reviews', { productId: 'p1', body: text });
        if (isContractText(text)) {
          expect(r.status).toBe(201);
          expect(d.shop.reviews(d.sessionToken(), 'p1')).toEqual([text]);
          await d.goto('/product/p1');
          expect((await d.query('[data-testid=review-0]'))[0]?.text).toBe(text);
        } else {
          expect(r.status).toBe(422);
        }
      }),
    );
  }, 120_000);

  it('never returns a 5xx and never fires events on any action sequence', async () => {
    await fc.assert(
      fc.asyncProperty(fc.nat(), fc.array(actArb, { minLength: 1, maxLength: 20 }), async (seed, acts) => {
        const r = await run(seed, [], acts);
        expect(r.log.filter((e) => typeof e === 'object' && e !== null && 'kind' in e)).toEqual([]);
        for (const e of r.log) {
          if (typeof e === 'object' && e !== null && 'status' in e) expect((e as { status: number }).status).toBeLessThan(500);
        }
      }),
    );
  });
});
