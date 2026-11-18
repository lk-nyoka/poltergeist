import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { MutantManifest } from '@poltergeist/protocol';
import { decideOutcomes, isKill, killRate, summarise, type FindingResult, type RunResult } from './kill';

// Fixture manifest only (never bench/mutant-manifest.json).
export const fixture = MutantManifest.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL('../test/fixtures/manifest.fixture.json', import.meta.url)), 'utf8')),
);
const ID = Object.fromEntries(fixture.mutants.map((m) => [m.rule, m.id])) as Record<string, string>;

const f = (oracle: FindingResult['oracle'], verified = true, killCheck = true): FindingResult => ({ oracle, verified, killCheck });
const run = (mutantId: string, seed: number, ...findings: FindingResult[]): RunResult => ({ mutantId, seed, findings });

describe('isKill', () => {
  it('needs verified, a mapped oracle and a silent clean replay', () => {
    expect(isKill('C1', f('DoubleCharge'))).toBe(true);
    expect(isKill('C1', f('DoubleCharge', false, true))).toBe(false); // not verified
    expect(isKill('C1', f('DoubleCharge', true, false))).toBe(false); // fires on clean too
    expect(isKill('C1', f('TillLoss'))).toBe(false); // not mapped to C1
    expect(isKill('C2', f('DoubleCharge'))).toBe(true); // mapped to C2 as well
    expect(isKill('C10', f('Crash'))).toBe(true);
    expect(isKill('C12', f('TextCorruption'))).toBe(false);
  });
});

describe('decideOutcomes', () => {
  it('records detected, verified and killed per (mutant, seed)', () => {
    const results = [
      run(ID['C3']!, 1, f('QuantityBreach')), // killed
      run(ID['C4']!, 1, f('TillLoss', true, false)), // detected + verified, clean also fired: not killed
      run(ID['C10']!, 1, f('TextCorruption', false, true)), // detected only
      run(ID['C12']!, 1), // tested, nothing found
      run(ID['C3']!, 1, f('Crash')), // unmapped finding for C3 changes nothing
    ];
    const o = Object.fromEntries(decideOutcomes(results, fixture).map((x) => [x.rule, x]));
    expect(o['C3']).toMatchObject({ detected: true, verified: true, killed: true });
    expect(o['C4']).toMatchObject({ detected: true, verified: true, killed: false });
    expect(o['C10']).toMatchObject({ detected: true, verified: false, killed: false });
    expect(o['C12']).toMatchObject({ detected: false, verified: false, killed: false });
  });

  it('excludes the public demo mutants unless asked', () => {
    const results = [run(ID['C1']!, 1, f('DoubleCharge')), run(ID['C8']!, 1, f('A11yViolation'))];
    expect(decideOutcomes(results, fixture)).toEqual([]);
    expect(decideOutcomes(results, fixture, { includePublic: true })).toHaveLength(2);
  });

  it('merges repeated runs of one (mutant, seed) and rejects unknown mutants', () => {
    const o = decideOutcomes([run(ID['C3']!, 1, f('QuantityBreach', false)), run(ID['C3']!, 1, f('TillLoss'))], fixture);
    expect(o).toHaveLength(1);
    expect(o[0]).toMatchObject({ verified: true, killed: true });
    expect(() => decideOutcomes([run('nope', 1)], fixture)).toThrow(/not in the manifest/);
  });
});

describe('killRate and summarise', () => {
  const results = [
    run(ID['C3']!, 1, f('QuantityBreach')),
    run(ID['C4']!, 1),
    run(ID['C10']!, 1, f('Crash')),
    run(ID['C12']!, 1),
    run(ID['C3']!, 2, f('QuantityBreach')),
    run(ID['C4']!, 2, f('TillLoss')),
  ];
  const outcomes = decideOutcomes(results, fixture);

  it('rate = kills ÷ tested; seedMean = mean of the per-seed rates', () => {
    expect(killRate(outcomes, 1)).toBe(2 / 4);
    expect(killRate(outcomes, 2)).toBe(1);
    expect(killRate(outcomes, 99)).toBe(0);
    const s = summarise(outcomes);
    expect(s.seedMean).toBeCloseTo((0.5 + 1) / 2);
    expect([s.min, s.max]).toEqual([0.5, 1]);
    expect(s.perSeed.map((x) => [x.seed, x.tested, x.killed])).toEqual([[1, 4, 2], [2, 2, 2]]);
  });

  it('reports per-rule counts, survivors and detected-but-not-killed runs', () => {
    const s = summarise(outcomes);
    expect(s.perRule['C3']).toEqual({ tested: 2, detected: 2, killed: 2 });
    expect(s.perRule['C4']).toEqual({ tested: 2, detected: 1, killed: 1 });
    expect(s.perRule['C1']).toEqual({ tested: 0, detected: 0, killed: 0 });
    expect(s.survivors).toEqual([ID['C12']]);
    expect(s.detectedNotKilled).toEqual([]);
  });

  it('lists detected-but-not-killed pairs', () => {
    const s = summarise(decideOutcomes([run(ID['C4']!, 7, f('TillLoss', false))], fixture));
    expect(s.detectedNotKilled).toEqual([`${ID['C4']}:7`]);
    expect(s.survivors).toEqual([ID['C4']]);
  });

  it('is zero, not NaN, for no outcomes', () => {
    expect(summarise([])).toMatchObject({ seedMean: 0, min: 0, max: 0, survivors: [], perSeed: [] });
  });
});
