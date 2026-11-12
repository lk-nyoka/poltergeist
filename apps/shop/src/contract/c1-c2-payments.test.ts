// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import * as orders from '@/domain/orders';
import {
  PROP,
  contractSession,
  couponArb,
  errCode,
  ok,
  resetContractWorld,
  slowStore,
  validCartArb,
  type ContractSession,
} from './helpers';

beforeEach(resetContractWorld);

/** Benign scene for every payment test: two mugs, no coupon, short plain text. */
const BENIGN: [string, number][] = [['mug', 2]];
async function readyToPay(s: ContractSession) {
  await s.fillCart(BENIGN);
  return ok(await s.openCheckout());
}

// ─── C1: exactly one customer debit per checkout intent ───────────────────────

describe('C1: one charge per checkout intent', () => {
  it('[C1] five concurrent Pay presses on one intent record exactly one customer debit', async () => {
    slowStore(); // give the check-then-charge gap a real width, as a networked store does
    const s = await contractSession();
    const open = await readyToPay(s);
    await Promise.all(Array.from({ length: 5 }, () => s.pay(open.intentId, 'Ada', '1 Elm St')));
    expect(await s.debits()).toHaveLength(1);
  });

  it('[C1] repeated Pay presses one after another (double and triple click) record one debit', async () => {
    const s = await contractSession();
    const open = await readyToPay(s);
    for (let i = 0; i < 3; i++) await s.pay(open.intentId, 'Ada', '1 Elm St');
    expect(await s.debits()).toHaveLength(1);
  });

  it('[C1] reopening checkout on the same cart version reuses the intent id, and paying across the reopen charges once', async () => {
    const s = await contractSession();
    const first = await readyToPay(s);
    const second = ok(await s.openCheckout());
    expect(second.intentId).toBe(first.intentId);
    await s.pay(first.intentId, 'Ada', '1 Elm St');
    await s.pay(second.intentId, 'Ada', '1 Elm St');
    expect(await s.debits()).toHaveLength(1);
  });

  it('[C1] the server mints the intent id: a client-invented Idempotency-Key charges nothing', async () => {
    const s = await contractSession();
    const open = await readyToPay(s);
    for (const forged of ['invented:1', `${open.intentId}x`, 'x'.repeat(40), `${open.intentId.split(':')[0]}:999`]) {
      const res = await s.pay(forged, 'Ada', '1 Elm St');
      expect(res.status, forged).toBe(409);
    }
    expect(await s.debits()).toHaveLength(0);
  });

  it('[C1] paying without an Idempotency-Key is refused and charges nothing', async () => {
    const s = await contractSession();
    await readyToPay(s);
    const res = await s.pay(null, 'Ada', '1 Elm St');
    expect(res.status).toBe(400);
    expect(errCode(res)).toBe('missing_key');
    expect(await s.debits()).toHaveLength(0);
  });

  it('[C1] property (P4, part 2): however many times Pay is pressed one after another, a valid cart is charged exactly once', async () => {
    await fc.assert(
      fc.asyncProperty(validCartArb, couponArb, fc.integer({ min: 1, max: 5 }), async (items, coupon, presses) => {
        const s = await contractSession();
        await s.fillCart(items.map((i) => [i.productId, i.qty]));
        if (coupon) await s.applyCoupon(coupon);
        const open = ok(await s.openCheckout());
        for (let i = 0; i < presses; i++) await s.pay(open.intentId, 'Ada', '1 Elm St');
        const debits = await s.debits();
        expect(debits).toHaveLength(1);
        expect(debits[0]!.intentId).toBe(open.intentId);
      }),
      PROP,
    );
  });

  it('[C1] property (P4, part 2): however many presses arrive at once, a valid cart is charged exactly once', async () => {
    slowStore(); // concurrency needs a real gap between check and write, as a networked store has
    await fc.assert(
      fc.asyncProperty(validCartArb, couponArb, fc.integer({ min: 2, max: 6 }), async (items, coupon, presses) => {
        const s = await contractSession();
        await s.fillCart(items.map((i) => [i.productId, i.qty]));
        if (coupon) await s.applyCoupon(coupon);
        const open = ok(await s.openCheckout());
        await Promise.all(Array.from({ length: presses }, () => s.pay(open.intentId, 'Ada', '1 Elm St')));
        const debits = await s.debits();
        expect(debits).toHaveLength(1);
        expect(debits[0]!.intentId).toBe(open.intentId);
      }),
      // Capped on purpose: a store round trip costs a real timer tick (about 15 ms on Windows), which makes each run
      // ~0.3 s, so the 1000 runs CI asks for would take minutes. 20 runs still catch a missing atomic claim every time.
      { ...PROP, numRuns: 20 },
    );
  });
});

// ─── C2: refresh / back safety ────────────────────────────────────────────────

describe('C2: a paid order is never lost and cannot be paid again after refresh or back', () => {
  it('[C2] a paid order persists: it is stored, retrievable by its owner and listed for them', async () => {
    const s = await contractSession();
    const { order } = await s.payNow();
    expect(await s.storedOrders()).toHaveLength(1);
    const got = ok(await s.order(order.id));
    expect(got.order.id).toBe(order.id);
    const listed = await s.run(() => orders.listForSession(s.sid));
    expect(listed.map((o) => o.id)).toContain(order.id);
  });

  it('[C2] after paying, the cart is empty, so there is nothing left to pay for', async () => {
    const s = await contractSession();
    await s.payNow();
    expect(ok(await s.cart()).cart.lines).toEqual([]);
    const reopen = await s.openCheckout();
    expect(reopen.status).toBe(400);
    expect(errCode(reopen)).toBe('empty_cart');
  });

  it('[C2] going back and paying the old intent again returns the same order and creates no second order', async () => {
    const s = await contractSession();
    const { open, order } = await s.payNow();
    const again = await s.pay(open.intentId, 'Ada Lovelace', '1 Analytical Way');
    expect(again.status).toBe(200);
    expect(ok(again).order.id).toBe(order.id);
    expect(await s.storedOrders()).toHaveLength(1);
  });

  it('[C2] refreshing after payment keeps showing the same single order', async () => {
    const s = await contractSession();
    const { order } = await s.payNow();
    const first = ok(await s.order(order.id));
    const second = ok(await s.order(order.id));
    expect(second.order).toEqual(first.order);
    expect(await s.storedOrders()).toHaveLength(1);
  });

  it('[C2] property: the stored order has exactly the items and total that were shown at checkout', async () => {
    await fc.assert(
      fc.asyncProperty(validCartArb, async (items) => {
        const s = await contractSession();
        await s.fillCart(items.map((i) => [i.productId, i.qty]));
        const open = ok(await s.openCheckout());
        const paid = ok(await s.pay(open.intentId, 'Ada', '1 Elm St')).order;
        const stored = ok(await s.order(paid.id)).order;
        const byId = (a: { productId: string }, b: { productId: string }) => a.productId.localeCompare(b.productId);
        expect([...stored.items].sort(byId)).toEqual([...items].sort(byId));
        expect(stored.totalCents).toBe(open.total);
      }),
      PROP,
    );
  });
});
