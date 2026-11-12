// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { _resetMemoryStoreForTest, getMemoryStore } from '@/store/memory';
import { ApiError } from '@/lib/http';
import * as cart from './cart';
import * as checkout from './checkout';

const SID = 'pay-session';

async function code(p: Promise<unknown>): Promise<string> {
  try {
    await p;
  } catch (e) {
    if (e instanceof ApiError) return `${e.status}:${e.code}`;
    throw e;
  }
  return 'ok';
}

async function openWithMug(sid = SID) {
  await cart.addLine(sid, 'mug', 2); // 2400
  return checkout.open(sid);
}

describe('checkout', () => {
  beforeEach(() => _resetMemoryStoreForTest());

  it('open mints cart_id:version and returns the same id when reopened on the same version', async () => {
    const a = await openWithMug();
    const b = await checkout.open(SID);
    const c = await cart.get(SID);
    expect(a.intentId).toBe(`${c.id}:${c.version}`);
    expect(b.intentId).toBe(a.intentId);
    expect(a.total).toBe(2400);
    expect(await getMemoryStore().listIntents(SID)).toHaveLength(1);
  });

  it('a changed cart gets a new intent id', async () => {
    const a = await openWithMug();
    await cart.addLine(SID, 'kettle', 1);
    const b = await checkout.open(SID);
    expect(b.intentId).not.toBe(a.intentId);
  });

  it('refuses to open checkout on an empty cart', async () => {
    expect(await code(checkout.open(SID))).toBe('400:empty_cart');
  });

  it('pay writes one debit, one till credit and one order, then starts a new empty cart', async () => {
    const { intentId } = await openWithMug();
    const order = await checkout.pay(SID, intentId, 'Ada Lovelace', '1 Analytical Way');
    const store = getMemoryStore();
    const customer = await store.listLedger(SID, 'customer');
    const till = await store.listLedger(SID, 'till');
    expect(customer).toHaveLength(1);
    expect(customer[0]).toMatchObject({ amountCents: -2400, intentId, memo: 'Bank: $24.00 debited' });
    expect(till).toHaveLength(1);
    expect(till[0]).toMatchObject({ amountCents: 2400, intentId });
    expect(order).toMatchObject({ sid: SID, intentId, totalCents: 2400, name: 'Ada Lovelace', address: '1 Analytical Way' });
    expect((await cart.get(SID)).lines).toHaveLength(0);
  });

  it('applies the accepted coupon to the charged total and records it on the order', async () => {
    await cart.addLine(SID, 'mug', 2);
    await cart.applyCoupon(SID, 'SPOOKY5');
    const { intentId, total } = await checkout.open(SID);
    expect(total).toBe(1900);
    const order = await checkout.pay(SID, intentId, 'A', 'B');
    expect(order.totalCents).toBe(1900);
    expect(order.couponCodes).toEqual(['SPOOKY5']);
  });

  it('paying the same intent again returns the existing order and does not charge again', async () => {
    const { intentId } = await openWithMug();
    const first = await checkout.pay(SID, intentId, 'A', 'B');
    const second = await checkout.pay(SID, intentId, 'A', 'B');
    expect(second.id).toBe(first.id);
    expect(await getMemoryStore().listLedger(SID, 'customer')).toHaveLength(1);
    expect(await getMemoryStore().listOrders(SID)).toHaveLength(1);
  });

  it('five concurrent pays on one intent produce exactly one debit and one order', async () => {
    const { intentId } = await openWithMug();
    const orders = await Promise.all(Array.from({ length: 5 }, () => checkout.pay(SID, intentId, 'A', 'B')));
    expect(new Set(orders.map((o) => o.id)).size).toBe(1);
    expect(await getMemoryStore().listLedger(SID, 'customer')).toHaveLength(1);
    expect(await getMemoryStore().listLedger(SID, 'till')).toHaveLength(1);
    expect(await getMemoryStore().listOrders(SID)).toHaveLength(1);
  });

  it('a stale intent (cart changed after opening) is 409 and charges nothing', async () => {
    const { intentId } = await openWithMug();
    await cart.addLine(SID, 'kettle', 1);
    expect(await code(checkout.pay(SID, intentId, 'A', 'B'))).toBe('409:stale_intent');
    expect(await getMemoryStore().listLedger(SID, 'customer')).toHaveLength(0);
  });

  it("another session's intent, and unknown intents, are 409", async () => {
    const { intentId } = await openWithMug('owner');
    expect(await code(checkout.pay('thief', intentId, 'A', 'B'))).toBe('409:stale_intent');
    expect(await code(checkout.pay(SID, 'no-such:1', 'A', 'B'))).toBe('409:stale_intent');
    expect(await code(checkout.pay(SID, 'stranger:0', 'A', 'B'))).toBe('409:stale_intent');
  });

  it('bad name or address is 400 and charges nothing', async () => {
    const { intentId } = await openWithMug();
    for (const [n, a] of [['', 'x'], ['x', ''], ['x'.repeat(101), 'x'], ['x', 'bad\u0007'], [undefined, 'x'], ['x', 42]]) {
      expect(await code(checkout.pay(SID, intentId, n, a))).toBe('400:bad_text');
    }
    expect(await getMemoryStore().listLedger(SID, 'customer')).toHaveLength(0);
  });

  it('stores name and address exactly as submitted: no trim, no normalisation', async () => {
    const { intentId } = await openWithMug();
    const name = '  Zoë  '; // spaces kept, NFC é kept
    const order = await checkout.pay(SID, intentId, name, '\u0065\u0301 Street'); // decomposed é kept
    expect(order.name).toBe(name);
    expect(order.address).toBe('\u0065\u0301 Street');
  });
});
