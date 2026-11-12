// @vitest-environment node
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { MutantOverride } from '@poltergeist/protocol';
import { PayButtonSeam } from '@/components/render-seams';
import { unsealToken } from '@/lib/session';
import { _setOverridesForTest, requestContext } from '@/seams/registry';
import { activeMutantIds, contractSession, ok, resetContractWorld } from './helpers';

/**
 * Tests of the contract-suite plumbing itself. Deliberately UNTAGGED: they never depend on which mutant is
 * active (they set PG_MUTANTS themselves), so they must pass whatever mutant `mutant-check` switches on.
 */
beforeEach(resetContractWorld);
afterEach(() => {
  vi.unstubAllEnvs();
  _setOverridesForTest([]);
});

describe('contract helpers', () => {
  it('PG_MUTANTS is a comma-separated list; blanks and spaces are ignored; unset means none', () => {
    vi.stubEnv('PG_MUTANTS', ' abc , def ,, ');
    expect(activeMutantIds()).toEqual(['abc', 'def']);
    vi.stubEnv('PG_MUTANTS', '');
    expect(activeMutantIds()).toEqual([]);
    delete process.env['PG_MUTANTS'];
    expect(activeMutantIds()).toEqual([]);
  });

  it('seals the PG_MUTANTS ids into the session token', async () => {
    vi.stubEnv('PG_MUTANTS', 'aaaaaaaa,bbbbbbbb');
    const s = await contractSession();
    const unsealed = await unsealToken(s.token);
    expect(unsealed).toMatchObject({ sid: s.sid, mutants: ['aaaaaaaa', 'bbbbbbbb'] });
    expect(s.mutants).toEqual(['aaaaaaaa', 'bbbbbbbb']);
  });

  it('run() puts the session in the request context with its mutant set', async () => {
    vi.stubEnv('PG_MUTANTS', 'aaaaaaaa');
    const s = await contractSession();
    const seen = s.run(() => requestContext.getStore());
    expect(seen?.sid).toBe(s.sid);
    expect([...(seen?.mutants ?? [])]).toEqual(['aaaaaaaa']);
  });

  it('every session is a different client with its own sid', async () => {
    const sessions = await Promise.all(Array.from({ length: 5 }, () => contractSession()));
    expect(new Set(sessions.map((s) => s.sid)).size).toBe(5);
    expect(new Set(sessions.map((s) => s.token)).size).toBe(5);
  });

  it('70 sessions each making a checkout request never hit the rate limiter', async () => {
    const sessions = await Promise.all(Array.from({ length: 70 }, () => contractSession()));
    for (const s of sessions) {
      const res = await s.post('/api/checkout', {});
      expect(res.status).not.toBe(429);
    }
  });

  it('a mutant named in PG_MUTANTS reaches a data seam through the route (end to end)', async () => {
    const free: MutantOverride = { id: 'aaaaaaaa', seam: 'pricing/total', impl: () => 0, public: false };
    _setOverridesForTest([free]);

    vi.stubEnv('PG_MUTANTS', 'aaaaaaaa');
    const mutated = await contractSession();
    await mutated.addToCart('mug', 1);
    expect(ok(await mutated.cart()).cart.totalCents).toBe(0); // the override took effect

    vi.stubEnv('PG_MUTANTS', '');
    const clean = await contractSession();
    await clean.addToCart('mug', 1);
    expect(ok(await clean.cart()).cart.totalCents).toBe(1200); // same override registered, but not active
  });

  it('a mutant named in PG_MUTANTS reaches a render seam through resolve()', async () => {
    const Replacement = () => null;
    const swapped: MutantOverride = { id: 'bbbbbbbb', seam: 'render/PayButton', impl: () => Replacement, public: false };
    _setOverridesForTest([swapped]);

    vi.stubEnv('PG_MUTANTS', 'bbbbbbbb');
    expect((await contractSession()).resolve(PayButtonSeam)).toBe(Replacement);

    vi.stubEnv('PG_MUTANTS', '');
    expect((await contractSession()).resolve(PayButtonSeam)).not.toBe(Replacement);
  });

  it('resetContractWorld gives each test an empty store', async () => {
    const s = await contractSession();
    await s.payNow();
    expect(await s.storedOrders()).toHaveLength(1);
    resetContractWorld();
    expect(await s.storedOrders()).toHaveLength(0);
  });
});
