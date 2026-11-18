import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import type { Outcome } from './kill';
import { privateWriter } from './bench/private-dir';
import {
  buildResults,
  buildToolResults,
  median,
  medianMsPerMutant,
  renderLeaderboard,
  variance,
  writeReport,
  type TimedRun,
} from './report';

const o = (mutantId: string, seed: number, rule: Outcome['rule'], detected: boolean, verified: boolean, killed: boolean): Outcome => ({
  mutantId,
  seed,
  rule,
  detected,
  verified,
  killed,
});

// Two seeds. Seed 1: A killed, B detected+verified but not killed, C missed. Seed 2: A killed, B killed, C missed.
const outcomes: Outcome[] = [
  o('aaaa0001', 1, 'C1', true, true, true),
  o('bbbb0002', 1, 'C4', true, true, false),
  o('cccc0003', 1, 'C8', false, false, false),
  o('aaaa0001', 2, 'C1', true, true, true),
  o('bbbb0002', 2, 'C4', true, true, true),
  o('cccc0003', 2, 'C8', false, false, false),
];
const timings: TimedRun[] = [
  { mutantId: 'aaaa0001', seed: 1, ms: 1000, error: false },
  { mutantId: 'aaaa0001', seed: 2, ms: 3000, error: false },
  { mutantId: 'bbbb0002', seed: 1, ms: 5000, error: false },
  { mutantId: 'bbbb0002', seed: 2, ms: 5000, error: false },
  { mutantId: 'cccc0003', seed: 1, ms: 9000, error: true },
  { mutantId: 'cccc0003', seed: 2, ms: 11000, error: false },
];

describe('statistics', () => {
  it('median handles odd, even and empty', () => {
    expect(median([3, 1, 2])).toBe(2);
    expect(median([4, 1, 3, 2])).toBe(2.5);
    expect(median([])).toBeNull();
  });

  it('variance is the population variance, and 0 for fewer than two values', () => {
    expect(variance([])).toBe(0);
    expect(variance([0.5])).toBe(0);
    expect(variance([0.25, 0.75])).toBeCloseTo(0.0625, 10);
  });

  it('median time per mutant is the median of each mutant mean across seeds', () => {
    // means: a 2000, b 5000, c 10000
    expect(medianMsPerMutant(timings)).toBe(5000);
    expect(medianMsPerMutant([])).toBeNull();
  });
});

describe('buildToolResults', () => {
  const r = buildToolResults({ tool: 'Poltergeist', outcomes, timings });

  it('counts detected, verified and killed over (mutant, seed) runs', () => {
    expect(r.counts).toEqual({ runs: 6, detected: 4, verified: 4, killed: 3, errors: 1 });
  });

  it('computes per-seed rates, mean, spread and variance', () => {
    expect(r.killRate.perSeed.map((p) => p.rate)).toEqual([1 / 3, 2 / 3]);
    expect(r.killRate.seedMean).toBeCloseTo(0.5, 10);
    expect(r.killRate.min).toBeCloseTo(1 / 3, 10);
    expect(r.killRate.max).toBeCloseTo(2 / 3, 10);
    expect(r.killRate.variance).toBeCloseTo(((1 / 6) ** 2 + (1 / 6) ** 2) / 2, 10);
    expect(r.killRate.stdDev).toBeCloseTo(1 / 6, 10);
  });

  it('breaks counts down per rule, including verified', () => {
    expect(r.perRule.C1).toEqual({ tested: 2, detected: 2, verified: 2, killed: 2 });
    expect(r.perRule.C4).toEqual({ tested: 2, detected: 2, verified: 2, killed: 1 });
    expect(r.perRule.C8).toEqual({ tested: 2, detected: 0, verified: 0, killed: 0 });
    expect(r.perRule.C2.tested).toBe(0);
  });

  it('lists survivors and detected-but-not-killed runs', () => {
    expect(r.survivors).toEqual(['cccc0003']);
    expect(r.detectedNotKilled).toBe(1);
  });

  it('the median time is carried through', () => {
    expect(r.medianMsPerMutant).toBe(5000);
  });

  it('is well-formed with nothing tested', () => {
    const empty = buildToolResults({ tool: 'x', outcomes: [], timings: [] });
    expect(empty.counts).toEqual({ runs: 0, detected: 0, verified: 0, killed: 0, errors: 0 });
    expect(empty.killRate).toMatchObject({ seedMean: 0, variance: 0, stdDev: 0 });
    expect(empty.medianMsPerMutant).toBeNull();
  });
});

describe('renderLeaderboard', () => {
  const poltergeist = buildToolResults({ tool: 'Poltergeist', outcomes, timings });

  it('shows the tool row with detected, verified, killed, mean rate, spread and median time', () => {
    const md = renderLeaderboard(buildResults({ poltergeist, generatedAt: '2026-01-01T00:00:00.000Z' }));
    expect(md).toContain('| Poltergeist | 6 | 4 | 4 | 3 | 50.0% |');
    expect(md).toContain('std dev 16.7 pts');
    expect(md).toContain('5.0 s');
    expect(md).toContain('Baseline (generic agent with Playwright MCP) | not run yet');
  });

  it('always lists surviving mutants and detected-but-not-killed runs', () => {
    const md = renderLeaderboard(buildResults({ poltergeist, generatedAt: 't' }));
    expect(md).toContain('1 mutant(s) were never killed:');
    expect(md).toContain('- cccc0003');
    expect(md).toContain('1 (mutant, seed) run(s) were detected by a mapped oracle but not killed');
    expect(md).toContain('1 run(s) failed');
  });

  it('says so when nothing survived', () => {
    const killedAll = buildToolResults({ tool: 'P', outcomes: [o('a0', 1, 'C1', true, true, true)], timings: [] });
    expect(renderLeaderboard(buildResults({ poltergeist: killedAll, generatedAt: 't' }))).toContain('None: every tested mutant was killed');
  });

  it('shows a baseline column and names the rules where the baseline wins', () => {
    const baselineOutcomes = [o('aaaa0001', 1, 'C1', true, true, true), o('cccc0003', 1, 'C8', true, true, true), o('cccc0003', 2, 'C8', true, true, true)];
    const baseline = buildToolResults({ tool: 'Baseline', outcomes: baselineOutcomes, timings: [] });
    const md = renderLeaderboard(buildResults({ poltergeist, baseline, generatedAt: 't' }));
    expect(md).toContain('| Rule | Tested | Poltergeist killed | Baseline killed |');
    expect(md).toContain('| C8 | 2 | 0 | 2 |');
    expect(md).toContain('The baseline killed more than Poltergeist on: C8.');
  });

  it('says when the baseline never wins', () => {
    const baseline = buildToolResults({ tool: 'Baseline', outcomes: [o('aaaa0001', 1, 'C1', true, true, false)], timings: [] });
    expect(renderLeaderboard(buildResults({ poltergeist, baseline, generatedAt: 't' }))).toContain('no more mutants than Poltergeist on any rule');
  });
});

describe('writeReport', () => {
  let root = '';
  afterEach(async () => {
    if (root) await rm(root, { recursive: true, force: true });
  });

  it('writes benchmark-results.json, leaderboard.md and runs.json under the private root', async () => {
    root = await mkdtemp(join(tmpdir(), 'pg-report-'));
    const results = buildResults({ poltergeist: buildToolResults({ tool: 'Poltergeist', outcomes, timings }), generatedAt: '2026-01-01T00:00:00.000Z' });
    const files = await writeReport({ writer: privateWriter(root), dir: join(root, 'runs', 't'), results, outcomes, timings });
    expect(files.map((f) => f.replace(/\\/g, '/').split('/').pop())).toEqual(['benchmark-results.json', 'leaderboard.md', 'runs.json']);
    const json = JSON.parse(await readFile(files[0]!, 'utf8'));
    expect(json).toMatchObject({ schema: 1, baseline: null, poltergeist: { tool: 'Poltergeist', counts: { killed: 3 } } });
    expect(await readFile(files[1]!, 'utf8')).toContain('# Benchmark leaderboard (private)');
    const runs = JSON.parse(await readFile(files[2]!, 'utf8'));
    expect(runs.outcomes).toHaveLength(6);
    expect(runs.timings).toHaveLength(6);
  });

  it('refuses to write outside the private root', async () => {
    root = await mkdtemp(join(tmpdir(), 'pg-report-'));
    const results = buildResults({ poltergeist: buildToolResults({ tool: 'P', outcomes: [], timings: [] }), generatedAt: 't' });
    await expect(
      writeReport({ writer: privateWriter(root), dir: join(root, '..', 'public'), results, outcomes: [], timings: [] }),
    ).rejects.toThrow(/outside bench\/\.private/);
  });
});
