import { describe, it, expect } from 'vitest';
import { Finding, ORACLE_NAMES, ORACLE_RULES, type OracleName, type Step } from '@poltergeist/protocol';
import { FakeDriver } from '../fake/FakeDriver';
import { fakeObserver } from '../fake/FakeObserver';
import type { FaultName } from '../fake/FakeShop';
import type { PageEvent } from '../driver';
import type { ShopObserver } from '../observer';
import {
  ORACLES,
  buildFindings,
  observe,
  referenceTotal,
  runOracles,
  traceDialogFocus,
  type ObserveContext,
  type Observation,
} from './index';

const btn = (name: string) => ({ role: 'button', name });

function virtualClock() {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms), elapsed: () => t };
}

async function look(d: FakeDriver, events: PageEvent[], ctx: Partial<ObserveContext> = {}): Promise<Observation> {
  const clock = virtualClock();
  return observe(fakeObserver(d.shop), d.sessionToken(), { events, ...ctx }, clock);
}

async function payViaUi(d: FakeDriver, opts: { name?: string; clicks?: number } = {}) {
  await d.goto('/product/p1');
  await d.click(btn('Add to cart'));
  await d.goto('/cart');
  await d.click(btn('Checkout'));
  if (opts.name) await d.type({ role: 'textbox', name: 'Name' }, opts.name);
  await d.click(btn('Pay'), { count: opts.clicks ?? 1, delayMs: 20 });
}

type Api = { lines?: { productId: string; qty: number; price?: number }[]; coupons?: string[] };
async function buyViaApi(d: FakeDriver, a: Api) {
  for (const l of a.lines ?? []) await d.request('POST', '/api/cart', l);
  for (const couponCode of a.coupons ?? []) await d.request('POST', '/api/cart', { couponCode });
  const open = await d.request('POST', '/api/checkout/open');
  if (open.status !== 200) return;
  await d.request('POST', '/api/checkout', { intentId: (open.json as { intentId: string }).intentId, name: 'A', address: 'B' });
}

type Scenario = (d: FakeDriver) => Promise<Partial<ObserveContext>>;

/** Each case: a fault, the oracle it must trip, and the actions that expose it. The same actions on a clean session must trip nothing. */
const cases: { oracle: OracleName; label: string; fault: FaultName; run: Scenario }[] = [
  { oracle: 'DoubleCharge', label: 'skipClaim + double click on Pay', fault: 'skipClaim', run: async (d) => (await payViaUi(d, { clicks: 2 }), {}) },
  {
    oracle: 'StateLoss',
    label: 'loseOrderOnRefresh + reload after paying',
    fault: 'loseOrderOnRefresh',
    run: async (d) => {
      await payViaUi(d);
      await d.reload();
      return { refreshed: true };
    },
  },
  { oracle: 'TillLoss', label: 'negativeQty (qty -3)', fault: 'negativeQty', run: async (d) => (await buyViaApi(d, { lines: [{ productId: 'p1', qty: -3 }] }), {}) },
  { oracle: 'TillLoss', label: 'trustClientPrice', fault: 'trustClientPrice', run: async (d) => (await buyViaApi(d, { lines: [{ productId: 'p1', qty: 1, price: 1 }] }), {}) },
  { oracle: 'TillLoss', label: 'stackCoupons', fault: 'stackCoupons', run: async (d) => (await buyViaApi(d, { lines: [{ productId: 'p1', qty: 1 }], coupons: ['SAVE5', 'SAVE3'] }), {}) },
  { oracle: 'TillLoss', label: 'noRounding', fault: 'noRounding', run: async (d) => (await buyViaApi(d, { lines: [{ productId: 'p8', qty: 1 }], coupons: ['TENOFF'] }), {}) },
  { oracle: 'QuantityBreach', label: 'negativeQty (qty 11)', fault: 'negativeQty', run: async (d) => (await buyViaApi(d, { lines: [{ productId: 'p1', qty: 11 }] }), {}) },
  { oracle: 'QuantityBreach', label: 'negativeQty (qty 0.5)', fault: 'negativeQty', run: async (d) => (await buyViaApi(d, { lines: [{ productId: 'p1', qty: 0.5 }] }), {}) },
  { oracle: 'PrivacyLeak', label: 'leakOrders', fault: 'leakOrders', run: async (d) => (await d.request('GET', '/api/orders/stranger-order-fixed'), {}) },
  {
    oracle: 'ScriptExecution',
    label: 'renderHtml + onerror payload',
    fault: 'renderHtml',
    run: async (d) => {
      await d.goto('/product/p1');
      await d.type({ role: 'textbox', name: 'Review' }, '<img src=x onerror="window.__poltergeistBeacon(\'tok-1\')">');
      await d.click(btn('Post review'));
      return {};
    },
  },
  {
    oracle: 'TextCorruption',
    label: 'truncateText on a 60-character name',
    fault: 'truncateText',
    run: async (d) => {
      const submitted = 'n'.repeat(60);
      await payViaUi(d, { name: submitted });
      const rendered = (await d.query('[data-testid=order-name]'))[0]?.text ?? null;
      return { texts: [{ field: 'name', submitted, rendered }] };
    },
  },
  {
    oracle: 'A11yViolation',
    label: 'dropAlt',
    fault: 'dropAlt',
    run: async (d) => {
      await d.goto('/');
      return { axe: await d.axe() };
    },
  },
  {
    oracle: 'FocusFailure',
    label: 'noFocusTrap',
    fault: 'noFocusTrap',
    run: async (d) => {
      await d.request('POST', '/api/cart', { productId: 'p1', qty: 1 });
      await d.goto('/cart');
      const t = await traceDialogFocus(d, { opener: 'Checkout', open: () => d.click(btn('Checkout')) });
      return { focus: t ? [t] : [] };
    },
  },
  {
    oracle: 'FocusFailure',
    label: 'noFocusReturn',
    fault: 'noFocusReturn',
    run: async (d) => {
      await d.request('POST', '/api/cart', { productId: 'p1', qty: 1 });
      await d.goto('/cart');
      const t = await traceDialogFocus(d, { opener: 'Checkout', open: () => d.click(btn('Checkout')) });
      return { focus: t ? [t] : [] };
    },
  },
  {
    oracle: 'Crash',
    label: 'throwOnLongName (41 characters)',
    fault: 'throwOnLongName',
    run: async (d) => (await payViaUi(d, { name: 'n'.repeat(41) }), {}),
  },
];

describe('each oracle fires on its matching fault and stays silent on a clean session', () => {
  for (const c of cases) {
    it(`${c.oracle}: ${c.label}`, async () => {
      const faulty = new FakeDriver({ seed: 9, faults: [c.fault] });
      const faultyEvents: PageEvent[] = [];
      faulty.onEvent((e) => faultyEvents.push(e));
      const ctx = await c.run(faulty);
      const hits = ORACLES[c.oracle](await look(faulty, faultyEvents, ctx));
      expect(hits.length).toBeGreaterThan(0);
      for (const h of hits) {
        expect(h.oracle).toBe(c.oracle);
        expect(ORACLE_RULES[h.rule]).toContain(h.oracle); // the guessed rule is one this oracle may kill
        expect(h.title).not.toBe('');
        expect(h.harm).not.toBe('');
      }

      const clean = new FakeDriver({ seed: 9 });
      const cleanEvents: PageEvent[] = [];
      clean.onEvent((e) => cleanEvents.push(e));
      const cleanCtx = await c.run(clean);
      expect(runOracles(await look(clean, cleanEvents, cleanCtx))).toEqual([]);
    });
  }

  it('covers all ten oracles', () => {
    expect(new Set(cases.map((c) => c.oracle))).toEqual(new Set(ORACLE_NAMES));
  });
});

const base = (patch: Partial<Observation> = {}): Observation => ({
  ledgers: { customer: [], till: [], customerStart: 50_000, tillStart: 100_000 },
  orders: [],
  reads: [],
  intents: [],
  clean: { prices: { p1: 1000 }, coupons: { SAVE5: { code: 'SAVE5', kind: 'fixed', cents: 500 } } },
  events: [],
  axe: [],
  focus: [],
  texts: [],
  refreshChecks: [],
  ...patch,
});
const order = (o: Partial<Observation['orders'][number]> = {}): Observation['orders'][number] => ({
  id: 'o1',
  intent_id: 'i1',
  items: [{ productId: 'p1', qty: 2 }],
  coupon_codes: [],
  total_cents: 2000,
  ...o,
});
const debit = (id: number, intent: string | null) => ({ id, amount_cents: -1000, intent_id: intent });

describe('oracle edge cases', () => {
  it('DoubleCharge ignores debits on different intents and entries with no intent', () => {
    const obs = base({ ledgers: { ...base().ledgers, customer: [debit(1, 'a'), debit(2, 'b'), debit(3, null), debit(4, null)] } });
    expect(ORACLES.DoubleCharge(obs)).toEqual([]);
  });

  it('StateLoss needs a debit and a missing order', () => {
    const refreshChecks = [{ intentId: 'a', orderVisible: false }];
    expect(ORACLES.StateLoss(base({ refreshChecks }))).toEqual([]);
    const withDebit = base({ refreshChecks, ledgers: { ...base().ledgers, customer: [debit(1, 'a')] } });
    expect(ORACLES.StateLoss(withDebit)).toHaveLength(1);
    expect(ORACLES.StateLoss({ ...withDebit, refreshChecks: [{ intentId: 'a', orderVisible: true }] })).toEqual([]);
  });

  it('TillLoss uses its own reference total: half-up, one rounding, discount capped at the subtotal', () => {
    expect(referenceTotal(order({ coupon_codes: ['SAVE5'] }), base().clean)).toBe(1500);
    const clean = { prices: { p1: 999 }, coupons: { TEN: { code: 'TEN', kind: 'percent' as const, percent: 10 } } };
    expect(referenceTotal(order({ items: [{ productId: 'p1', qty: 1 }], coupon_codes: ['TEN'] }), clean)).toBe(899); // 899.1
    const big = { prices: { p1: 100 }, coupons: { BIG: { code: 'BIG', kind: 'fixed' as const, cents: 500 } } };
    expect(referenceTotal(order({ items: [{ productId: 'p1', qty: 1 }], coupon_codes: ['BIG'] }), big)).toBe(0);
    expect(referenceTotal(order({ items: [{ productId: 'nope', qty: 1 }] }), base().clean)).toBeNull();
    expect(ORACLES.TillLoss(base({ orders: [order()] }))).toEqual([]);
    expect(ORACLES.TillLoss(base({ orders: [order({ total_cents: 1999 })] }))).toHaveLength(1);
    expect(ORACLES.TillLoss(base({ orders: [order({ items: [{ productId: 'nope', qty: 1 }], total_cents: 5 })] }))).toEqual([]);
  });

  it('TillLoss fires when the till balance is below its start', () => {
    const obs = base({ ledgers: { ...base().ledgers, till: [{ id: 1, amount_cents: -300, intent_id: null }] } });
    expect(ORACLES.TillLoss(obs).map((h) => h.evidence['reason'])).toEqual(['till-below-start']);
  });

  it('QuantityBreach accepts 1 and 10 and rejects 0, 11, 0.5 and -1', () => {
    const q = (qty: number) => ORACLES.QuantityBreach(base({ orders: [order({ items: [{ productId: 'p1', qty }] })] }));
    expect(q(1)).toEqual([]);
    expect(q(10)).toEqual([]);
    for (const bad of [0, 11, 0.5, -1]) expect(q(bad)).toHaveLength(1);
  });

  it('PrivacyLeak ignores reads of own orders', () => {
    expect(ORACLES.PrivacyLeak(base({ reads: [{ orderId: 'o1' }] }))).toEqual([]);
    expect(ORACLES.PrivacyLeak(base({ reads: [{ orderId: 'stranger-order-fixed' }, { orderId: 'stranger-order-fixed' }] }))).toHaveLength(1);
  });

  it('TextCorruption ignores out-of-contract and unreadable text', () => {
    const t = (submitted: string, rendered: string | null) => ORACLES.TextCorruption(base({ texts: [{ field: 'name', submitted, rendered }] }));
    expect(t('x'.repeat(101), 'x')).toEqual([]);
    expect(t('a\u0007b', 'ab')).toEqual([]);
    expect(t('ok', null)).toEqual([]);
    expect(t(' ok ', 'ok')).toHaveLength(1); // trimming is corruption
    expect(t('ok', 'ok')).toEqual([]);
  });

  it('A11yViolation reacts only to the nine named rules', () => {
    const v = (id: string) => ORACLES.A11yViolation(base({ axe: [{ id, impact: 'serious', help: '', targets: ['x'] }] }));
    expect(v('color-contrast')).toEqual([]);
    for (const id of ['button-name', 'image-alt', 'svg-img-alt', 'input-image-alt', 'label', 'select-name', 'link-name', 'aria-command-name', 'aria-input-field-name']) {
      expect(v(id)).toHaveLength(1);
    }
  });

  it('FocusFailure detects a dialog with no reachable close control', () => {
    const trace = { opener: 'Open', sequence: [{ label: 'Name', inDialog: true, isClose: false }], escapeCloses: false, closed: false, returnedTo: null };
    expect(ORACLES.FocusFailure(base({ focus: [trace] })).map((h) => h.evidence['shape'])).toEqual(['no-close']);
    expect(ORACLES.FocusFailure(base({ focus: [{ ...trace, escapeCloses: true, closed: true, returnedTo: 'Open' }] }))).toEqual([]);
  });

  it('Crash reports page errors, error boundaries and 5xx once each', () => {
    const e = (kind: PageEvent['kind'], detail: string): PageEvent => ({ kind, detail, at: 1 });
    const events = [e('pageerror', 'x'), e('pageerror', 'x'), e('errorBoundary', 'y'), e('http5xx', '500 GET /a'), e('beacon', 't')];
    expect(ORACLES.Crash(base({ events }))).toHaveLength(3);
  });

  it('an HTTP 429 makes request-driven oracles inconclusive but not page-level ones', () => {
    const e = (kind: PageEvent['kind'], detail: string): PageEvent => ({ kind, detail, at: 1 });
    const obs = base({
      ledgers: { ...base().ledgers, customer: [debit(1, 'a'), debit(2, 'a')] },
      events: [e('http429', 'POST /api/checkout'), e('beacon', 't'), e('http5xx', '500 GET /x')],
    });
    expect(ORACLES.DoubleCharge(obs)).toHaveLength(1);
    expect(runOracles(obs).map((h) => h.oracle)).toEqual(['ScriptExecution']);
  });
});

describe('observe: retry up to 2 s before StateLoss can fire', () => {
  async function paid() {
    const d = new FakeDriver({ seed: 4 });
    await payViaUi(d);
    return d;
  }

  it('waits for a late order and does not fire', async () => {
    const d = await paid();
    const inner = fakeObserver(d.shop);
    let calls = 0;
    const slow: ShopObserver = {
      ...inner,
      orders: async (t, o) => (++calls <= 3 ? { orders: [], reads: [] } : inner.orders(t, o)),
    };
    const clock = virtualClock();
    const obs = await observe(slow, d.sessionToken(), { events: [], refreshed: true }, clock);
    expect(calls).toBe(4);
    expect(clock.elapsed()).toBe(300);
    expect(ORACLES.StateLoss(obs)).toEqual([]);
  });

  it('gives up after 2 s and then StateLoss fires', async () => {
    const d = new FakeDriver({ seed: 4, faults: ['loseOrderOnRefresh'] });
    await payViaUi(d);
    await d.reload();
    const clock = virtualClock();
    const obs = await observe(fakeObserver(d.shop), d.sessionToken(), { events: [], refreshed: true }, clock);
    expect(clock.elapsed()).toBe(2000);
    expect(ORACLES.StateLoss(obs)).toHaveLength(1);
  });

  it('does not wait when nothing is missing', async () => {
    const d = await paid();
    const clock = virtualClock();
    await observe(fakeObserver(d.shop), d.sessionToken(), { events: [], refreshed: true }, clock);
    expect(clock.elapsed()).toBe(0);
  });
});

describe('buildFindings', () => {
  const steps: Step[] = [
    { kind: 'freshSession', gapMs: 0, timingSensitive: false },
    { kind: 'goto', path: '/cart', gapMs: 5, timingSensitive: false },
  ];

  it('produces schema-valid findings with title, rule, oracle, harm, evidence, steps and seed', async () => {
    const d = new FakeDriver({ seed: 9, faults: ['skipClaim'] });
    const events: PageEvent[] = [];
    d.onEvent((e) => events.push(e));
    await payViaUi(d, { clicks: 2 });
    const findings = buildFindings(await look(d, events), { steps, seed: 77 });
    expect(findings).toHaveLength(1);
    const f = findings[0]!;
    expect(Finding.safeParse(f).success).toBe(true);
    expect(f).toMatchObject({ oracle: 'DoubleCharge', rule: 'C1', seed: 77, steps });
    expect(f.evidence.details['debits']).toBe(2);
    expect(f.evidence.screenshot).toBeNull();
    expect(f.harm).toMatch(/2 debits/);
  });

  it('carries 5xx records in the evidence', async () => {
    const d = new FakeDriver({ seed: 9, faults: ['throwOnLongName'] });
    const events: PageEvent[] = [];
    d.onEvent((e) => events.push(e));
    await payViaUi(d, { name: 'n'.repeat(41) });
    const [f] = buildFindings(await look(d, events), { steps, seed: 1 });
    expect(f!.oracle).toBe('Crash');
    expect(f!.evidence.http5xx[0]).toMatch(/^500 POST \/api\/checkout/);
    expect(f!.evidence.network[0]).toEqual({ status: 500, method: 'POST', path: '/api/checkout' });
  });

  it('finds nothing on a clean session', async () => {
    const d = new FakeDriver({ seed: 9 });
    const events: PageEvent[] = [];
    d.onEvent((e) => events.push(e));
    await payViaUi(d, { clicks: 3, name: 'Ada' });
    expect(buildFindings(await look(d, events), { steps, seed: 1 })).toEqual([]);
  });
});
