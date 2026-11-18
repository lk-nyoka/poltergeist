import { describe, expect, it, vi } from 'vitest';
import { emptyObserver, httpObserver, isHauntedShop } from './http-observer';

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

function fake(routes: Record<string, unknown>) {
  return vi.fn(async (url: URL | string, init?: RequestInit) => {
    const u = new URL(String(url));
    const key = u.pathname + u.search;
    if (!(key in routes)) return json({ error: { code: 'not_found' } }, 404);
    return json(routes[key]);
    void init;
  });
}

const ledgerView = { start: 10000, entries: [{ id: 1, sid: 's', ledger: 'customer', amount_cents: -500, memo: 'pay', intent_id: 'i1', created_at: 1 }] };
const base = 'http://127.0.0.1:3000';

describe('httpObserver', () => {
  it('sends the server secret and the observed token, and maps the shapes', async () => {
    const f = fake({
      '/api/oracle/ledgers': { customer: ledgerView, till: { start: 0, entries: [] } },
      '/api/oracle/orders?reads=1': {
        orders: [{ id: 'o1', sid: 's', intent_id: 'i1', items: [{ productId: 'p', qty: 1 }], coupon_codes: [], total_cents: 500, created_at: 1 }],
        reads: [{ orderId: 'stranger-order-fixed', at: 5 }],
      },
      '/api/oracle/intents': { intents: [{ id: 'i1', sid: 's', created_at: 1 }] },
    });
    const o = httpObserver({ baseUrl: base, serverSecret: 'sekret', fetch: f as never });
    const l = await o.ledgers('tok');
    expect(l.customer.entries).toEqual([{ id: 1, amount_cents: -500, memo: 'pay', intent_id: 'i1' }]);
    const orders = await o.orders('tok', { reads: true });
    expect(orders.orders[0]).toMatchObject({ id: 'o1', intent_id: 'i1', total_cents: 500 });
    expect(orders.reads).toEqual([{ orderId: 'stranger-order-fixed' }]);
    expect(await o.intents('tok')).toEqual([{ id: 'i1' }]);
    const init = f.mock.calls[0]![1] as { headers: Record<string, string> };
    expect(init.headers).toMatchObject({ 'x-poltergeist-secret': 'sekret', 'x-pg-observe': 'tok' });
  });

  it('skips the reads query when reads are not wanted', async () => {
    const f = fake({ '/api/oracle/orders': { orders: [] } });
    const o = httpObserver({ baseUrl: base, serverSecret: 's', fetch: f as never });
    expect(await o.orders('t', { reads: false })).toEqual({ orders: [], reads: [] });
  });

  it('reads clean products once and caches them', async () => {
    const f = fake({
      '/api/oracle/products': {
        products: [{ id: 'kettle', name: 'K', price: 1200, description: 'd', altText: 'a' }],
        coupons: [{ code: 'TEN', kind: 'percent', percent: 10 }],
      },
    });
    const o = httpObserver({ baseUrl: base, serverSecret: 's', fetch: f as never });
    const c = await o.cleanProducts();
    expect(c).toEqual({ prices: { kettle: 1200 }, coupons: { TEN: { code: 'TEN', kind: 'percent', percent: 10 } } });
    await o.cleanProducts();
    expect(f).toHaveBeenCalledTimes(1);
  });

  it('throws on an HTTP error and on an unexpected shape', async () => {
    const o = httpObserver({ baseUrl: base, serverSecret: 's', fetch: fake({ '/api/oracle/intents': { nope: 1 } }) as never });
    await expect(o.intents('t')).rejects.toThrow(/unexpected shape/);
    await expect(o.ledgers('t')).rejects.toThrow(/HTTP 404/);
  });
});

describe('isHauntedShop', () => {
  it('recognises the shop by its products read, and nothing else', async () => {
    const shop = fake({ '/api/oracle/products': { products: [], coupons: [] } });
    expect(await isHauntedShop(base, 's', shop as never)).toBe(true);
    expect(await isHauntedShop(base, 's', fake({}) as never)).toBe(false);
    expect(await isHauntedShop(base, 's', (async () => { throw new Error('down'); }) as never)).toBe(false);
  });
});

describe('emptyObserver', () => {
  it('reads nothing', async () => {
    expect((await emptyObserver.ledgers('t')).customer.entries).toEqual([]);
    expect(await emptyObserver.intents('t')).toEqual([]);
  });
});
