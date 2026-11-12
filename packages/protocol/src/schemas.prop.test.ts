import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { MutantManifest } from './manifest';
import { PossessOptions } from './possess';

describe('MutantManifest schema', () => {
  it('valid manifest round-trips through parse', () => {
    const rule = fc.constantFrom('C1','C2','C3','C4','C5','C6','C7','C8','C9','C10','C11','C12' as const);
    const mutantArb = fc.record({
      id: fc.string({ unit: fc.constantFrom(...('0123456789abcdef' as unknown as string[])), minLength: 8, maxLength: 64 }),
      rule,
      seam: fc.stringMatching(/^[a-z][a-z0-9-]{0,15}\/[A-Za-z][A-Za-z0-9]{0,15}$/),
      public: fc.boolean(),
    });
    const manifestArb = fc.record({
      version: fc.constant(1 as const),
      mutants: fc.array(mutantArb, { minLength: 0, maxLength: 5 }),
    });
    fc.assert(
      fc.property(manifestArb, (m) => {
        const parsed = MutantManifest.safeParse(m);
        expect(parsed.success).toBe(true);
        if (parsed.success) expect(parsed.data).toEqual(m);
      }),
    );
  });

  it('rejects version ≠ 1', () => {
    expect(MutantManifest.safeParse({ version: 2, mutants: [] }).success).toBe(false);
    expect(MutantManifest.safeParse({ version: 0, mutants: [] }).success).toBe(false);
  });

  it('rejects unknown rule values', () => {
    const bad = { version: 1, mutants: [{ id: 'abc12345', rule: 'C13', seam: 'a/b', public: false }] };
    expect(MutantManifest.safeParse(bad).success).toBe(false);
  });
});

describe('PossessOptions schema', () => {
  it('all five shapes validate', () => {
    const shapes = [
      { clean: true },
      { count: 2 },
      { demo: true },
      { cloneOf: 'some-sealed-token' },
      { mutantIds: ['abc', 'def'] },
    ];
    for (const s of shapes) {
      expect(PossessOptions.safeParse(s).success).toBe(true);
    }
  });

  it('rejects extra keys (strict shapes)', () => {
    expect(PossessOptions.safeParse({ clean: true, extra: 1 }).success).toBe(false);
    expect(PossessOptions.safeParse({ count: 1, extra: 1 }).success).toBe(false);
  });

  it('rejects count outside 1–3', () => {
    expect(PossessOptions.safeParse({ count: 0 }).success).toBe(false);
    expect(PossessOptions.safeParse({ count: 4 }).success).toBe(false);
  });

  it('rejects unknown shape', () => {
    expect(PossessOptions.safeParse({ unknown: true }).success).toBe(false);
    expect(PossessOptions.safeParse({}).success).toBe(false);
  });
});
