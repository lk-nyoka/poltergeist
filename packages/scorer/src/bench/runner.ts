/**
 * The benchmark runner's logic, with the haunting injected (`RunOne`) so it is unit-tested with fixture data.
 * Nothing here prints a mutant id, seam or per-mutant result: `formatStdout` is counts per rule only.
 */
import { RULES, type MutantManifest, type OracleName } from '@poltergeist/protocol';
import { decideOutcomes, summarise, type FindingResult, type Outcome, type RunResult } from '../kill';
import type { TimedRun } from '../report';

export class BenchArgError extends Error {}

type Entry = MutantManifest['mutants'][number];

/** The non-public mutants (the benchmark pool), by sorted id; `all` or the first `n`. */
export function selectMutants(manifest: MutantManifest, count: 'all' | number): Entry[] {
  const pool = manifest.mutants.filter((m) => !m.public).sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  if (count === 'all') return pool;
  if (!Number.isInteger(count) || count < 1) throw new BenchArgError('--mutants must be "all" or a positive integer');
  return pool.slice(0, count);
}

export function parseMutantsArg(raw: string): 'all' | number {
  if (raw === 'all') return 'all';
  if (!/^\d+$/.test(raw) || Number(raw) < 1) throw new BenchArgError('--mutants must be "all" or a positive integer');
  return Number(raw);
}

/** `1,2,3` → [1,2,3]. Distinct non-negative integers, at most 20. */
export function parseSeeds(raw: string): number[] {
  const parts = raw.split(',').map((s) => s.trim());
  if (parts.length === 0 || parts.some((p) => !/^\d+$/.test(p))) throw new BenchArgError('--seeds must be a comma-separated list of non-negative integers');
  const seeds = [...new Set(parts.map(Number))];
  if (seeds.length > 20) throw new BenchArgError('--seeds takes at most 20 seeds');
  return seeds;
}

export type RunOneResult = { findings: FindingResult[] };
/** One haunting of one mutant under one seed. A thrown error is a failed run: tested, with no findings. */
export type RunOne = (mutantId: string, seed: number) => Promise<RunOneResult>;

export type BenchRun = {
  results: RunResult[];
  timings: TimedRun[];
  outcomes: Outcome[];
};

export async function runBenchmark(args: {
  manifest: MutantManifest;
  mutants: Entry[];
  seeds: number[];
  runOne: RunOne;
  /** Millisecond clock. Defaults to `performance.now`. */
  now?: () => number;
}): Promise<BenchRun> {
  const now = args.now ?? (() => performance.now());
  const results: RunResult[] = [];
  const timings: TimedRun[] = [];
  for (const seed of args.seeds) {
    for (const m of args.mutants) {
      const start = now();
      let findings: FindingResult[] = [];
      let error = false;
      try {
        findings = (await args.runOne(m.id, seed)).findings;
      } catch {
        error = true;
      }
      timings.push({ mutantId: m.id, seed, ms: Math.max(0, Math.round(now() - start)), error });
      results.push({ mutantId: m.id, seed, findings });
    }
  }
  return { results, timings, outcomes: decideOutcomes(results, args.manifest) };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;

/**
 * The ONLY thing the runner prints: `Cn killed/tested` per rule that was tested (counted over
 * (mutant, seed) runs), then the overall figures. Never ids, seams or per-mutant results.
 */
export function formatStdout(outcomes: Outcome[]): string[] {
  const s = summarise(outcomes);
  const lines = RULES.filter((r) => s.perRule[r].tested > 0).map((r) => `${r} ${s.perRule[r].killed}/${s.perRule[r].tested}`);
  const tested = outcomes.length;
  const killed = outcomes.filter((o) => o.killed).length;
  lines.push(`overall ${killed}/${tested} · mean kill rate ${pct(s.seedMean)} over ${s.perSeed.length} seed(s)`);
  return lines;
}

/** Findings of a haunting in the shape the scorer decides kills from. */
export function toFindingResults(
  items: { oracle: OracleName; verified: boolean; cleanSilent: boolean | null }[],
): FindingResult[] {
  return items.map((i) => ({ oracle: i.oracle, verified: i.verified, killCheck: i.verified && i.cleanSilent === true }));
}
