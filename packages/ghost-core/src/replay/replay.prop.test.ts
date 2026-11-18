import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import type { Step } from '@poltergeist/protocol';
import { FakeDriver } from '../fake/FakeDriver';
import { fakeObserver } from '../fake/FakeObserver';
import { FAULT_NAMES } from '../fake/FakeShop';
import { replay } from './replay';

const t = { gapMs: 0, timingSensitive: false } as const;
const names = ['Home', 'Cart', 'Add to cart', 'Checkout', 'Pay', 'Close', 'Apply coupon', 'Post review', 'Kettle'];

/** Steps with no timing sensitivity: single clicks, no gaps. Some carry placeholders. */
const stepArb: fc.Arbitrary<Step> = fc.oneof(
  fc.constantFrom('/', '/cart', '/product/p1', '/product/p3', '/orders/{{orderId}}', '/nope').map((path): Step => ({ kind: 'goto', path, ...t })),
  fc.constantFrom(...names).map((name): Step => ({ kind: 'click', target: { name }, ...t })),
  fc
    .record({ name: fc.constantFrom('Quantity', 'Name', 'Review', 'Coupon code'), text: fc.oneof(fc.string({ maxLength: 120 }), fc.constantFrom('1', '3', '0.5', '11', 'SAVE5', 'SAVE3')) })
    .map(({ name, text }): Step => ({ kind: 'type', target: { name }, text, ...t })),
  fc.constantFrom('Tab', 'Shift+Tab', 'Enter', 'Escape').map((key): Step => ({ kind: 'press', key, ...t })),
  fc.constantFrom<Step>({ kind: 'back', ...t }, { kind: 'reload', ...t }),
  fc
    .record({
      method: fc.constantFrom('GET', 'POST'),
      path: fc.constantFrom('/api/products', '/api/cart', '/api/checkout/open', '/api/checkout', '/api/orders/stranger-order-fixed', '/api/orders/{{orderId}}'),
      body: fc.oneof(
        fc.constant(undefined),
        fc.record({ productId: fc.constantFrom('p1', 'p3'), qty: fc.oneof(fc.integer({ min: -3, max: 12 }), fc.double({ noNaN: true })) }),
        fc.record({ couponCode: fc.constantFrom('SAVE5', 'SAVE3', 'TENOFF') }),
        fc.record({ intentId: fc.constant('{{intentId}}'), name: fc.string({ maxLength: 120 }), address: fc.string({ maxLength: 20 }) }),
      ),
    })
    .map(({ method, path, body }): Step => ({ kind: 'request', method, path, ...(body === undefined ? {} : { body }), ...t })),
);

async function run(seed: number, faults: (typeof FAULT_NAMES)[number][], steps: Step[]) {
  const driver = new FakeDriver({ seed, faults });
  const deps = { driver, observer: fakeObserver(driver.shop) };
  let now = 0; // virtual clock, so the 2 s settle retry costs no real time
  const observe = { now: () => now, sleep: async (ms: number) => void (now += ms) };
  return replay(steps, deps, { cloneOf: driver.sessionToken() }, { sleep: async () => {}, observe });
}

describe('P1: replay determinism on the FakeDriver', () => {
  it('replaying the same non-timing steps twice, for the same seed and mutant set, gives identical oracle results', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.nat(),
        fc.subarray([...FAULT_NAMES]),
        fc.array(stepArb, { minLength: 1, maxLength: 20 }),
        async (seed, faults, steps) => {
          const a = await run(seed, faults, steps);
          const b = await run(seed, faults, steps);
          expect(b.hits).toEqual(a.hits);
          expect(b).toEqual(a); // also the session token, step errors and the whole observation
        },
      ),
    );
  });

  it('is sensitive to the mutant set (the property is not vacuous)', async () => {
    const steps: Step[] = [
      { kind: 'request', method: 'GET', path: '/api/orders/stranger-order-fixed', ...t },
    ];
    const leaky = await run(1, ['leakOrders'], steps);
    const clean = await run(1, [], steps);
    expect(leaky.hits.map((h) => h.oracle)).toEqual(['PrivacyLeak']);
    expect(clean.hits).toEqual([]);
  });
});
