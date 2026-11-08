// @vitest-environment node
import { describe, it, expect } from 'vitest';
import { sealToken, unsealToken, COOKIE, HEADER } from './session';

const base: Parameters<typeof sealToken>[0] = {
  sid: 'test-sid',
  mutants: ['abc', 'def'],
  iat: Date.now(),
  hid: null,
};

describe('session token', () => {
  it('round-trips through seal/unseal', async () => {
    const sealed = await sealToken(base);
    const out = await unsealToken(sealed);
    expect(out).not.toBeNull();
    expect(out!.sid).toBe(base.sid);
    expect(out!.mutants).toEqual(base.mutants);
    expect(out!.hid).toBeNull();
  });

  it('returns null for a corrupted token', async () => {
    expect(await unsealToken('not-a-valid-seal')).toBeNull();
    expect(await unsealToken('')).toBeNull();
  });

  it('exports the correct cookie and header names', () => {
    expect(COOKIE).toBe('__Host-pg_sid');
    expect(HEADER).toBe('x-pg-session');
  });
});
