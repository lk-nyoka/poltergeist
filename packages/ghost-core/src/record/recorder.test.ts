import { describe, it, expect } from 'vitest';
import { Step } from '@poltergeist/protocol';
import { FakeDriver } from '../fake/FakeDriver';
import { fakeObserver } from '../fake/FakeObserver';
import { RecordingDriver, resolvePlaceholders, substitutePlaceholders } from './recorder';

function setup(opts: { observer?: boolean } = {}) {
  const inner = new FakeDriver({ seed: 3 });
  let t = 1000;
  const clock = { advance: (ms: number) => void (t += ms) };
  const rec = new RecordingDriver(inner, {
    seed: 42,
    now: () => t,
    ...(opts.observer ? { observer: fakeObserver(inner.shop) } : {}),
  });
  return { inner, rec, clock };
}

describe('RecordingDriver', () => {
  it('records every action as a valid Step with the gap since the previous step', async () => {
    const { rec, clock } = setup();
    await rec.goto('/product/p1');
    clock.advance(40);
    await rec.type({ role: 'spinbutton', name: 'Quantity' }, '2');
    clock.advance(120);
    await rec.click({ role: 'button', name: 'Add to cart' });
    await rec.press('Tab');
    await rec.back();
    await rec.reload();
    await rec.request('POST', '/api/cart', { productId: 'p1', qty: 1 }, { 'x-test': '1' });
    const steps = rec.steps();
    expect(steps.map((s) => s.kind)).toEqual(['goto', 'type', 'click', 'press', 'back', 'reload', 'request']);
    expect(steps.map((s) => s.gapMs)).toEqual([0, 40, 120, 0, 0, 0, 0]);
    for (const s of steps) expect(Step.safeParse(s).success).toBe(true);
    expect(steps[6]).toMatchObject({ method: 'POST', path: '/api/cart', body: { productId: 'p1', qty: 1 }, headers: { 'x-test': '1' } });
    expect(rec.seed).toBe(42);
  });

  it('does not record reads, and forwards them to the inner driver', async () => {
    const { rec, inner } = setup();
    await rec.query('*');
    await rec.focused();
    await rec.axe();
    await rec.currentPath();
    rec.pointer(1, 2);
    expect(rec.sessionToken()).toBe(inner.sessionToken());
    expect(inner.lastPointer).toEqual({ x: 1, y: 2 });
    expect(rec.steps()).toEqual([]);
  });

  it('marks multi-click steps as timing-sensitive and keeps count and delay', async () => {
    const { rec } = setup();
    await rec.goto('/');
    await rec.click({ role: 'link', name: 'Kettle' }, { count: 2, delayMs: 30 });
    expect(rec.steps()[1]).toMatchObject({ kind: 'click', count: 2, delayMs: 30, timingSensitive: true });
  });

  it('records freshSession with no options, whatever was passed', async () => {
    const { rec, inner } = setup();
    const before = inner.sessionToken();
    await rec.freshSession({ cloneOf: before });
    const [s] = rec.steps();
    expect(s).toEqual({ kind: 'freshSession', gapMs: 0, timingSensitive: false });
    expect(JSON.stringify(s)).not.toContain(before);
    expect(inner.sessionToken()).not.toBe(before);
  });

  it('refuses a step that could never replay, before acting', async () => {
    const { rec, inner } = setup();
    await expect(rec.click({ role: 'link', name: 'Kettle' }, { count: 4 })).rejects.toThrow();
    expect(await inner.currentPath()).toBe('/');
    expect(rec.steps()).toEqual([]);
  });

  it('does not record a call that threw', async () => {
    const { rec } = setup();
    await expect(rec.click({ role: 'button', name: 'No such button' })).rejects.toThrow();
    expect(rec.steps()).toEqual([]);
  });

  it('records intent and order ids as placeholders and replays them in a new session', async () => {
    const { rec, inner } = setup({ observer: true });
    await rec.request('POST', '/api/cart', { productId: 'p1', qty: 1 });
    const open = await rec.request('POST', '/api/checkout/open');
    const intentId = (open.json as { intentId: string }).intentId;
    const pay = await rec.request('POST', '/api/checkout', { intentId, name: 'Ada', address: 'B' });
    const orderId = (pay.json as { order: { id: string } }).order.id;
    await rec.goto(`/orders/${orderId}`);

    const steps = rec.steps();
    const json = JSON.stringify(steps);
    expect(json).not.toContain(intentId);
    expect(json).not.toContain(orderId);
    expect(steps[2]).toMatchObject({ kind: 'request', body: { intentId: '{{intentId}}', name: 'Ada' } });
    expect(steps[3]).toMatchObject({ kind: 'goto', path: '/orders/{{orderId}}' });

    // Replay on a fresh session: placeholders resolve to that session's own ids.
    const replay = new FakeDriver({ seed: 99 });
    const observer = fakeObserver(replay.shop);
    for (const s of steps) {
      const token = replay.sessionToken();
      const [intents, orders] = await Promise.all([observer.intents(token), observer.orders(token, { reads: false })]);
      const known = { intentId: intents.at(-1)?.id, orderId: orders.orders.at(-1)?.id };
      const r = resolvePlaceholders(s, known);
      if (r.kind === 'request') await replay.request(r.method, r.path, r.body);
      if (r.kind === 'goto') await replay.goto(r.path);
    }
    expect(replay.shop.ledgers(replay.sessionToken()).customer.entries).toHaveLength(1);
    expect((await replay.query('[data-testid=order-name]'))[0]?.text).toBe('Ada');
    expect(inner.shop.orders(inner.sessionToken()).orders).toHaveLength(1);
  });

  it('setKnown works without an observer', async () => {
    const { rec } = setup();
    rec.setKnown({ intentId: 'cart_x:7' });
    await rec.request('POST', '/api/checkout', { intentId: 'cart_x:7' });
    expect(rec.steps()[0]).toMatchObject({ body: { intentId: '{{intentId}}' } });
  });

  describe('stepsSinceFreshSession', () => {
    it('returns the merged prefix from the last freshSession up to the cut', async () => {
      const { rec } = setup();
      await rec.goto('/a');
      await rec.freshSession({ clean: true });
      await rec.goto('/cart');
      await rec.reload();
      await rec.freshSession({ clean: true });
      await rec.goto('/');
      await rec.back();
      expect(rec.stepsSinceFreshSession().map((s) => s.kind)).toEqual(['freshSession', 'goto', 'back']);
      // A finding raised after the 4th step belongs to the first fresh session.
      expect(rec.stepsSinceFreshSession(4).map((s) => s.kind)).toEqual(['freshSession', 'goto', 'reload']);
    });

    it('starts with an explicit freshSession when none was recorded', async () => {
      const { rec } = setup();
      await rec.goto('/cart');
      const s = rec.stepsSinceFreshSession();
      expect(s.map((x) => x.kind)).toEqual(['freshSession', 'goto']);
      expect(s[0]).toEqual({ kind: 'freshSession', gapMs: 0, timingSensitive: false });
    });

    it('returns copies, so callers cannot change the recording', async () => {
      const { rec } = setup();
      await rec.goto('/cart');
      const s = rec.stepsSinceFreshSession();
      (s[1] as { path: string }).path = '/hacked';
      expect(rec.steps()[0]).toMatchObject({ path: '/cart' });
    });
  });
});

describe('placeholders', () => {
  it('is a single pass: an id never matches inside a placeholder just inserted', () => {
    const out = substitutePlaceholders({ a: 'x intent y', b: 'oops' }, { intentId: 'oops', orderId: 'intent' });
    expect(out).toEqual({ a: 'x {{orderId}} y', b: '{{intentId}}' });
    expect(resolvePlaceholders(out, { intentId: 'oops', orderId: 'intent' })).toEqual({ a: 'x intent y', b: 'oops' });
  });

  it('leaves values alone when nothing is known and leaves unknown placeholders unresolved', () => {
    expect(substitutePlaceholders({ a: 'abc' }, {})).toEqual({ a: 'abc' });
    expect(resolvePlaceholders('{{orderId}}', { intentId: 'i' })).toBe('{{orderId}}');
  });
});
