// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PROP, contractSession, couponArb, errCode, ok, resetContractWorld, validCartArb } from './helpers';

beforeEach(resetContractWorld);

// ─── C3: only whole-number quantities from 1 to 10 ────────────────────────────

describe('C3: quantity is a whole number from 1 to 10', () => {
  it('[C3] adding 0, -3, 0.5, 11 or 1e9 is refused with 400 and leaves the cart unchanged', async () => {
    const s = await contractSession();
    for (const qty of [0, -3, 0.5, 11, 1e9]) {
      const res = await s.addToCart('mug', qty);
      expect(res.status, `qty ${qty}`).toBe(400);
      expect(errCode(res), `qty ${qty}`).toBe('bad_quantity');
    }
    const { cart } = ok(await s.cart());
    expect(cart.lines).toEqual([]);
    expect(cart.version).toBe(0);
  });

  it('[C3] changing a line to 0, -3, 0.5, 11 or 1e9 is refused and the quantity stays', async () => {
    const s = await contractSession();
    await s.addToCart('mug', 1);
    for (const qty of [0, -3, 0.5, 11, 1e9]) {
      expect((await s.setQty('mug', qty)).status, `qty ${qty}`).toBe(400);
    }
    expect(ok(await s.cart()).cart.lines).toEqual([expect.objectContaining({ productId: 'mug', qty: 1 })]);
  });

  it('[C3] the boundaries 1 and 10 are accepted', async () => {
    const low = await contractSession();
    expect((await low.addToCart('mug', 1)).status).toBe(200);
    const high = await contractSession();
    expect((await high.addToCart('mug', 10)).status).toBe(200);
    expect(ok(await high.cart()).cart.lines[0]?.qty).toBe(10);
  });

  it('[C3] adding more of a product already in the cart cannot take it past 10', async () => {
    const s = await contractSession();
    await s.addToCart('mug', 6);
    const res = await s.addToCart('mug', 6);
    expect(res.status).toBe(400);
    expect(ok(await s.cart()).cart.lines[0]?.qty).toBe(6);
  });

  it('[C3] property: a quantity is accepted exactly when it is a whole number from 1 to 10', async () => {
    const anyNumber = fc.oneof(
      fc.integer({ min: -1000, max: 1000 }),
      fc.double({ noNaN: true, noDefaultInfinity: true }),
      fc.constantFrom(0.5, 1.5, 9.999, 10.001, 1e9, -1e9, Number.MAX_SAFE_INTEGER),
    );
    await fc.assert(
      fc.asyncProperty(anyNumber, async (qty) => {
        const s = await contractSession();
        const res = await s.addToCart('mug', qty);
        const valid = Number.isInteger(qty) && qty >= 1 && qty <= 10;
        expect(res.status, `qty ${qty}`).toBe(valid ? 200 : 400);
        const lines = ok(await s.cart()).cart.lines;
        expect(lines).toEqual(valid ? [expect.objectContaining({ qty })] : []);
      }),
      PROP,
    );
  });
});

// ─── C4: at most one coupon, and a discount never exceeds the subtotal ────────

describe('C4: one coupon per order, discount never above the subtotal', () => {
  it('[C4] a second, different coupon is refused with 409 and the first stays applied', async () => {
    const s = await contractSession();
    await s.addToCart('mug', 2);
    expect((await s.applyCoupon('SPOOKY5')).status).toBe(200);
    const second = await s.applyCoupon('HAUNT15');
    expect(second.status).toBe(409);
    expect(errCode(second)).toBe('coupon_already_applied');
    const { cart } = ok(await s.cart());
    expect(cart.couponCode).toBe('SPOOKY5');
    expect(cart.discountCents).toBe(500); // still only the first coupon's $5.00
  });

  it('[C4] applying the same coupon twice is refused and the discount is not doubled', async () => {
    const s = await contractSession();
    await s.addToCart('mug', 2);
    await s.applyCoupon('SPOOKY5');
    expect((await s.applyCoupon('SPOOKY5')).status).toBe(409);
    expect(ok(await s.cart()).cart.discountCents).toBe(500);
  });

  it('[C4] the fixed coupon SPOOKY5 takes exactly $5.00 off', async () => {
    for (const qty of [1, 2, 7]) {
      const s = await contractSession();
      await s.addToCart('mug', qty);
      await s.applyCoupon('SPOOKY5');
      expect(ok(await s.cart()).cart.discountCents, `${qty} mugs`).toBe(500);
    }
  });

  it('[C4] a coupon that does not exist is refused and does not use up the one coupon slot', async () => {
    const s = await contractSession();
    await s.addToCart('mug', 1);
    for (const bad of ['NOPE', '', 'spooky5', 'constructor', '__proto__']) {
      expect((await s.applyCoupon(bad)).status, bad).toBe(400);
    }
    expect(ok(await s.cart()).cart.couponCode).toBeNull();
    expect((await s.applyCoupon('HAUNT15')).status).toBe(200);
  });

  it('[C4] property: the discount is never negative and never more than the subtotal', async () => {
    await fc.assert(
      fc.asyncProperty(validCartArb, couponArb, async (items, coupon) => {
        const s = await contractSession();
        await s.fillCart(items.map((i) => [i.productId, i.qty]));
        if (coupon) await s.applyCoupon(coupon);
        const { cart } = ok(await s.cart());
        expect(cart.discountCents).toBeGreaterThanOrEqual(0);
        expect(cart.discountCents).toBeLessThanOrEqual(cart.subtotalCents);
      }),
      PROP,
    );
  });
});
