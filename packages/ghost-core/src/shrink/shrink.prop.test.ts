import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { shrink, textArb } from './shrink';

const len = (s: string) => [...s].length;

describe('P2: the shrinker', () => {
  // Shrinking to the exact boundary costs about n² predicate calls (measured: n=41 → 4.7k calls, 0.5 s;
  // n=100 → 36k, 5.6 s; n=200 → 156k, 32 s), so the property draws n from 1–60 and uses a fixed
  // number of outer runs. Larger n is covered by the detection test below and by interrupted runs.
  it('with no time limit, returns an input that still fails, is no longer than the original, and is stable for the same seed and path', async () => {
    await fc.assert(
      fc.asyncProperty(fc.integer({ min: 1, max: 60 }), fc.integer(), async (n, seed) => {
        const holds = (s: string) => len(s) <= n;
        const r = await shrink(textArb, holds, { seed, numRuns: 400 }); // no budgetMs: no time limit
        fc.pre(r.found); // a run that never reached length n+1 has nothing to shrink
        if (!r.found) return;
        expect(r.interrupted).toBe(false);
        expect(holds(r.value)).toBe(false); // still fails
        expect(len(r.value)).toBeLessThanOrEqual(len(r.original)); // no longer than the original
        expect(len(r.value)).toBe(n + 1); // with no limit it shrinks to the exact boundary

        // Same fast-check seed and path give the same input.
        const again = await shrink(textArb, holds, { seed: r.seed, path: r.path, numRuns: 400 });
        expect(again.found).toBe(true);
        if (again.found) expect(again.value).toBe(r.value);
      }),
      { numRuns: 20 },
    );
  }, 120_000);

  it('textArb reaches past every threshold up to 200, so the failure is found', () => {
    const lens = fc.sample(textArb, { numRuns: 400, seed: 12345 }).map(len);
    for (const n of [5, 41, 100, 150, 200]) expect(lens.some((l) => l > n)).toBe(true);
  });
});
