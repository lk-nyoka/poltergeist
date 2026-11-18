/**
 * `pnpm bench:run --mutants all|<n> --seeds 1,2,3 [--budget 60]`
 *
 * Runs Poltergeist's deterministic side (no LLM) against a LOCAL production build of the shop
 * (`next build`, then `next start` with BENCH_MODE=1). Needs SEANCE_SERVER_SECRET and BENCH_SECRET;
 * SHOP_URL defaults to http://127.0.0.1:3000. Reads the manifest through the hash-checked reader.
 *
 * stdout: `Cn killed/tested` per rule and the overall rate. Nothing else. Per-(mutant,seed) detail goes
 * to bench/.private/runs/<timestamp>/ only.
 */
import { parseArgs } from 'node:util';
import { GHOSTS, GHOST_IDS, investigate } from '@poltergeist/cli';
import { PlaywrightDriver, assertOwnership, httpObserver, httpPossess } from '@poltergeist/driver-playwright';
import { readManifest } from './manifest';
import { BenchArgError, formatStdout, parseMutantsArg, parseSeeds, runBenchmark, selectMutants, toFindingResults } from './bench/runner';
import { DEFAULT_PRIVATE_ROOT, privateWriter } from './bench/private-dir';
import { buildResults, buildToolResults, writeReport } from './report';
import { join } from 'node:path';

const fail = (msg: string): never => {
  console.error(msg);
  process.exit(2);
};

let args;
try {
  args = parseArgs({ options: { mutants: { type: 'string' }, seeds: { type: 'string' }, budget: { type: 'string' } } }).values;
} catch (e) {
  fail(`error: ${e instanceof Error ? e.message : String(e)}`);
}
const serverSecret = process.env['SEANCE_SERVER_SECRET'];
const benchSecret = process.env['BENCH_SECRET'];
if (!serverSecret || !benchSecret) fail('error: SEANCE_SERVER_SECRET and BENCH_SECRET must be set');
if (args!.mutants === undefined || args!.seeds === undefined) fail('usage: bench:run --mutants all|<n> --seeds <list> [--budget <secs>]');

let mutantsArg: 'all' | number;
let seeds: number[];
let budget = 60;
try {
  mutantsArg = parseMutantsArg(args!.mutants!);
  seeds = parseSeeds(args!.seeds!);
  if (args!.budget !== undefined) {
    if (!/^\d+$/.test(args!.budget) || Number(args!.budget) < 1) throw new BenchArgError('--budget must be a positive integer');
    budget = Number(args!.budget);
  }
} catch (e) {
  if (e instanceof BenchArgError) fail(`error: ${e.message}`);
  throw e;
}

const baseUrl = process.env['SHOP_URL'] ?? 'http://127.0.0.1:3000';
const ownership = await assertOwnership(baseUrl, '');
if (!ownership.allowed || ownership.method !== 'loopback') fail('error: the benchmark only runs against a local (loopback) shop');

const manifest = readManifest(); // refuses unless the committed hash matches
const mutants = selectMutants(manifest, mutantsArg!);
if (mutants.length === 0) fail('error: the manifest has no benchmark mutants');

const driver = await PlaywrightDriver.launch({
  baseUrl,
  kind: 'shop',
  ownership,
  possess: httpPossess({ baseUrl, serverSecret: serverSecret!, benchSecret: benchSecret! }),
});
const observer = httpObserver({ baseUrl, serverSecret: serverSecret! });
const launched = { driver, observer, close: () => driver.close() };

try {
  const run = await runBenchmark({
    manifest,
    mutants,
    seeds: seeds!,
    runOne: async (mutantId, seed) => {
      await driver.freshSession({ mutantIds: [mutantId] });
      const inv = await investigate({
        launched,
        kind: 'shop',
        seed,
        ghostIds: [...GHOST_IDS],
        budgetSeconds: budget,
        arrival: '/',
        ghosts: GHOSTS,
        log: () => {},
      });
      return {
        findings: toFindingResults(inv.results.map((r) => ({ oracle: r.finding.oracle, verified: r.verified, cleanSilent: r.cleanSilent }))),
      };
    },
  });

  const generatedAt = new Date().toISOString();
  const results = buildResults({ poltergeist: buildToolResults({ tool: 'Poltergeist', outcomes: run.outcomes, timings: run.timings }), generatedAt });
  const dir = join(DEFAULT_PRIVATE_ROOT, 'runs', generatedAt.replace(/[:.]/g, '-'));
  await writeReport({ writer: privateWriter(), dir, results, outcomes: run.outcomes, timings: run.timings });

  for (const line of formatStdout(run.outcomes)) console.log(line);
} finally {
  await driver.close();
}
