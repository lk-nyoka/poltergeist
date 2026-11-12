// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { _resetMemoryStoreForTest, getMemoryStore } from '@/store/memory';
import { ApiError } from '@/lib/http';
import { validateText } from '@/lib/text';
import { listSeamKeys } from '@/seams/registry';
import '@/seams/all';
import * as cart from './cart';
import * as checkout from './checkout';
import * as orders from './orders';
import * as reviews from './reviews';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return `${e.status}:${e.code}`;
    throw e;
  }
  return 'ok';
}

async function placeOrder(sid: string) {
  await cart.addLine(sid, 'mug', 1);
  const { intentId } = await checkout.open(sid);
  return checkout.pay(sid, intentId, 'Name', 'Address');
}

describe('orders', () => {
  beforeEach(() => _resetMemoryStoreForTest());

  it('a session reads its own order', async () => {
    const o = await placeOrder('a');
    expect((await orders.getForSession('a', o.id))?.id).toBe(o.id);
    expect((await orders.listForSession('a')).map((x) => x.id)).toEqual([o.id]);
  });

  it("another session cannot read the order, and the stranger's order is invisible", async () => {
    const o = await placeOrder('a');
    expect(await orders.getForSession('b', o.id)).toBeNull();
    expect(await orders.getForSession('a', 'stranger-order-fixed')).toBeNull();
    expect(await orders.listForSession('b')).toEqual([]);
  });

  it('reading through the seam writes no order_reads row (the caller does, after the seam)', async () => {
    const o = await placeOrder('a');
    await orders.getForSession('a', o.id);
    expect(await getMemoryStore().listOrderReads('a')).toEqual([]);
  });
});

describe('reviews', () => {
  beforeEach(() => _resetMemoryStoreForTest());

  it('stores text exactly as submitted and lists it back only to the author', async () => {
    const body = '  <b>hi</b> & "quotes"  ';
    await reviews.add('a', 'mug', body);
    expect((await reviews.list('a', 'mug')).map((r) => r.body)).toEqual([body]);
    expect(await reviews.list('b', 'mug')).toEqual([]);
  });

  it('rejects bad text and unknown products', async () => {
    expect(await code(reviews.add('a', 'mug', ''))).toBe('400:bad_text');
    expect(await code(reviews.add('a', 'mug', 'x'.repeat(101)))).toBe('400:bad_text');
    expect(await code(reviews.add('a', 'nope', 'fine'))).toBe('404:no_product');
    expect(await reviews.list('a', 'mug')).toEqual([]);
  });
});

describe('text/validateText', () => {
  it('accepts 1 and 100 code points, counting by code point not UTF-16 unit', () => {
    expect(validateText('a')).toBe('a');
    expect(validateText('a'.repeat(100))).toBe('a'.repeat(100));
    const emoji100 = '👻'.repeat(100); // 200 UTF-16 units, 100 code points
    expect(validateText(emoji100)).toBe(emoji100);
  });

  it('rejects empty, 101 code points, control characters, lone surrogates and non-strings', () => {
    const bad: unknown[] = ['', 'a'.repeat(101), '👻'.repeat(101), 'x\u0000y', 'x\u001Fy', 'x\ty', 'x\ny', '\uD800', 'a\uDC00b', 42, null, undefined, {}, ['a']];
    for (const b of bad) {
      expect(() => validateText(b), JSON.stringify(b)).toThrow(ApiError);
    }
  });

  it('keeps leading and trailing spaces and does not normalise', () => {
    expect(validateText('  a  ')).toBe('  a  ');
    expect(validateText('\u0065\u0301')).toBe('\u0065\u0301');
  });

  it('accepts U+0020 and U+007F (only U+0000–U+001F are forbidden)', () => {
    expect(validateText(' ')).toBe(' ');
    expect(validateText('\u007F')).toBe('\u007F');
  });
});

describe('seam registry completeness', () => {
  it('seams/all registers every domain seam exactly once', () => {
    expect(listSeamKeys()).toEqual([
      'cart/addLine',
      'cart/applyCoupon',
      'cart/get',
      'cart/removeLine',
      'cart/setQty',
      'cart/view',
      'checkout/claim',
      'checkout/open',
      'checkout/pay',
      'orders/getForSession',
      'orders/listForSession',
      'pricing/discount',
      'pricing/subtotal',
      'pricing/total',
      'render/CartLine',
      'render/CheckoutDialog',
      'render/PayButton',
      'render/ProductImage',
      'render/ReviewBody',
      'reviews/add',
      'reviews/list',
      'text/validateText',
    ]);
  });
});
