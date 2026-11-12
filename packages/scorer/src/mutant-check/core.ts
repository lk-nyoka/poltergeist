/**
 * mutant-check, rule level (brief §13.3, S02 design §16).
 *
 * For each manifest entry, the shop's contract suite runs with only that mutant active. The entry is OK iff
 * at least one [Cn]-tagged contract test fails and every failing tag is the entry's own rule. The suite must
 * also be all green with no mutant active.
 *
 * This module is pure: the test run is injected (`RunSuite`), so it is unit-tested with a fake runner and a
 * fixture manifest. It never reports ids, seams or per-entry rules: only the aggregate counts.
 */
import { readFile } from 'node:fs/promises';
import { MutantManifest } from '@poltergeist/protocol';

// ─── the slice of Vitest's JSON reporter output that we read ──────────────────

export type AssertionResult = { title: string; status: string };
export type FileResult = { name: string; status?: string; assertionResults: AssertionResult[] };
export type SuiteReport = {
  success?: boolean;
  numTotalTests: number;
  numFailedTests: number;
  numFailedTestSuites?: number;
  testResults: FileResult[];
};

/** Runs the shop contract suite with exactly these mutant ids active. `null` = the run produced no report. */
export type RunSuite = (mutantIds: readonly string[]) => Promise<SuiteReport | null>;

// ─── which failures count ─────────────────────────────────────────────────────

const RULE_TAG = /^\[(C(?:1[0-2]|[1-9]))\] /;
/** Untagged plumbing tests in src/contract/: they pass under every mutant by design and never count. */
const NOT_CONTRACT = new Set(['tags.test.ts', 'helpers.test.ts']);

const posix = (p: string) => p.replace(/\\/g, '/');

/** True for a contract test file: under src/contract/ and not one of the plumbing files. */
export function isContractFile(path: string): boolean {
  const p = posix(path);
  if (!/(^|\/)src\/contract\//.test(p)) return false;
  const base = p.slice(p.lastIndexOf('/') + 1);
  return !NOT_CONTRACT.has(base);
}

/** The rule tag of a test title, e.g. "[C4] a second coupon ..." → "C4"; untagged → null. */
export function ruleTag(title: string): string | null {
  return RULE_TAG.exec(title)?.[1] ?? null;
}

/** The distinct [Cn] tags of FAILING, tagged tests in contract files. */
export function failingContractTags(report: SuiteReport): Set<string> {
  const tags = new Set<string>();
  for (const file of report.testResults) {
    if (!isContractFile(file.name)) continue;
    for (const t of file.assertionResults) {
      if (t.status !== 'failed') continue;
      const tag = ruleTag(t.title);
      if (tag) tags.add(tag);
    }
  }
  return tags;
}

/** Number of tagged contract tests that passed. Used to make sure the clean run really ran the contract suite. */
export function passedContractTests(report: SuiteReport): number {
  let n = 0;
  for (const file of report.testResults) {
    if (!isContractFile(file.name)) continue;
    for (const t of file.assertionResults) if (t.status === 'passed' && ruleTag(t.title)) n++;
  }
  return n;
}

// ─── verdicts ─────────────────────────────────────────────────────────────────

export type Verdict = 'ok' | 'wrong-rule' | 'undetected';

/**
 * - undetected: no tagged contract test failed (or the run produced no report).
 * - wrong-rule: something failed, but at least one failing tag is not the entry's rule.
 * - ok: something failed, and every failing tag is the entry's rule.
 */
export function classify(rule: string, report: SuiteReport | null): Verdict {
  if (!report) return 'undetected';
  const tags = failingContractTags(report);
  if (tags.size === 0) return 'undetected';
  for (const t of tags) if (t !== rule) return 'wrong-rule';
  return 'ok';
}

/** The clean suite passes iff it ran, nothing failed anywhere, and contract tests actually ran and passed. */
export function cleanSuitePasses(report: SuiteReport | null): boolean {
  if (!report) return false;
  if (report.success === false) return false;
  if (report.numFailedTests !== 0 || (report.numFailedTestSuites ?? 0) !== 0) return false;
  if (report.testResults.some((f) => f.status === 'failed')) return false;
  return passedContractTests(report) > 0;
}

// ─── the manifest ─────────────────────────────────────────────────────────────

export type ManifestLoad =
  | { kind: 'missing' }
  | { kind: 'invalid' }
  | { kind: 'ok'; manifest: MutantManifest };

export async function loadManifest(path: string): Promise<ManifestLoad> {
  let text: string;
  try {
    text = await readFile(path, 'utf8');
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === 'ENOENT') return { kind: 'missing' };
    return { kind: 'invalid' };
  }
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return { kind: 'invalid' };
  }
  const parsed = MutantManifest.safeParse(json);
  if (!parsed.success) return { kind: 'invalid' };
  const ids = parsed.data.mutants.map((m) => m.id);
  if (new Set(ids).size !== ids.length) return { kind: 'invalid' }; // duplicate ids would make counts meaningless
  return { kind: 'ok', manifest: parsed.data };
}

// ─── the run ──────────────────────────────────────────────────────────────────

export type Summary = { checked: number; ok: number; wrongRule: number; undetected: number; cleanSuite: boolean };

export async function checkRules(manifest: MutantManifest, runSuite: RunSuite): Promise<Summary> {
  const clean = await runSuite([]);
  const summary: Summary = { checked: 0, ok: 0, wrongRule: 0, undetected: 0, cleanSuite: cleanSuitePasses(clean) };
  for (const entry of manifest.mutants) {
    const verdict = classify(entry.rule, await runSuite([entry.id]));
    summary.checked++;
    if (verdict === 'ok') summary.ok++;
    else if (verdict === 'wrong-rule') summary.wrongRule++;
    else summary.undetected++;
  }
  return summary;
}

/** The ONE line mutant-check prints. Counts only: never ids, seams or per-entry rules. */
export function formatSummary(s: Summary): string {
  return `checked ${s.checked} · ok ${s.ok} · wrong-rule ${s.wrongRule} · undetected ${s.undetected} · clean-suite ${s.cleanSuite ? 'PASS' : 'FAIL'}`;
}

export const passes = (s: Summary) => s.cleanSuite && s.ok === s.checked;

export const NO_MANIFEST = 'no manifest yet';
export const INVALID_MANIFEST = 'manifest invalid';

/** Whole program, with every effect injected. Returns the exit code. */
export async function mutantCheck(deps: {
  manifestPath: string;
  runSuite: RunSuite;
  log: (line: string) => void;
}): Promise<number> {
  const loaded = await loadManifest(deps.manifestPath);
  if (loaded.kind === 'missing') {
    deps.log(NO_MANIFEST);
    return 0;
  }
  if (loaded.kind === 'invalid') {
    deps.log(INVALID_MANIFEST); // no details: zod messages could echo ids or seams
    return 1;
  }
  const summary = await checkRules(loaded.manifest, deps.runSuite);
  deps.log(formatSummary(summary));
  return passes(summary) ? 0 : 1;
}
