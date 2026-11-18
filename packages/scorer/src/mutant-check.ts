/**
 * `pnpm --filter @poltergeist/scorer mutant-check [--oracles | --all]`
 *
 * Reads bench/mutant-manifest.json AT RUNTIME (the builder never opens it) and prints one line per level:
 *   - no manifest:  "no manifest yet" (exit 0)
 *   - otherwise:    "checked N · ok K · wrong-rule W · undetected U · clean-suite PASS|FAIL"
 *                   (exit 0 only when every entry is OK and the clean suite passes)
 * It never prints mutant ids, seams or per-entry rules.
 *
 *   (no flag)   rule level: the shop's contract suite under each mutant (Vitest).
 *   --oracles   oracle level: each rule's recipe replayed through the PlaywrightDriver against a local
 *               shop (BENCH_MODE=1; needs SEANCE_SERVER_SECRET and BENCH_SECRET; SHOP_URL defaults to
 *               http://127.0.0.1:3000).
 *   --all       both, rule level first.
 */
import { fileURLToPath } from 'node:url';
import { mutantCheck } from './mutant-check/core';
import { oracleMutantCheck } from './oracle-check/core';
import { openRecipeRunner } from './oracle-check/playwright-runner';
import { vitestRunner } from './mutant-check/vitest-runner';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));
const manifestPath = `${repoRoot}bench/mutant-manifest.json`;
const log = (line: string) => console.log(line);
const flags = new Set(process.argv.slice(2));
const wantRule = flags.has('--all') || !flags.has('--oracles');
const wantOracles = flags.has('--all') || flags.has('--oracles');

let code = 0;
if (wantRule) {
  code = await mutantCheck({ manifestPath, runSuite: vitestRunner(`${repoRoot}apps/shop`), log });
}
if (wantOracles) {
  const serverSecret = process.env['SEANCE_SERVER_SECRET'];
  const benchSecret = process.env['BENCH_SECRET'];
  if (!serverSecret || !benchSecret) {
    log('oracle-level check needs SEANCE_SERVER_SECRET and BENCH_SECRET');
    code = 1;
  } else {
    const runner = await openRecipeRunner({
      baseUrl: process.env['SHOP_URL'] ?? 'http://127.0.0.1:3000',
      serverSecret,
      benchSecret,
    });
    try {
      code = Math.max(code, await oracleMutantCheck({ manifestPath, run: runner.run, log }));
    } finally {
      await runner.close();
    }
  }
}
process.exitCode = code;
