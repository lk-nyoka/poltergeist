// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { _resetMemoryStoreForTest } from '@/store/memory';
import { ApiError } from '@/lib/http';
import * as cart from './cart';

const SID = 'cart-session';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return `${e.status}:${e.code}`;
    throw e;
  }
  return 'ok';
}

describe('cart', () => {
  beforeEach(() => _resetMemoryStoreForTest());

  it('adds a line and bumps the version by 1 on every change', async () => {
    expect((await cart.get(SID)).version).toBe(0);
    expect((await cart.addLine(SID, 'mug', 2)).version).toBe(1);
    expect((await cart.setQty(SID, 'mug', 3)).version).toBe(2);
    expect((await cart.applyCoupon(SID, 'SPOOKY5')).version).toBe(3);
    expect((await cart.removeLine(SID, 'mug')).version).toBe(4);
  });

  it('adding an existing product merges quantities', async () => {
    await cart.addLine(SID, 'mug', 2);
    const c = await cart.addLine(SID, 'mug', 3);
    expect(c.lines).toEqual([{ productId: 'mug', qty: 5 }]);
  });

  it('rejects 0, -3, 0.5, 11, 1e9 and non-numbers with 400 and leaves the cart unchanged', async () => {
    await cart.addLine(SID, 'mug', 1);
    const before = await cart.get(SID);
    for (const bad of [0, -3, 0.5, 11, 1e9, '3', null, NaN]) {
      expect(await code(cart.addLine(SID, 'kettle', bad as number))).toBe('400:bad_quantity');
      expect(await code(cart.setQty(SID, 'mug', bad as number))).toBe('400:bad_quantity');
    }
    expect(await cart.get(SID)).toEqual(before);
  });

  it('accepts the boundaries 1 and 10, and rejects a merge that would pass 10', async () => {
    expect(await code(cart.addLine(SID, 'mug', 1))).toBe('ok');
    expect(await code(cart.setQty(SID, 'mug', 10))).toBe('ok');
    expect(await code(cart.addLine(SID, 'mug', 1))).toBe('400:bad_quantity');
    expect((await cart.get(SID)).lines[0]?.qty).toBe(10);
  });

  it('unknown products are 404, never a crash', async () => {
    expect(await code(cart.addLine(SID, 'nope', 1))).toBe('404:no_product');
    expect(await code(cart.addLine(SID, 'constructor', 1))).toBe('404:no_product');
    expect(await code(cart.setQty(SID, 'mug', 1))).toBe('404:no_line');
    expect(await code(cart.removeLine(SID, 'mug'))).toBe('404:no_line');
  });

  it('a second coupon is rejected with 409 and the first stays', async () => {
    await cart.applyCoupon(SID, 'SPOOKY5');
    expect(await code(cart.applyCoupon(SID, 'HAUNT15'))).toBe('409:coupon_already_applied');
    expect((await cart.get(SID)).couponCode).toBe('SPOOKY5');
  });

  it('unknown coupons are 400, including prototype keys', async () => {
    for (const bad of ['NOPE', '', 'constructor', '__proto__', 'toString']) {
      expect(await code(cart.applyCoupon(SID, bad))).toBe('400:bad_coupon');
    }
    expect((await cart.get(SID)).couponCode).toBeNull();
  });

  it('carts are per session', async () => {
    await cart.addLine('a', 'mug', 1);
    expect((await cart.get('b')).lines).toHaveLength(0);
  });

  it('view computes every amount on the server', async () => {
    await cart.addLine(SID, 'mug', 2); // 2 × 1200
    await cart.applyCoupon(SID, 'HAUNT15');
    const v = await cart.view(SID);
    expect(v.subtotalCents).toBe(2400);
    expect(v.totalCents).toBe(2040);
    expect(v.discountCents).toBe(360);
    expect(v.lines[0]).toMatchObject({ productId: 'mug', name: 'Cursed Mug', qty: 2, unitCents: 1200, lineCents: 2400 });
  });
});
