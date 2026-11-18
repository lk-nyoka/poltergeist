import { describe, it, expect } from 'vitest';
import { FakeDriver } from './FakeDriver';
import { STRANGER_ORDER_ID, type FaultName } from './FakeShop';
import type { PageEvent } from '../driver';

const btn = (name: string) => ({ role: 'button', name });
const box = (name: string) => ({ role: 'textbox', name });

async function checkoutWith(d: FakeDriver, qty = '1') {
  await d.goto('/product/p1');
  await d.type({ role: 'spinbutton', name: 'Quantity' }, qty);
  await d.click(btn('Add to cart'));
  await d.goto('/cart');
  await d.click(btn('Checkout'));
}

function collect(d: FakeDriver): PageEvent[] {
  const events: PageEvent[] = [];
  d.onEvent((e) => events.push(e));
  return events;
}

describe('FakeDriver on the clean shop', () => {
  it('pays once and shows the order', async () => {
    const d = new FakeDriver({ seed: 1 });
    await checkoutWith(d);
    await d.type(box('Name'), 'Ada');
    await d.click(btn('Pay'));
    expect(await d.currentPath()).toMatch(/^\/orders\//);
    expect((await d.query('[data-testid=order-name]'))[0]?.text).toBe('Ada');
    expect((await d.query('[data-testid=order-total]'))[0]?.text).toBe('$49.99');
    const l = d.shop.ledgers(d.sessionToken());
    expect(l.customer.entries).toHaveLength(1);
    expect(l.till.entries[0]?.amount_cents).toBe(4999);
  });

  it('is idempotent per intent through the API', async () => {
    const d = new FakeDriver({ seed: 1 });
    await checkoutWith(d);
    const id = d.shop.intents(d.sessionToken())[0]!.id;
    for (let i = 0; i < 3; i++) await d.request('POST', '/api/checkout', { intentId: id, name: 'A', address: 'B' });
    expect(d.shop.ledgers(d.sessionToken()).customer.entries).toHaveLength(1);
    expect(d.shop.orders(d.sessionToken()).orders).toHaveLength(1);
  });

  it('keeps the order after reload and cannot pay again after back', async () => {
    const d = new FakeDriver({ seed: 1 });
    await checkoutWith(d);
    await d.click(btn('Pay'));
    await d.reload();
    expect((await d.query('[data-testid=order-id]')).length).toBe(1);
    await d.back();
    await d.click(btn('Checkout'));
    expect(await d.query('[role=dialog]')).toHaveLength(0);
    expect(d.shop.ledgers(d.sessionToken()).customer.entries).toHaveLength(1);
  });

  it('rejects bad quantities, second coupon, strangers and bad text with 4xx', async () => {
    const d = new FakeDriver({ seed: 1 });
    for (const qty of [-3, 0, 0.5, 11, 1e9]) {
      expect((await d.request('POST', '/api/cart', { productId: 'p1', qty })).status).toBe(422);
    }
    expect((await d.request('POST', '/api/cart', { productId: 'p1', qty: 1, price: 1 })).status).toBe(200);
    expect((await d.request('POST', '/api/cart', { couponCode: 'SAVE5' })).status).toBe(200);
    expect((await d.request('POST', '/api/cart', { couponCode: 'SAVE3' })).status).toBe(409);
    expect((await d.request('GET', `/api/orders/${STRANGER_ORDER_ID}`)).status).toBe(404);
    expect(d.shop.orders(d.sessionToken()).reads).toEqual([]);
    const open = await d.request('POST', '/api/checkout/open');
    const intentId = (open.json as { intentId: string }).intentId;
    for (const name of ['x'.repeat(101), 'a\u0007b', '\uD800']) {
      expect((await d.request('POST', '/api/checkout', { intentId, name, address: '' })).status).toBe(422);
    }
  });

  it('traps focus in the dialog, closes on Escape and returns focus', async () => {
    const d = new FakeDriver({ seed: 1 });
    await checkoutWith(d);
    expect((await d.focused())?.name).toBe('Name');
    const seen = new Set<string>();
    for (let i = 0; i < 8; i++) {
      await d.press('Tab');
      seen.add((await d.focused())!.name);
    }
    expect([...seen].sort()).toEqual(['Address', 'Close', 'Name', 'Pay']);
    await d.press('Escape');
    expect(await d.query('[role=dialog]')).toHaveLength(0);
    expect((await d.focused())?.name).toBe('Checkout');
  });

  it('has no axe violations and emits no events', async () => {
    const d = new FakeDriver({ seed: 1 });
    const events = collect(d);
    await d.goto('/');
    expect(await d.axe()).toEqual([]);
    expect(events).toEqual([]);
  });

  it('stops delivering events after unsubscribe and records pointer', async () => {
    const d = new FakeDriver({ seed: 1 });
    const events: PageEvent[] = [];
    const off = d.onEvent((e) => events.push(e));
    off();
    await d.request('GET', '/api/nope');
    d.pointer(3, 4);
    expect(events).toEqual([]);
    expect(d.lastPointer).toEqual({ x: 3, y: 4 });
  });
});

describe('FakeDriver faults', () => {
  const driver = (...faults: FaultName[]) => new FakeDriver({ seed: 7, faults });

  it('skipClaim: two Pay clicks give two debits for one intent', async () => {
    const d = driver('skipClaim');
    await checkoutWith(d);
    await d.click(btn('Pay'), { count: 2, delayMs: 20 });
    const entries = d.shop.ledgers(d.sessionToken()).customer.entries;
    expect(entries).toHaveLength(2);
    expect(entries[0]!.intent_id).toBe(entries[1]!.intent_id);
  });

  it('loseOrderOnRefresh: debit stays, order disappears', async () => {
    const d = driver('loseOrderOnRefresh');
    await checkoutWith(d);
    await d.click(btn('Pay'));
    await d.reload();
    expect(d.shop.ledgers(d.sessionToken()).customer.entries).toHaveLength(1);
    expect(d.shop.orders(d.sessionToken()).orders).toHaveLength(0);
  });

  it('negativeQty: out-of-contract quantity is accepted', async () => {
    const d = driver('negativeQty');
    expect((await d.request('POST', '/api/cart', { productId: 'p1', qty: -3 })).status).toBe(200);
    expect((await d.request('POST', '/api/cart', { productId: 'p1', qty: 0.5 })).status).toBe(200);
  });

  it('stackCoupons: second coupon is accepted', async () => {
    const d = driver('stackCoupons');
    await d.request('POST', '/api/cart', { productId: 'p1', qty: 1 });
    expect((await d.request('POST', '/api/cart', { couponCode: 'SAVE5' })).status).toBe(200);
    expect((await d.request('POST', '/api/cart', { couponCode: 'SAVE3' })).status).toBe(200);
  });

  it('trustClientPrice: order total follows the body price', async () => {
    const d = driver('trustClientPrice');
    await d.request('POST', '/api/cart', { productId: 'p1', qty: 1, price: 1 });
    const { json } = await d.request('POST', '/api/checkout/open');
    const r = await d.request('POST', '/api/checkout', { intentId: (json as { intentId: string }).intentId });
    expect((r.json as { order: { total_cents: number } }).order.total_cents).toBe(1);
  });

  it('noRounding: percent coupon leaves fractional cents', async () => {
    const d = driver('noRounding');
    await d.request('POST', '/api/cart', { productId: 'p8', qty: 1 });
    await d.request('POST', '/api/cart', { couponCode: 'TENOFF' });
    const { json } = await d.request('POST', '/api/checkout/open');
    const r = await d.request('POST', '/api/checkout', { intentId: (json as { intentId: string }).intentId });
    expect(Number.isInteger((r.json as { order: { total_cents: number } }).order.total_cents)).toBe(false);
  });

  it('renderHtml: handler payload fires the beacon and mangles textContent', async () => {
    const d = driver('renderHtml');
    const events = collect(d);
    await d.goto('/product/p1');
    await d.type(box('Review'), '<img src=x onerror="window.__poltergeistBeacon(\'tok1\')">hi');
    await d.click(btn('Post review'));
    expect(events.filter((e) => e.kind === 'beacon').map((e) => e.detail)).toEqual(['tok1']);
    expect((await d.query('[data-testid=review-0]'))[0]?.text).toBe('hi');
  });

  it('dropAlt: axe reports image-alt', async () => {
    const d = driver('dropAlt');
    await d.goto('/');
    expect((await d.axe()).map((v) => v.id)).toEqual(['image-alt']);
  });

  it('noFocusTrap: Tab escapes the dialog', async () => {
    const d = driver('noFocusTrap');
    await checkoutWith(d);
    const names = new Set<string>();
    for (let i = 0; i < 4; i++) {
      await d.press('Tab');
      names.add((await d.focused())!.name);
    }
    expect([...names].some((n) => ['Home', 'Cart', 'Apply coupon', 'Coupon code'].includes(n))).toBe(true);
  });

  it('noFocusReturn: focus is lost after close', async () => {
    const d = driver('noFocusReturn');
    await checkoutWith(d);
    await d.click(btn('Close'));
    expect(await d.focused()).toBeNull();
  });

  it('leakOrders: the stranger order is served and the read is recorded', async () => {
    const d = driver('leakOrders');
    expect((await d.request('GET', `/api/orders/${STRANGER_ORDER_ID}`)).status).toBe(200);
    expect(d.shop.orders(d.sessionToken()).reads).toEqual([{ orderId: STRANGER_ORDER_ID }]);
  });

  it('truncateText: long review is cut to 50 code points', async () => {
    const d = driver('truncateText');
    await d.request('POST', '/api/reviews', { productId: 'p1', body: 'x'.repeat(80) });
    expect(d.shop.reviews(d.sessionToken(), 'p1')[0]).toHaveLength(50);
  });

  it('throwOnLongName: 41 characters give a 500 and an http5xx event', async () => {
    const d = driver('throwOnLongName');
    const events = collect(d);
    await d.request('POST', '/api/cart', { productId: 'p1', qty: 1 });
    const { json } = await d.request('POST', '/api/checkout/open');
    const r = await d.request('POST', '/api/checkout', {
      intentId: (json as { intentId: string }).intentId,
      name: 'n'.repeat(41),
    });
    expect(r.status).toBe(500);
    expect(events.map((e) => e.kind)).toEqual(['http5xx']);
  });
});

describe('FakeDriver sessions', () => {
  it('cloneOf keeps the fault set, clean drops it', async () => {
    const d = new FakeDriver({ seed: 3, faults: ['leakOrders'] });
    const base = d.sessionToken();
    await d.freshSession({ cloneOf: base });
    expect(d.sessionToken()).not.toBe(base);
    expect([...d.shop.faults(d.sessionToken())]).toEqual(['leakOrders']);
    await d.freshSession({ clean: true });
    expect([...d.shop.faults(d.sessionToken())]).toEqual([]);
  });

  it('demo, count and mutantIds pick faults; bad input throws', async () => {
    const d = new FakeDriver({ seed: 3 });
    await d.freshSession({ demo: true });
    expect([...d.shop.faults(d.sessionToken())].sort()).toEqual(['dropAlt', 'skipClaim', 'stackCoupons']);
    await d.freshSession({ count: 2 });
    expect(d.shop.faults(d.sessionToken()).size).toBe(2);
    await d.freshSession({ mutantIds: ['noRounding'] });
    expect([...d.shop.faults(d.sessionToken())]).toEqual(['noRounding']);
    await expect(d.freshSession({ mutantIds: ['abc12345'] })).rejects.toThrow();
    await expect(d.freshSession({ cloneOf: 'nope' })).rejects.toThrow();
  });

  it('sessions are isolated', async () => {
    const d = new FakeDriver({ seed: 3 });
    await checkoutWith(d);
    await d.click(btn('Pay'));
    await d.freshSession({ clean: true });
    expect(d.shop.ledgers(d.sessionToken()).customer.entries).toHaveLength(0);
  });
});
