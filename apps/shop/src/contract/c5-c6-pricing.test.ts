// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PRODUCTS, priceOf } from '@/domain/catalogue';
import { PROP, contractSession, couponArb, ok, resetContractWorld, validCartArb } from './helpers';

beforeEach(resetContractWorld);

/** Independent reference for C6, built from the subtotal the shop REPORTS so a wrong price (C5) cannot fail a C6 test. */
function expectedTotal(subtotalCents: number, coupon: string | null): number {
  if (coupon === 'SPOOKY5') return subtotalCents - Math.min(500, subtotalCents);
  if (coupon === 'HAUNT15') return Math.floor((subtotalCents * 85 + 50) / 100); // 15% off, rounded half-up ONCE
  return subtotalCents;
}

// ─── C5: prices come from the server only ─────────────────────────────────────

describe('C5: server prices only', () => {
  it('[C5] every product is priced at its canonical catalogue price', async () => {
    for (const p of PRODUCTS) {
      const s = await contractSession();
      await s.addToCart(p.id, 1);
      const { cart } = ok(await s.cart());
      expect(cart.lines[0]?.unitCents, p.id).toBe(p.price);
      expect(cart.subtotalCents, p.id).toBe(p.price);
    }
  });

  it('[C5] a price, total or discount sent by the client is refused and changes nothing', async () => {
    const s = await contractSession();
    for (const extra of [{ price: 1 }, { unitCents: 1 }, { total: 0 }, { totalCents: 0 }, { discount: 9999 }, { lineCents: 1 }]) {
      const res = await s.post('/api/cart', { op: 'add', productId: 'mug', qty: 1, ...extra });
      expect(res.status, JSON.stringify(extra)).toBe(400);
    }
    expect(ok(await s.cart()).cart.lines).toEqual([]);
    await s.addToCart('mug', 1);
    expect(ok(await s.cart()).cart.subtotalCents).toBe(priceOf('mug'));
  });

  it('[C5] a total sent at checkout is refused and nothing is charged', async () => {
    const s = await contractSession();
    await s.addToCart('mug', 1);
    const open = ok(await s.openCheckout());
    const res = await s.post('/api/checkout', { name: 'Ada', address: '1 Elm St', total: 1, price: 1 }, { 'idempotency-key': open.intentId });
    expect(res.status).toBe(400);
    expect(await s.debits()).toHaveLength(0);
  });

  it('[C5] checkout charges the canonical prices', async () => {
    const s = await contractSession();
    await s.fillCart([['kettle', 1], ['lantern', 2], ['mug', 3]]);
    const canonical = priceOf('kettle') + 2 * priceOf('lantern') + 3 * priceOf('mug');
    const { order } = await s.payNow({ items: [] }); // the cart is already filled above
    expect(order.totalCents).toBe(canonical);
    for (const d of await s.debits()) expect(d.amountCents).toBe(-canonical);
  });

  it('[C5] property: with no coupon, every unit price and the subtotal are the canonical ones', async () => {
    await fc.assert(
      fc.asyncProperty(validCartArb, async (items) => {
        const s = await contractSession();
        await s.fillCart(items.map((i) => [i.productId, i.qty]));
        const { cart } = ok(await s.cart());
        for (const line of cart.lines) expect(line.unitCents).toBe(priceOf(line.productId));
        expect(cart.subtotalCents).toBe(items.reduce((sum, i) => sum + priceOf(i.productId) * i.qty, 0));
      }),
      PROP,
    );
  });
});

// ─── C6: totals never negative, rounded once, at the end ──────────────────────

describe('C6: totals are non-negative whole cents, rounded half-up once', () => {
  it('[C6] property (P4, part 1): the total is the subtotal less the discount, rounded once, whole cents and never negative', async () => {
    await fc.assert(
      fc.asyncProperty(validCartArb, couponArb, async (items, coupon) => {
        const s = await contractSession();
        await s.fillCart(items.map((i) => [i.productId, i.qty]));
        if (coupon) await s.applyCoupon(coupon);
        const { cart } = ok(await s.cart());
        expect(Number.isInteger(cart.totalCents)).toBe(true);
        expect(cart.totalCents).toBeGreaterThanOrEqual(0);
        expect(cart.totalCents).toBe(expectedTotal(cart.subtotalCents, coupon));
      }),
      PROP,
    );
  });

  it('[C6] exact halves round up: 15% off a subtotal that lands on .5 of a cent', async () => {
    // Ghost Lantern x odd quantities land on exactly .5 (e.g. 1850 x 0.85 = 1572.5).
    for (let qty = 1; qty <= 10; qty++) {
      const s = await contractSession();
      await s.addToCart('lantern', qty);
      await s.applyCoupon('HAUNT15');
      const { cart } = ok(await s.cart());
      expect(cart.totalCents, `${qty} lanterns`).toBe(expectedTotal(cart.subtotalCents, 'HAUNT15'));
    }
  });

  it('[C6] a total is never negative or fractional, for any single product with any coupon', async () => {
    for (const p of PRODUCTS) {
      for (const coupon of [null, 'SPOOKY5', 'HAUNT15']) {
        const s = await contractSession();
        await s.addToCart(p.id, 1);
        if (coupon) await s.applyCoupon(coupon);
        const total = ok(await s.cart()).cart.totalCents;
        expect(Number.isInteger(total), `${p.id} ${coupon}`).toBe(true);
        expect(total, `${p.id} ${coupon}`).toBeGreaterThanOrEqual(0);
      }
    }
  });

  it('[C6] checkout charges exactly the total that was shown: cart, checkout and order agree', async () => {
    const s = await contractSession();
    await s.fillCart([['lantern', 3], ['candle', 1]]);
    await s.applyCoupon('HAUNT15');
    const shown = ok(await s.cart()).cart.totalCents;
    const { open, order } = await s.payNow({ items: [] }); // the cart (and coupon) are already set above
    expect(open.total).toBe(shown);
    expect(order.totalCents).toBe(shown);
  });
});
