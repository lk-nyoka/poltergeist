/**
 * Benchmark report: benchmark-results.json (machine-readable) and leaderboard.md (human-readable), built
 * from the scorer's {detected, verified, killed} per (mutant, seed). Everything is written to
 * bench/.private/ through a PrivateWriter until S08 publishes results.
 */
import { RULES, type Rule } from '@poltergeist/protocol';
import { summarise, type Outcome, type SeedSummary } from './kill';
import type { PrivateWriter } from './bench/private-dir';

export type TimedRun = { mutantId: string; seed: number; ms: number; error: boolean };

export type ToolResults = {
  tool: string;
  seeds: number[];
  counts: { runs: number; detected: number; verified: number; killed: number; errors: number };
  killRate: { seedMean: number; min: number; max: number; variance: number; stdDev: number; perSeed: SeedSummary[] };
  /** Median over mutants of each mutant's mean wall time across seeds, in ms. Null with no timings. */
  medianMsPerMutant: number | null;
  perRule: Record<Rule, { tested: number; detected: number; verified: number; killed: number }>;
  /** Mutants tested but never killed under any seed. Ids appear only in the private files. */
  survivors: string[];
  /** (mutant, seed) pairs a mapped oracle detected but that were not killed. */
  detectedNotKilled: number;
};

export type BenchmarkResults = {
  schema: 1;
  generatedAt: string;
  poltergeist: ToolResults;
  /** The comparison agent's results in the same shape, or null before it has been run. */
  baseline: ToolResults | null;
};

export function median(values: number[]): number | null {
  if (values.length === 0) return null;
  const s = [...values].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 === 1 ? s[mid]! : (s[mid - 1]! + s[mid]!) / 2;
}

/** Population variance of the per-seed kill rates (0 with fewer than two seeds). */
export function variance(values: number[]): number {
  if (values.length < 2) return 0;
  const mean = values.reduce((a, b) => a + b, 0) / values.length;
  return values.reduce((a, b) => a + (b - mean) ** 2, 0) / values.length;
}

export function medianMsPerMutant(timings: TimedRun[]): number | null {
  const byMutant = new Map<string, number[]>();
  for (const t of timings) byMutant.set(t.mutantId, [...(byMutant.get(t.mutantId) ?? []), t.ms]);
  return median([...byMutant.values()].map((ms) => ms.reduce((a, b) => a + b, 0) / ms.length));
}

export function buildToolResults(args: { tool: string; outcomes: Outcome[]; timings: TimedRun[] }): ToolResults {
  const s = summarise(args.outcomes);
  const rates = s.perSeed.map((p) => p.rate);
  const v = variance(rates);
  return {
    tool: args.tool,
    seeds: s.perSeed.map((p) => p.seed),
    counts: {
      runs: args.outcomes.length,
      detected: args.outcomes.filter((o) => o.detected).length,
      verified: args.outcomes.filter((o) => o.verified).length,
      killed: args.outcomes.filter((o) => o.killed).length,
      errors: args.timings.filter((t) => t.error).length,
    },
    killRate: { seedMean: s.seedMean, min: s.min, max: s.max, variance: v, stdDev: Math.sqrt(v), perSeed: s.perSeed },
    medianMsPerMutant: medianMsPerMutant(args.timings),
    perRule: Object.fromEntries(
      RULES.map((r) => {
        const of = args.outcomes.filter((o) => o.rule === r);
        return [r, { tested: of.length, detected: of.filter((o) => o.detected).length, verified: of.filter((o) => o.verified).length, killed: of.filter((o) => o.killed).length }];
      }),
    ) as ToolResults['perRule'],
    survivors: s.survivors,
    detectedNotKilled: s.detectedNotKilled.length,
  };
}

export function buildResults(args: { poltergeist: ToolResults; baseline?: ToolResults | null; generatedAt: string }): BenchmarkResults {
  return { schema: 1, generatedAt: args.generatedAt, poltergeist: args.poltergeist, baseline: args.baseline ?? null };
}

const pct = (x: number) => `${(x * 100).toFixed(1)}%`;
const secs = (ms: number | null) => (ms === null ? 'n/a' : `${(ms / 1000).toFixed(1)} s`);

function toolRow(r: ToolResults): string {
  const k = r.killRate;
  const spread = r.seeds.length < 2 ? 'one seed' : `${pct(k.min)} to ${pct(k.max)}, std dev ${(k.stdDev * 100).toFixed(1)} pts, variance ${k.variance.toFixed(4)}`;
  return `| ${r.tool} | ${r.counts.runs} | ${r.counts.detected} | ${r.counts.verified} | ${r.counts.killed} | ${pct(k.seedMean)} | ${spread} | ${secs(r.medianMsPerMutant)} |`;
}

/** The human-readable leaderboard. Surviving mutants and baseline wins are always shown. */
export function renderLeaderboard(results: BenchmarkResults): string {
  const p = results.poltergeist;
  const b = results.baseline;
  const out: string[] = [
    '# Benchmark leaderboard (private)',
    '',
    `Generated ${results.generatedAt}. Seeds: ${p.seeds.join(', ') || 'none'}. Counts are over (mutant, seed) runs.`,
    '',
    '| Tool | Runs | Detected | Verified | Killed | Mean kill rate | Spread across seeds | Median time per mutant |',
    '| --- | ---: | ---: | ---: | ---: | ---: | --- | ---: |',
    toolRow(p),
    b ? toolRow(b) : '| Baseline (generic agent with Playwright MCP) | not run yet | | | | | | |',
    '',
    '## Kills by contract rule',
    '',
    b ? '| Rule | Tested | Poltergeist killed | Baseline killed |' : '| Rule | Tested | Poltergeist killed |',
    b ? '| --- | ---: | ---: | ---: |' : '| --- | ---: | ---: |',
    ...RULES.filter((r) => p.perRule[r].tested > 0 || (b?.perRule[r].tested ?? 0) > 0).map((r) =>
      b
        ? `| ${r} | ${p.perRule[r].tested} | ${p.perRule[r].killed} | ${b.perRule[r].killed} |`
        : `| ${r} | ${p.perRule[r].tested} | ${p.perRule[r].killed} |`,
    ),
    '',
  ];
  if (b) {
    const wins = RULES.filter((r) => b.perRule[r].killed > p.perRule[r].killed);
    out.push('## Baseline wins', '', wins.length === 0 ? 'The baseline killed no more mutants than Poltergeist on any rule.' : `The baseline killed more than Poltergeist on: ${wins.join(', ')}.`, '');
  }
  out.push(
    '## Detected but not killed',
    '',
    `${p.detectedNotKilled} (mutant, seed) run(s) were detected by a mapped oracle but not killed (replay did not verify, or the clean replay was not silent).`,
    '',
    '## Surviving mutants',
    '',
    p.survivors.length === 0 ? 'None: every tested mutant was killed under at least one seed.' : `${p.survivors.length} mutant(s) were never killed:`,
    '',
    ...p.survivors.map((id) => `- ${id}`),
    '',
  );
  if (p.counts.errors > 0) out.push('## Failed runs', '', `${p.counts.errors} run(s) failed and were counted as tested with no findings.`, '');
  return out.join('\n');
}

/** Writes benchmark-results.json, leaderboard.md and runs.json into `dir` (inside bench/.private). */
export async function writeReport(args: {
  writer: PrivateWriter;
  dir: string;
  results: BenchmarkResults;
  outcomes: Outcome[];
  timings: TimedRun[];
}): Promise<string[]> {
  const { writer, dir } = args;
  return [
    await writer.write(dir, 'benchmark-results.json', JSON.stringify(args.results, null, 2) + '\n'),
    await writer.write(dir, 'leaderboard.md', renderLeaderboard(args.results)),
    await writer.write(dir, 'runs.json', JSON.stringify({ outcomes: args.outcomes, timings: args.timings }, null, 2) + '\n'),
  ];
}
