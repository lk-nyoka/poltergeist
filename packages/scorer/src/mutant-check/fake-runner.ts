/**
 * Test-only: builds Vitest-shaped JSON reports and a fake RunSuite, so the rule-level logic is tested
 * without running anything. Never imported by the real mutant-check.
 */
import type { FileResult, RunSuite, SuiteReport } from './core';

type Row = [title: string, status: 'passed' | 'failed' | 'skipped'];

/** A healthy clean run: one passing tagged test per rule, plus the passing plumbing files. */
export const CLEAN_FILES: Record<string, Row[]> = {
  'C:\\repo\\apps\\shop\\src\\contract\\c1-c2-payments.test.ts': [['[C1] one debit', 'passed'], ['[C2] order persists', 'passed']],
  '/repo/apps/shop/src/contract/c3-c4-cart.test.ts': [['[C3] qty refused', 'passed'], ['[C4] one coupon', 'passed']],
  '/repo/apps/shop/src/contract/c8-accessibility.test.tsx': [['[C8] alt text', 'passed']],
  '/repo/apps/shop/src/contract/c10-text.test.ts': [['[C10] round-trips', 'passed']],
  '/repo/apps/shop/src/contract/c11-c12-access.test.ts': [['[C12] no 5xx', 'passed']],
  '/repo/apps/shop/src/contract/tags.test.ts': [['every contract test title starts with a rule tag', 'passed']],
  '/repo/apps/shop/src/contract/helpers.test.ts': [['seals the PG_MUTANTS ids into the session token', 'passed']],
};

export function makeReport(files: Record<string, Row[]>): SuiteReport {
  const testResults: FileResult[] = Object.entries(files).map(([name, rows]) => ({
    name,
    status: rows.some(([, s]) => s === 'failed') ? 'failed' : 'passed',
    assertionResults: rows.map(([title, status]) => ({ title, status })),
  }));
  const all = testResults.flatMap((f) => f.assertionResults);
  const numFailedTests = all.filter((t) => t.status === 'failed').length;
  return {
    success: numFailedTests === 0,
    numTotalTests: all.length,
    numFailedTests,
    numFailedTestSuites: testResults.filter((f) => f.status === 'failed').length,
    testResults,
  };
}

/** The clean files, with the given tests switched to failing (and optional extra files merged in). */
export function reportFailing(failTitles: string[], extra: Record<string, Row[]> = {}): SuiteReport {
  const files: Record<string, Row[]> = {};
  for (const [name, rows] of Object.entries(CLEAN_FILES)) {
    files[name] = rows.map(([title, status]) => [title, failTitles.includes(title) ? 'failed' : status]);
  }
  return makeReport({ ...files, ...extra });
}

/** A fake RunSuite: `[]` gets `clean`; a single id gets `byId[id]` (missing id = nothing fails). Records every call. */
export function fakeRunner(byId: Record<string, SuiteReport | null>, clean: SuiteReport | null = makeReport(CLEAN_FILES)) {
  const calls: string[][] = [];
  const run: RunSuite = async (ids) => {
    calls.push([...ids]);
    if (ids.length === 0) return clean;
    const key = ids.join(',');
    return key in byId ? byId[key]! : makeReport(CLEAN_FILES);
  };
  return { run, calls };
}
