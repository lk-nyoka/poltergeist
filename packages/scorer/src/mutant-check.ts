/**
 * `pnpm --filter @poltergeist/scorer mutant-check`
 *
 * Reads bench/mutant-manifest.json AT RUNTIME (the builder never opens it) and prints exactly one line:
 *   - no manifest:  "no manifest yet" (exit 0)
 *   - otherwise:    "checked N · ok K · wrong-rule W · undetected U · clean-suite PASS|FAIL"
 *                   (exit 0 only when every entry is OK and the clean suite passes)
 * It never prints mutant ids, seams or per-entry rules.
 */
import { fileURLToPath } from 'node:url';
import { mutantCheck } from './mutant-check/core';
import { vitestRunner } from './mutant-check/vitest-runner';

const repoRoot = fileURLToPath(new URL('../../../', import.meta.url));

const code = await mutantCheck({
  manifestPath: `${repoRoot}bench/mutant-manifest.json`,
  runSuite: vitestRunner(`${repoRoot}apps/shop`),
  log: (line) => console.log(line),
});
process.exitCode = code;
