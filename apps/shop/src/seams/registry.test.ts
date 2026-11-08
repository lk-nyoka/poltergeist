// @vitest-environment node
import { describe, it, expect, beforeEach } from 'vitest';
import { seam, _setOverridesForTest, listSeamKeys, requestContext, getOverrides } from './registry';
import type { MutantOverride } from '@poltergeist/protocol';

// Each test module gets its own seam registry via the module-level Map.
// We use unique keys per test to avoid duplicate-key errors across tests.
let counter = 0;
const key = () => `test/fn${++counter}`;

describe('seam registry', () => {
  beforeEach(() => {
    _setOverridesForTest([]);
  });

  it('calls the original function when no mutant is active', () => {
    const k = key();
    const fn = seam(k, (x: number) => x * 2);
    const result = requestContext.run({ sid: 's', token: '', mutants: new Set() }, () => fn(5));
    expect(result).toBe(10);
  });

  it('calls the original when active mutants do not match this seam', () => {
    const k = key();
    const override: MutantOverride = { id: 'other-id', seam: 'other/key', impl: () => 99, public: false };
    _setOverridesForTest([override]);
    const fn = seam(k, (x: number) => x * 2);
    const result = requestContext.run({ sid: 's', token: '', mutants: new Set(['other-id']) }, () => fn(5));
    expect(result).toBe(10);
  });

  it('calls the override when its id is active and seam key matches', () => {
    const k = key();
    const override: MutantOverride = { id: 'active-id', seam: k, impl: (_orig: unknown, x: number) => x * 99, public: false };
    _setOverridesForTest([override]);
    const fn = seam(k, (x: number) => x * 2);
    const result = requestContext.run({ sid: 's', token: '', mutants: new Set(['active-id']) }, () => fn(5));
    expect(result).toBe(495);
  });

  it('the override receives the original function as its first argument', () => {
    const k = key();
    const override: MutantOverride = {
      id: 'orig-id',
      seam: k,
      impl: (orig: (x: number) => number, x: number) => orig(x) + 1000,
      public: false,
    };
    _setOverridesForTest([override]);
    const fn = seam(k, (x: number) => x * 2);
    const result = requestContext.run({ sid: 's', token: '', mutants: new Set(['orig-id']) }, () => fn(5));
    expect(result).toBe(1010);
  });

  it('throws on a duplicate seam key', () => {
    const k = key();
    seam(k, () => 1);
    expect(() => seam(k, () => 2)).toThrow('duplicate seam key');
  });

  it('listSeamKeys returns sorted keys', () => {
    const k1 = key(); const k2 = key(); const k3 = key();
    seam(k1, () => 1); seam(k2, () => 2); seam(k3, () => 3);
    const keys = listSeamKeys();
    const sorted = [...keys].sort();
    expect(keys).toEqual(sorted);
    expect(keys).toContain(k1);
    expect(keys).toContain(k2);
    expect(keys).toContain(k3);
  });

  it('_setOverridesForTest is reflected in getOverrides()', () => {
    const o: MutantOverride = { id: 'x', seam: 'x/x', impl: () => 0, public: false };
    _setOverridesForTest([o]);
    expect(getOverrides()).toEqual([o]);
  });

  it('calls original when outside requestContext (no store)', () => {
    const k = key();
    const fn = seam(k, (x: number) => x + 1);
    // No requestContext.run wrapping → getStore() returns undefined
    expect(fn(7)).toBe(8);
  });
});
