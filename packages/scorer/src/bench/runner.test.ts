import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MutantManifest, type OracleName } from '@poltergeist/protocol';
import type { FindingResult } from '../kill';
import {
  BenchArgError,
  formatStdout,
  parseMutantsArg,
  parseSeeds,
  runBenchmark,
  selectMutants,
  toFindingResults,
} from './runner';

const manifest = MutantManifest.parse(
  JSON.parse(readFileSync(fileURLToPath(new URL('../../test/fixtures/manifest.fixture.json', import.meta.url)), 'utf8')),
);
// Non-public fixture mutants, by sorted id: 2 (C3), 3 (C4), 5 (C10), 6 (C12).
const ID = (n: number) => `f1x000000000000${n}`;

const kill = (oracle: OracleName): FindingResult => ({ oracle, verified: true, killCheck: true });

describe('arguments', () => {
  it('parses --mutants', () => {
    expect(parseMutantsArg('all')).toBe('all');
    expect(parseMutantsArg('3')).toBe(3);
    for (const bad of ['0', '-1', '1.5', 'some', '']) expect(() => parseMutantsArg(bad)).toThrow(BenchArgError);
  });

  it('parses --seeds', () => {
    expect(parseSeeds('1,2, 3,2')).toEqual([1, 2, 3]);
    for (const bad of ['', 'a', '1,,2', '-1', '1.5', Array.from({ length: 21 }, (_, i) => i).join(',')]) {
      expect(() => parseSeeds(bad)).toThrow(BenchArgError);
    }
  });
});

describe('selectMutants', () => {
  it('uses only non-public mutants, in sorted id order', () => {
    expect(selectMutants(manifest, 'all').map((m) => m.id)).toEqual([ID(2), ID(3), ID(5), ID(6)]);
  });
  it('takes the first n, and never more than exist', () => {
    expect(selectMutants(manifest, 2).map((m) => m.id)).toEqual([ID(2), ID(3)]);
    expect(selectMutants(manifest, 99)).toHaveLength(4);
  });
  it('rejects a non-positive count', () => {
    expect(() => selectMutants(manifest, 0)).toThrow(BenchArgError);
  });
});

describe('runBenchmark', () => {
  const mutants = selectMutants(manifest, 'all');

  /** C3 and C4 are killed under every seed; C10 only under seed 2; C12 never; C4 flaky under seed 2 is not used here. */
  const runOne = async (id: string, seed: number) => {
    if (id === ID(2)) return { findings: [kill('QuantityBreach')] };
    if (id === ID(3)) return { findings: [kill('TillLoss')] };
    if (id === ID(5)) return { findings: seed === 2 ? [kill('TextCorruption')] : [] };
    return { findings: [{ oracle: 'Crash' as const, verified: true, killCheck: false }] }; // detected, not killed
  };

  it('runs every (mutant, seed) pair and decides kills through the scorer', async () => {
    const run = await runBenchmark({ manifest, mutants, seeds: [1, 2], runOne });
    expect(run.results).toHaveLength(8);
    expect(run.outcomes).toHaveLength(8);
    const by = (id: string, seed: number) => run.outcomes.find((o) => o.mutantId === id && o.seed === seed)!;
    expect(by(ID(2), 1)).toMatchObject({ detected: true, verified: true, killed: true, rule: 'C3' });
    expect(by(ID(5), 1)).toMatchObject({ detected: false, verified: false, killed: false });
    expect(by(ID(5), 2)).toMatchObject({ detected: true, killed: true });
    expect(by(ID(6), 1)).toMatchObject({ detected: true, verified: true, killed: false });
  });

  it('records a timing per run from the injected clock, and counts a thrown run as tested with no findings', async () => {
    let t = 0;
    const run = await runBenchmark({
      manifest,
      mutants: mutants.slice(0, 2),
      seeds: [7],
      now: () => (t += 250),
      runOne: async (id) => {
        if (id === ID(3)) throw new Error('browser died');
        return { findings: [kill('QuantityBreach')] };
      },
    });
    expect(run.timings).toEqual([
      { mutantId: ID(2), seed: 7, ms: 250, error: false },
      { mutantId: ID(3), seed: 7, ms: 250, error: true },
    ]);
    expect(run.outcomes.find((o) => o.mutantId === ID(3))).toMatchObject({ detected: false, killed: false });
  });

  it('a result for a mutant outside the manifest is an error, not a skip', async () => {
    await expect(
      runBenchmark({ manifest, mutants: [{ id: 'ffffffffffffffff', rule: 'C1', seam: 'x/y', public: false }], seeds: [1], runOne: async () => ({ findings: [] }) }),
    ).rejects.toThrow(/not in the manifest/);
  });
});

describe('formatStdout', () => {
  it('prints Cn killed/tested per tested rule plus the overall rate, and nothing else', async () => {
    const mutants = selectMutants(manifest, 'all');
    const run = await runBenchmark({
      manifest,
      mutants,
      seeds: [1, 2],
      runOne: async (id, seed) => (id === ID(2) || (id === ID(5) && seed === 2) ? { findings: [kill(id === ID(2) ? 'QuantityBreach' : 'TextCorruption')] } : { findings: [] }),
    });
    const lines = formatStdout(run.outcomes);
    expect(lines).toEqual(['C3 2/2', 'C4 0/2', 'C10 1/2', 'C12 0/2', 'overall 3/8 · mean kill rate 37.5% over 2 seed(s)']);
  });

  it('never prints mutant ids, seams or per-mutant results', async () => {
    const run = await runBenchmark({ manifest, mutants: selectMutants(manifest, 'all'), seeds: [1], runOne: async () => ({ findings: [kill('TillLoss')] }) });
    const text = formatStdout(run.outcomes).join('\n');
    expect(text).not.toMatch(/f1x/);
    for (const m of manifest.mutants) expect(text).not.toContain(m.seam);
  });

  it('handles no outcomes', () => {
    expect(formatStdout([])).toEqual(['overall 0/0 · mean kill rate 0.0% over 0 seed(s)']);
  });
});

describe('toFindingResults', () => {
  it('a kill needs verification and a silent clean replay', () => {
    expect(
      toFindingResults([
        { oracle: 'TillLoss', verified: true, cleanSilent: true },
        { oracle: 'TillLoss', verified: true, cleanSilent: false },
        { oracle: 'TillLoss', verified: false, cleanSilent: true },
        { oracle: 'Crash', verified: true, cleanSilent: null },
      ]),
    ).toEqual([
      { oracle: 'TillLoss', verified: true, killCheck: true },
      { oracle: 'TillLoss', verified: true, killCheck: false },
      { oracle: 'TillLoss', verified: false, killCheck: false },
      { oracle: 'Crash', verified: true, killCheck: false },
    ]);
  });
});
