/**
 * The real RunSuite: runs the shop's contract suite once with PG_MUTANTS=<ids>, using Vitest's JSON reporter.
 * Vitest is started with this Node binary directly (no shell, so it works the same on Windows and Linux),
 * and its console output is discarded: mutant-check prints only its own summary line.
 */
import { spawn } from 'node:child_process';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { RunSuite, SuiteReport } from './core';

export function vitestRunner(shopDir: string): RunSuite {
  const require = createRequire(join(shopDir, 'package.json'));
  const vitestBin = join(dirname(require.resolve('vitest/package.json')), 'vitest.mjs');

  return async (mutantIds) => {
    const dir = await mkdtemp(join(tmpdir(), 'pg-mutant-check-'));
    const out = join(dir, 'report.json');
    try {
      await new Promise<void>((resolve) => {
        const child = spawn(
          process.execPath,
          [vitestBin, 'run', 'src/contract', '--reporter=json', `--outputFile=${out}`],
          {
            cwd: shopDir,
            env: { ...process.env, PG_MUTANTS: mutantIds.join(',') },
            stdio: 'ignore',
            windowsHide: true,
          },
        );
        // A failing suite exits non-zero; that is a result, not an error. We only need the report file.
        child.on('close', () => resolve());
        child.on('error', () => resolve());
      });
      return JSON.parse(await readFile(out, 'utf8')) as SuiteReport;
    } catch {
      return null; // no report: counted as undetected (or a failing clean suite)
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
