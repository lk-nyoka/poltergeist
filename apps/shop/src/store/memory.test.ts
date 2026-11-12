// @vitest-environment node
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { getMemoryStore, _resetMemoryStoreForTest } from './memory';

describe('MemoryStore', () => {
  beforeEach(() => _resetMemoryStoreForTest());

  it('claimIntent is atomic: 5 concurrent calls return exactly 1 true', async () => {
    const store = getMemoryStore();
    const intentId = 'test-intent-claim';
    const results = await Promise.all(
      Array.from({ length: 5 }, () => store.claimIntent(intentId)),
    );
    const trueCount = results.filter(Boolean).length;
    expect(trueCount).toBe(1);
  });

  it('seeds the stranger session and order on construction', async () => {
    const store = getMemoryStore();
    const order = await store.getOrder('stranger-order-fixed');
    expect(order).not.toBeNull();
    expect(order!.sid).toBe('stranger');
    expect(order!.items[0]?.productId).toBe('clock');
  });

  it('stranger intent is already claimed', async () => {
    const store = getMemoryStore();
    const claimed = await store.claimIntent('stranger:0');
    expect(claimed).toBe(false); // already claimed during seed
  });

  it('getCart creates an empty cart for a new session', async () => {
    const store = getMemoryStore();
    const cart = await store.getCart('new-session');
    expect(cart.lines).toHaveLength(0);
    expect(cart.couponCode).toBeNull();
    expect(cart.version).toBe(0);
  });

  it('upsertIntent is idempotent', async () => {
    const store = getMemoryStore();
    await store.upsertIntent({ id: 'i1', sid: 's1' });
    await store.upsertIntent({ id: 'i1', sid: 's1' });
    const intents = await store.listIntents('s1');
    expect(intents).toHaveLength(1);
  });

  it('listLedger returns only entries for the given sid and ledger', async () => {
    const store = getMemoryStore();
    await store.addLedger({ sid: 'a', ledger: 'customer', amountCents: -100, memo: 'test', intentId: null });
    await store.addLedger({ sid: 'b', ledger: 'customer', amountCents: -200, memo: 'test', intentId: null });
    await store.addLedger({ sid: 'a', ledger: 'till', amountCents: 100, memo: 'test' });
    const aCustomer = await store.listLedger('a', 'customer');
    expect(aCustomer).toHaveLength(1);
    expect(aCustomer[0]!.amountCents).toBe(-100);
  });

  it('is ONE process-wide store even when the module is loaded twice (Next bundles routes and pages separately)', async () => {
    const first = await import('./memory');
    first.getMemoryStore().ensureSession('shared-check');
    await first.getMemoryStore().saveCart({ id: 'c', sid: 'shared-check', version: 5, lines: [], couponCode: null });
    vi.resetModules();
    const second = await import('./memory'); // a second, independent copy of the module
    expect(second).not.toBe(first);
    expect(second.getMemoryStore()).toBe(first.getMemoryStore());
    expect((await second.getMemoryStore().getCart('shared-check')).version).toBe(5);
  });

  it('health returns true', async () => {
    expect(await getMemoryStore().health()).toBe(true);
  });

  it('_resetMemoryStoreForTest re-seeds the stranger', async () => {
    const store1 = getMemoryStore();
    await store1.ensureSession('temp');
    _resetMemoryStoreForTest();
    const store2 = getMemoryStore();
    const order = await store2.getOrder('stranger-order-fixed');
    expect(order).not.toBeNull();
  });

  it('reviews are scoped by session', async () => {
    const store = getMemoryStore();
    await store.addReview({ sid: 'a', productId: 'mug', body: 'Great!' });
    await store.addReview({ sid: 'b', productId: 'mug', body: 'Bad.' });
    const aReviews = await store.listReviews('a', 'mug');
    expect(aReviews).toHaveLength(1);
    expect(aReviews[0]!.body).toBe('Great!');
  });
});
