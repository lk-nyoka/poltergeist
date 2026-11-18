import { describe, it, expect } from 'vitest';
import type { PossessOptions, Step } from '@poltergeist/protocol';
import type { Driver } from '../driver';
import { FakeDriver, type FakeDriverOptions } from '../fake/FakeDriver';
import { fakeObserver } from '../fake/FakeObserver';
import { RecordingDriver } from '../record/recorder';
import { traceDialogFocus } from '../oracles/focus-trace';
import { cleanReplay, killCheck, replay, verify } from './replay';

const btn = (name: string) => ({ role: 'button', name });
const noSleep = async () => {};
const virtual = () => {
  let t = 0;
  return { now: () => t, sleep: async (ms: number) => void (t += ms) };
};
const fast = { sleep: noSleep, observe: virtual() };

function haunted(opts: FakeDriverOptions) {
  const driver = new FakeDriver({ seed: 5, ...opts });
  const deps = { driver, observer: fakeObserver(driver.shop) };
  const base = driver.sessionToken();
  const rec = new RecordingDriver(driver, { seed: 5, observer: deps.observer });
  return { driver, deps, base, rec };
}

async function doubleClickPay(d: RecordingDriver) {
  await d.goto('/product/p1');
  await d.click(btn('Add to cart'));
  await d.goto('/cart');
  await d.click(btn('Checkout'));
  await d.click(btn('Pay'), { count: 2, delayMs: 1 });
}

describe('verify, cleanReplay and killCheck', () => {
  it('verifies a real finding 3 of 3 and finds the clean replay silent', async () => {
    const { deps, base, rec } = haunted({ faults: ['skipClaim'] });
    await doubleClickPay(rec);
    const finding = { oracle: 'DoubleCharge' as const, steps: rec.stepsSinceFreshSession() };

    const v = await verify(finding, deps, { base, ...fast });
    expect(v).toEqual({ verified: true, reproductionRate: 1, fired: 3, replays: 3 });
    expect((await cleanReplay(finding, deps, fast)).silent).toBe(true);
    expect(await killCheck(finding, deps, { base, ...fast })).toMatchObject({ verified: true, cleanSilent: true, passed: true });
  });

  it('runs every replay in its own fresh session, leaving the haunting session alone', async () => {
    const { driver, deps, base, rec } = haunted({ faults: ['skipClaim'] });
    await doubleClickPay(rec);
    const before = driver.shop.ledgers(base).customer.entries.length;
    const r = await replay(rec.stepsSinceFreshSession(), deps, { cloneOf: base }, fast);
    expect(r.token).not.toBe(base);
    expect(driver.shop.ledgers(base).customer.entries).toHaveLength(before);
    expect(driver.shop.ledgers(r.token).customer.entries).toHaveLength(2);
  });

  it('does not verify a finding that does not reproduce', async () => {
    const { deps, base, rec } = haunted({});
    await doubleClickPay(rec); // clean shop: one debit only
    const v = await verify({ oracle: 'DoubleCharge', steps: rec.stepsSinceFreshSession() }, deps, { base, ...fast });
    expect(v).toEqual({ verified: false, reproductionRate: 0, fired: 0, replays: 3 });
  });

  it('records a partial reproduction rate and still verifies on 1 of 3', async () => {
    class Flaky extends FakeDriver {
      private n = 0;
      override async freshSession(o: PossessOptions) {
        // Only the first of every three clone replays is faulty.
        return super.freshSession('cloneOf' in o && this.n++ % 3 !== 0 ? { clean: true } : o);
      }
    }
    const driver = new Flaky({ seed: 5, faults: ['skipClaim'] });
    const deps = { driver, observer: fakeObserver(driver.shop) };
    const base = driver.sessionToken();
    const rec = new RecordingDriver(driver, { seed: 5, observer: deps.observer });
    await doubleClickPay(rec);
    const steps = rec.stepsSinceFreshSession();
    const v = await verify({ oracle: 'DoubleCharge', steps }, deps, { base, ...fast });
    expect(v.verified).toBe(true);
    expect(v.fired).toBe(1);
    expect(v.reproductionRate).toBeCloseTo(1 / 3);
  });

  it('is not a kill when the oracle also fires on the clean replay', async () => {
    class Sticky extends FakeDriver {
      // A "clean" session that keeps the fault: the bug is not caused by the mutant.
      override async freshSession(o: PossessOptions) {
        return super.freshSession('clean' in o ? { cloneOf: this.initial } : o);
      }
      readonly initial = this.sessionToken();
    }
    const driver = new Sticky({ seed: 5, faults: ['skipClaim'] });
    const deps = { driver, observer: fakeObserver(driver.shop) };
    const base = driver.sessionToken();
    const rec = new RecordingDriver(driver, { seed: 5, observer: deps.observer });
    await doubleClickPay(rec);
    const finding = { oracle: 'DoubleCharge' as const, steps: rec.stepsSinceFreshSession() };
    const k = await killCheck(finding, deps, { base, ...fast });
    expect(k.verified).toBe(true);
    expect(k.cleanSilent).toBe(false);
    expect(k.passed).toBe(false);
  });

  it('resolves {{intentId}} from the replay session, not the recorded one', async () => {
    const { deps, base, rec } = haunted({ faults: ['skipClaim'] });
    await rec.request('POST', '/api/cart', { productId: 'p1', qty: 1 });
    const open = await rec.request('POST', '/api/checkout/open');
    const intentId = (open.json as { intentId: string }).intentId;
    await rec.request('POST', '/api/checkout', { intentId, name: 'A', address: 'B' });
    await rec.request('POST', '/api/checkout', { intentId, name: 'A', address: 'B' });
    const steps = rec.stepsSinceFreshSession();
    expect(JSON.stringify(steps)).toContain('{{intentId}}');
    expect(JSON.stringify(steps)).not.toContain(intentId);

    const r = await replay(steps, deps, { cloneOf: base }, { ...fast, oracle: 'DoubleCharge' });
    expect(r.stepErrors).toEqual([]);
    expect(r.fired).toBe(true);
    expect(r.hits[0]!.evidence['intentId']).toBe(r.observation.intents[0]!.id);
  });

  it('honours gapMs, capped by gapCapMs', async () => {
    const { deps, base } = haunted({});
    const steps: Step[] = [
      { kind: 'freshSession', gapMs: 0, timingSensitive: false },
      { kind: 'goto', path: '/cart', gapMs: 500, timingSensitive: false },
      { kind: 'goto', path: '/', gapMs: 30, timingSensitive: false },
    ];
    const slept: number[] = [];
    const sleep = async (ms: number) => void slept.push(ms);
    await replay(steps, deps, { cloneOf: base }, { sleep, observe: virtual() });
    expect(slept).toEqual([500, 30]);
    slept.length = 0;
    await replay(steps, deps, { cloneOf: base }, { sleep, gapCapMs: 100, observe: virtual() });
    expect(slept).toEqual([100, 30]);
  });

  it('reports steps that cannot run instead of throwing', async () => {
    const { deps, base } = haunted({});
    const steps: Step[] = [
      { kind: 'click', target: { role: 'button', name: 'Nope' }, gapMs: 0, timingSensitive: false },
      { kind: 'mcp', tool: 'browser_click', args: {}, gapMs: 0, timingSensitive: false },
      { kind: 'goto', path: '/cart', gapMs: 0, timingSensitive: false },
    ];
    const r = await replay(steps, deps, { cloneOf: base }, fast);
    expect(r.stepErrors.map((e) => e.index)).toEqual([0, 1]);
    expect(await deps.driver.currentPath()).toBe('/cart');
  });

  it('verifies an accessibility finding from axe scans taken during the replay', async () => {
    const { deps, base } = haunted({ faults: ['dropAlt'] });
    const steps: Step[] = [{ kind: 'goto', path: '/', gapMs: 0, timingSensitive: false }];
    expect((await verify({ oracle: 'A11yViolation', steps }, deps, { base, ...fast })).verified).toBe(true);
    expect((await cleanReplay({ oracle: 'A11yViolation', steps }, deps, fast)).silent).toBe(true);
  });

  it('uses the collect hook for evidence only the ghost can gather (focus traces)', async () => {
    const { deps, base } = haunted({ faults: ['noFocusTrap'] });
    const steps: Step[] = [
      { kind: 'request', method: 'POST', path: '/api/cart', body: { productId: 'p1', qty: 1 }, gapMs: 0, timingSensitive: false },
      { kind: 'goto', path: '/cart', gapMs: 0, timingSensitive: false },
    ];
    const collect = async (d: Driver) => {
      const t = await traceDialogFocus(d, { opener: 'Checkout', open: () => d.click(btn('Checkout')) });
      return { focus: t ? [t] : [] };
    };
    const finding = { oracle: 'FocusFailure' as const, steps };
    expect((await verify(finding, deps, { base, collect, ...fast })).verified).toBe(true);
    expect((await cleanReplay(finding, deps, { collect, ...fast })).silent).toBe(true);
  });

  it('rejects a non-positive replay count', async () => {
    const { deps, base } = haunted({});
    await expect(verify({ oracle: 'Crash', steps: [] }, deps, { base, replays: 0 })).rejects.toThrow();
  });

  it('removes its event listener when done', async () => {
    const { driver, deps, base } = haunted({});
    const inner = driver.onEvent.bind(driver);
    let live = 0;
    driver.onEvent = (cb) => {
      live += 1;
      const off = inner(cb);
      return () => {
        live -= 1;
        off();
      };
    };
    await replay([], deps, { cloneOf: base }, fast);
    expect(live).toBe(0);
  });
});
