import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MutantManifest, ORACLE_NAMES, ORACLE_RULES } from '@poltergeist/protocol';
import { decideOutcomes, killRate, summarise, type RunResult } from './kill';

// Fixture manifest only (never bench/mutant-manifest.json).
const manifest = MutantManifest.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL('../test/fixtures/manifest.fixture.json', import.meta.url)), 'utf8')),
);
const ruleOf = new Map(manifest.mutants.map((m) => [m.id, m.rule]));
const benchmarkIds = manifest.mutants.filter((m) => !m.public).map((m) => m.id);

const findingArb = fc.record({
  oracle: fc.constantFrom(...ORACLE_NAMES),
  verified: fc.boolean(),
  killCheck: fc.boolean(),
});
const resultsArb = fc.array(
  fc.record({
    mutantId: fc.constantFrom(...manifest.mutants.map((m) => m.id)), // includes the public ones
    seed: fc.constantFrom(1, 2, 3),
    findings: fc.array(findingArb, { maxLength: 4 }),
  }),
  { maxLength: 30 },
);

/** The spec, written out independently of the implementation. */
function expectedKilled(results: RunResult[]): Set<string> {
  const out = new Set<string>();
  for (const r of results) {
    const rule = ruleOf.get(r.mutantId)!;
    if (r.findings.some((x) => x.verified && x.killCheck && ORACLE_RULES[rule].includes(x.oracle))) out.add(`${r.mutantId}:${r.seed}`);
  }
  return out;
}
const testedKeys = (results: RunResult[]) =>
  new Set(results.filter((r) => benchmarkIds.includes(r.mutantId)).map((r) => `${r.mutantId}:${r.seed}`));

describe('P7: scorer maths', () => {
  it('every rate is in [0, 1], killed ⊆ tested, and the seed mean is the mean of the per-seed rates', () => {
    fc.assert(
      fc.property(resultsArb, (results) => {
        const outcomes = decideOutcomes(results, manifest);
        const s = summarise(outcomes);
        const tested = testedKeys(results);
        const killed = new Set(outcomes.filter((o) => o.killed).map((o) => `${o.mutantId}:${o.seed}`));

        for (const seed of [1, 2, 3]) {
          const r = killRate(outcomes, seed);
          expect(r).toBeGreaterThanOrEqual(0);
          expect(r).toBeLessThanOrEqual(1);
        }
        for (const k of killed) expect(tested.has(k)).toBe(true);
        expect(new Set(outcomes.map((o) => `${o.mutantId}:${o.seed}`))).toEqual(tested);

        const rates = s.perSeed.map((x) => x.rate);
        if (rates.length > 0) {
          expect(s.seedMean).toBeCloseTo(rates.reduce((a, b) => a + b, 0) / rates.length, 12);
          expect(s.min).toBeLessThanOrEqual(s.seedMean + 1e-12);
          expect(s.max).toBeGreaterThanOrEqual(s.seedMean - 1e-12);
        }
        for (const x of s.perSeed) expect(x.killed).toBeLessThanOrEqual(x.tested);
      }),
    );
  });

  it('a kill counts only through ORACLE_RULES and a silent clean replay', () => {
    fc.assert(
      fc.property(resultsArb, (results) => {
        const expected = new Set([...expectedKilled(results)].filter((k) => testedKeys(results).has(k)));
        const got = new Set(decideOutcomes(results, manifest).filter((o) => o.killed).map((o) => `${o.mutantId}:${o.seed}`));
        expect(got).toEqual(expected);

        // No finding survives its clean replay firing: nothing is killed.
        const dirty = results.map((r) => ({ ...r, findings: r.findings.map((x) => ({ ...x, killCheck: false })) }));
        expect(decideOutcomes(dirty, manifest).some((o) => o.killed)).toBe(false);
        // No finding is verified: nothing is killed.
        const unverified = results.map((r) => ({ ...r, findings: r.findings.map((x) => ({ ...x, verified: false })) }));
        expect(decideOutcomes(unverified, manifest).some((o) => o.killed)).toBe(false);
      }),
    );
  });

  it('adding a finding can never reduce kills', () => {
    fc.assert(
      fc.property(resultsArb, findingArb, (results, extra) => {
        const before = decideOutcomes(results, manifest).filter((o) => o.killed).length;
        const more = results.map((r, i) => (i === 0 ? { ...r, findings: [...r.findings, extra] } : r));
        expect(decideOutcomes(more, manifest).filter((o) => o.killed).length).toBeGreaterThanOrEqual(before);
      }),
    );
  });
});
