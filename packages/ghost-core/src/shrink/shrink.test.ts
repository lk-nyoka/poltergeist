import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { boundaryTextArb, glitchTextArb, shrink, textArb } from './shrink';
import { isContractText } from '../contract';

const len = (s: string) => [...s].length;
const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

describe('shrink', () => {
  it('shrinks a "breaks above 41 code points" fault to 42 characters', async () => {
    const r = await shrink(textArb, (s) => len(s) <= 41, { seed: 7, numRuns: 500 });
    expect(r.found).toBe(true);
    if (r.found) {
      expect(len(r.value)).toBe(42);
      expect(r.numShrinks).toBeGreaterThan(0);
      expect(r.interrupted).toBe(false);
    }
  });

  it('the default string arbitrary would miss it, which is why textArb is length-biased', async () => {
    const plain = await shrink(fc.string({ maxLength: 300 }), (s) => len(s) <= 41, { seed: 7, numRuns: 100 });
    const biased = await shrink(textArb, (s) => len(s) <= 41, { seed: 7, numRuns: 100 });
    expect(biased.found).toBe(true);
    // Not asserted for plain: it may or may not find it; only the biased arbitrary is guaranteed here.
    expect(typeof plain.found).toBe('boolean');
  });

  it('reports no finding when the property always holds', async () => {
    expect(await shrink(textArb, () => true, { seed: 1, numRuns: 50 })).toEqual({ found: false });
  });

  it('treats an interrupted run that failed as a finding', async () => {
    // Slow predicate and a short budget: shrinking is cut off, but the failure stands.
    const r = await shrink(
      textArb,
      async (s) => {
        await sleep(2);
        return len(s) <= 3;
      },
      { seed: 3, budgetMs: 150, numRuns: 500 },
    );
    expect(r.found).toBe(true);
    if (r.found) expect(len(r.value)).toBeGreaterThan(3);
  });

  it('treats an interrupted run that had not failed as no finding', async () => {
    const r = await shrink(
      textArb,
      async () => {
        await sleep(5);
        return true;
      },
      { seed: 3, budgetMs: 40, numRuns: 1000 },
    );
    expect(r).toEqual({ found: false });
  });

  it('treats a run interrupted before its first test as no finding, not a crash', async () => {
    const r = await shrink(textArb, async () => (await sleep(5), true), { seed: 3, budgetMs: 0, numRuns: 1000 });
    expect(r).toEqual({ found: false });
  });

  it('is deterministic: same seed, same result', async () => {
    const a = await shrink(textArb, (s) => len(s) <= 20, { seed: 99, numRuns: 300 });
    const b = await shrink(textArb, (s) => len(s) <= 20, { seed: 99, numRuns: 300 });
    expect(b).toEqual(a);
  });

  it('never uses fc.assert in its source', () => {
    const src = readFileSync(fileURLToPath(new URL('./shrink.ts', import.meta.url)), 'utf8');
    const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/fc\.assert|\bassert\(/);
    expect(code).toMatch(/fc\.check/);
  });
});

describe('text arbitraries', () => {
  it('boundary cases cover 99/100/101 code points, a control character and a lone surrogate', () => {
    const valid = (s: string) => isContractText(s);
    const all = fc.sample(boundaryTextArb, { numRuns: 200, seed: 1 });
    expect(new Set(all).size).toBe(8);
    expect(all.filter(valid).map(len).sort((a, b) => a - b)).toEqual(expect.arrayContaining([0, 99, 100]));
    expect(all.some((s) => len(s) === 101)).toBe(true);
    expect(all.some((s) => s.includes('\u0007'))).toBe(true);
    expect(all.some((s) => /[\uD800-\uDBFF](?![\uDC00-\uDFFF])/.test(s))).toBe(true);
  });

  it('textArb reaches long inputs and glitchTextArb adds the boundary cases', () => {
    const lens = fc.sample(textArb, { numRuns: 400, seed: 2 }).map(len);
    expect(Math.max(...lens)).toBeGreaterThan(100);
    const g = fc.sample(glitchTextArb, { numRuns: 400, seed: 2 });
    expect(g.some((s) => s === 'x'.repeat(101))).toBe(true);
  });
});
