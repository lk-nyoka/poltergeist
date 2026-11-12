// @vitest-environment node
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import {
  OracleIntentsResponse,
  OracleLedgersResponse,
  OracleOrdersResponse,
  OracleProductsResponse,
  type MutantOverride,
} from '@poltergeist/protocol';
import { _resetMemoryStoreForTest, getMemoryStore } from '@/store/memory';
import { _setOverridesForTest, requestContext } from '@/seams/registry';
import { cleanContext } from '@/seams/context';
import { unsealToken } from '@/lib/session';
import { json, makeRequest as rq, newSession } from '@/test/helpers';
import * as cart from '@/domain/cart';
import * as checkout from '@/domain/checkout';
import { POST as possess } from './possess/route';
import { GET as oracleLedgers } from './oracle/ledgers/route';
import { GET as oracleOrders } from './oracle/orders/route';
import { GET as oracleIntents } from './oracle/intents/route';
import { GET as oracleProducts } from './oracle/products/route';

const SECRET = 'unit-test-server-secret';
const BENCH = 'unit-test-bench-secret';
const auth = { 'x-poltergeist-secret': SECRET };

// Synthetic overrides: ids and seams are made up for these tests only.
const ov = (id: string, isPublic: boolean): MutantOverride => ({ id, seam: 'pricing/total', impl: () => 0, public: isPublic });
const POOL = [ov('aaaaaaaa', false), ov('bbbbbbbb', false), ov('cccccccc', false), ov('dddddddd', true), ov('eeeeeeee', true)];

type Err = { error: { code: string } };
const post = (body: unknown, headers: Record<string, string> = auth) => possess(rq('POST', '/api/possess', { body, headers }));
const tokenOf = async (res: Response) => (await json<{ token: string }>(res)).token;

beforeEach(() => {
  _resetMemoryStoreForTest();
  _setOverridesForTest([]);
  vi.stubEnv('SEANCE_SERVER_SECRET', SECRET);
  vi.stubEnv('BENCH_SECRET', BENCH);
  delete process.env['BENCH_MODE'];
  vi.spyOn(console, 'error').mockImplementation(() => {});
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
  _setOverridesForTest([]);
});

describe('the server secret (REQ-10.1)', () => {
  it('every server-only route answers 404 without it, with a wrong one, and with a wrong-length one', async () => {
    const { token } = await newSession();
    const calls: [string, (h: Record<string, string>) => Promise<Response>][] = [
      ['possess', (h) => possess(rq('POST', '/api/possess', { body: { clean: true }, headers: h }))],
      ['ledgers', (h) => oracleLedgers(rq('GET', '/api/oracle/ledgers', { headers: { ...h, 'x-pg-observe': token } }))],
      ['orders', (h) => oracleOrders(rq('GET', '/api/oracle/orders', { headers: { ...h, 'x-pg-observe': token } }))],
      ['intents', (h) => oracleIntents(rq('GET', '/api/oracle/intents', { headers: { ...h, 'x-pg-observe': token } }))],
      ['products', (h) => oracleProducts(rq('GET', '/api/oracle/products', { headers: h }))],
    ];
    for (const [name, call] of calls) {
      const wrong: Record<string, string>[] = [{}, { 'x-poltergeist-secret': 'wrong' }, { 'x-poltergeist-secret': SECRET + 'x' }, { 'x-poltergeist-secret': '' }];
      for (const h of wrong) {
        const res = await call(h);
        expect(res.status, `${name} ${JSON.stringify(h)}`).toBe(404);
        expect((await json<Err>(res)).error.code).toBe('not_found');
      }
      expect((await call(auth)).status, `${name} with secret`).toBe(200);
    }
  });

  it('is closed when SEANCE_SERVER_SECRET is not configured at all', async () => {
    vi.stubEnv('SEANCE_SERVER_SECRET', '');
    const res = await possess(rq('POST', '/api/possess', { body: { clean: true }, headers: { 'x-poltergeist-secret': '' } }));
    expect(res.status).toBe(404);
  });
});

describe('POST /api/possess', () => {
  it('{clean:true} returns only { token }: a sealed session with no mutants, fresh each time', async () => {
    const res = await post({ clean: true });
    expect(res.status).toBe(200);
    const body = await json<Record<string, unknown>>(res);
    expect(Object.keys(body)).toEqual(['token']);
    const a = await unsealToken(body['token'] as string);
    const b = await unsealToken(await tokenOf(await post({ clean: true })));
    expect(a).toMatchObject({ mutants: [], hid: null });
    expect(Date.now() - a!.iat).toBeLessThan(5_000);
    expect(a!.sid).not.toBe(b!.sid);
  });

  it('{count:n} with no non-public overrides is 409 no_mutants (the S02 reality)', async () => {
    const res = await post({ count: 2 });
    expect(res.status).toBe(409);
    expect((await json<Err>(res)).error.code).toBe('no_mutants');
  });

  it('{count:n} picks n distinct NON-public ids, and 409s when the pool is too small', async () => {
    _setOverridesForTest(POOL);
    for (let i = 0; i < 30; i++) {
      const t = await unsealToken(await tokenOf(await post({ count: 3 })));
      expect(new Set(t!.mutants).size).toBe(3);
      expect(t!.mutants.every((id) => ['aaaaaaaa', 'bbbbbbbb', 'cccccccc'].includes(id))).toBe(true);
    }
    expect(await unsealToken(await tokenOf(await post({ count: 1 })))).toMatchObject({ mutants: [expect.stringMatching(/^[a-c]{8}$/)] });
    _setOverridesForTest([POOL[0]!, POOL[3]!]);
    expect((await post({ count: 2 })).status).toBe(409);
  });

  it('{demo:true} uses exactly the public overrides, and 409s when there are none', async () => {
    expect((await post({ demo: true })).status).toBe(409);
    _setOverridesForTest(POOL);
    const t = await unsealToken(await tokenOf(await post({ demo: true })));
    expect([...t!.mutants].sort()).toEqual(['dddddddd', 'eeeeeeee']);
  });

  it('{cloneOf} copies the mutant set into a brand-new session', async () => {
    _setOverridesForTest(POOL);
    const original = await tokenOf(await post({ count: 2 }));
    const o = await unsealToken(original);
    const c = await unsealToken(await tokenOf(await post({ cloneOf: original })));
    expect([...c!.mutants].sort()).toEqual([...o!.mutants].sort());
    expect(c!.sid).not.toBe(o!.sid);
  });

  it('{cloneOf} with a bad token is 400', async () => {
    for (const bad of ['', 'nonsense', 'Fe26.2**broken']) {
      expect((await post({ cloneOf: bad })).status).toBe(400);
    }
  });

  describe('{mutantIds} (benchmark only)', () => {
    const benchHeaders = { ...auth, 'x-poltergeist-bench': BENCH };

    it('is rejected (404) unless BENCH_MODE=1', async () => {
      _setOverridesForTest(POOL);
      expect((await post({ mutantIds: ['aaaaaaaa'] }, benchHeaders)).status).toBe(404);
    });

    it('is rejected (404) with BENCH_MODE=1 but a missing or wrong bench secret', async () => {
      _setOverridesForTest(POOL);
      vi.stubEnv('BENCH_MODE', '1');
      expect((await post({ mutantIds: ['aaaaaaaa'] }, auth)).status).toBe(404);
      expect((await post({ mutantIds: ['aaaaaaaa'] }, { ...auth, 'x-poltergeist-bench': 'wrong' })).status).toBe(404);
    });

    it('works with BENCH_MODE=1 and the bench secret; unknown ids are 400', async () => {
      _setOverridesForTest(POOL);
      vi.stubEnv('BENCH_MODE', '1');
      const t = await unsealToken(await tokenOf(await post({ mutantIds: ['bbbbbbbb', 'dddddddd', 'bbbbbbbb'] }, benchHeaders)));
      expect([...t!.mutants].sort()).toEqual(['bbbbbbbb', 'dddddddd']); // public ones are allowed here, duplicates collapse
      const bad = await post({ mutantIds: ['aaaaaaaa', 'zzzzzzzz'] }, benchHeaders);
      expect(bad.status).toBe(400);
    });
  });

  it('accepts exactly one option shape', async () => {
    for (const body of [{}, { clean: true, demo: true }, { count: 0 }, { count: 4 }, { count: 1.5 }, { clean: false }, { surprise: 1 }, [], null, 'x']) {
      const res = await post(body);
      expect(res.status, JSON.stringify(body)).toBe(400);
    }
    expect((await possess(rq('POST', '/api/possess', { body: '{oops', headers: auth }))).status).toBe(400);
  });
});

describe('oracle routes', () => {
  async function paidSession() {
    const s = await newSession();
    await requestContext.run({ sid: s.sid, token: s.token, mutants: new Set() }, async () => {
      await cart.addLine(s.sid, 'mug', 2);
      const { intentId } = await checkout.open(s.sid);
      await checkout.pay(s.sid, intentId, 'Ada', '1 Elm St');
    });
    return s;
  }
  const observe = (path: string, token: string, extra: Record<string, string> = {}) =>
    rq('GET', path, { headers: { ...auth, 'x-pg-observe': token, ...extra } });

  it('ledgers: start balances, one debit and one credit per intent, protocol-shaped', async () => {
    const s = await paidSession();
    const res = await oracleLedgers(observe('/api/oracle/ledgers', s.token));
    const body = OracleLedgersResponse.parse(await res.json());
    expect(body.customer.start).toBe(50_000);
    expect(body.till.start).toBe(100_000);
    expect(body.customer.entries).toHaveLength(1);
    expect(body.customer.entries[0]).toMatchObject({ sid: s.sid, ledger: 'customer', amount_cents: -2400, memo: 'Bank: $24.00 debited' });
    expect(body.till.entries[0]).toMatchObject({ ledger: 'till', amount_cents: 2400, intent_id: body.customer.entries[0]!.intent_id });
  });

  it('orders and intents: protocol-shaped, scoped to the observed session', async () => {
    const s = await paidSession();
    const other = await paidSession();
    const orders = OracleOrdersResponse.parse(await (await oracleOrders(observe('/api/oracle/orders', s.token))).json());
    expect(orders.orders).toHaveLength(1);
    expect(orders.orders[0]).toMatchObject({ sid: s.sid, total_cents: 2400, items: [{ productId: 'mug', qty: 2 }] });
    expect(orders.reads).toBeUndefined();
    const intents = OracleIntentsResponse.parse(await (await oracleIntents(observe('/api/oracle/intents', s.token))).json());
    expect(intents.intents.map((i) => i.sid)).toEqual([s.sid]);
    expect(intents.intents[0]!.id).toBe(orders.orders[0]!.intent_id);
    expect(other.sid).not.toBe(s.sid);
  });

  it('orders?reads=1 includes order_reads, including a read of the stranger order', async () => {
    const s = await paidSession();
    await getMemoryStore().recordOrderRead(s.sid, 'stranger-order-fixed');
    const body = OracleOrdersResponse.parse(await (await oracleOrders(observe('/api/oracle/orders?reads=1', s.token))).json());
    expect(body.reads).toEqual([expect.objectContaining({ orderId: 'stranger-order-fixed' })]);
  });

  it("reads the x-pg-observe session, never the caller's own cookie or x-pg-session", async () => {
    const a = await paidSession();
    const b = await newSession();
    const res = await oracleLedgers(
      observe('/api/oracle/ledgers', a.token, { cookie: `__Host-pg_sid=${b.token}`, 'x-pg-session': b.token }),
    );
    const body = OracleLedgersResponse.parse(await res.json());
    expect(body.customer.entries).toHaveLength(1);
    expect(body.customer.entries[0]!.sid).toBe(a.sid);
    // And with only the cookie (no x-pg-observe) there is nothing to observe.
    const noObserve = await oracleLedgers(rq('GET', '/api/oracle/ledgers', { headers: { ...auth, cookie: `__Host-pg_sid=${a.token}`, 'x-pg-session': a.token } }));
    expect(noObserve.status).toBe(400);
  });

  it('a missing or invalid x-pg-observe token is 400', async () => {
    for (const route of [oracleLedgers, oracleOrders, oracleIntents]) {
      expect((await route(rq('GET', '/api/oracle/x', { headers: auth }))).status).toBe(400);
      expect((await route(observe('/api/oracle/x', 'not-a-token'))).status).toBe(400);
    }
  });

  it('products: protocol-shaped canonical prices and coupon values', async () => {
    const res = await oracleProducts(rq('GET', '/api/oracle/products', { headers: auth }));
    const body = OracleProductsResponse.parse(await res.json());
    expect(body.products).toHaveLength(8);
    expect(body.products.find((p) => p.id === 'mug')?.price).toBe(1200);
    expect(body.coupons).toEqual(
      expect.arrayContaining([
        { code: 'SPOOKY5', kind: 'fixed', cents: 500 },
        { code: 'HAUNT15', kind: 'percent', percent: 15 },
      ]),
    );
  });

  it('cleanContext hides every active mutant from the code it runs', async () => {
    const seen = await requestContext.run({ sid: 's', token: 't', mutants: new Set(['aaaaaaaa']) }, () =>
      cleanContext(async () => requestContext.getStore()!.mutants.size),
    );
    expect(seen).toBe(0);
  });
});
