import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import type { MutantManifest } from '@poltergeist/protocol';
import { checkRules, classify, formatSummary, passes } from './core';
import { CLEAN_FILES, fakeRunner, makeReport, reportFailing } from './fake-runner';

const RULES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12'] as const;
type Rule = (typeof RULES)[number];

/** A contract file with one passing test per rule, so any set of rules can be switched to failing. */
const ALL_RULES_FILE = '/repo/apps/shop/src/contract/all-rules.test.ts';
const titleFor = (r: Rule) => `[${r}] behaves`;
const baseFiles = { ...CLEAN_FILES, [ALL_RULES_FILE]: RULES.map((r) => [titleFor(r), 'passed'] as [string, 'passed']) };

/** What a mutant run produces: no report, or a set of failing rules (possibly empty). */
const outcomeArb = fc.oneof(
  { weight: 1, arbitrary: fc.constant(null) },
  { weight: 6, arbitrary: fc.subarray([...RULES]) },
);

const entriesArb = fc.uniqueArray(
  fc.record({
    id: fc.string({ unit: fc.constantFrom(...'0123456789abcdef'), minLength: 8, maxLength: 16 }),
    rule: fc.constantFrom(...RULES),
    outcome: outcomeArb,
  }),
  { selector: (e) => e.id, maxLength: 12 },
);

function reportFor(failing: Rule[] | null) {
  if (failing === null) return null;
  return reportFailing(failing.map(titleFor), { [ALL_RULES_FILE]: RULES.map((r) => [titleFor(r), failing.includes(r) ? 'failed' : 'passed']) });
}

describe('mutant-check rule-level logic (property)', () => {
  it('counts add up, each verdict follows the definition, and the exit decision matches', async () => {
    await fc.assert(
      fc.asyncProperty(entriesArb, fc.boolean(), async (entries, cleanGreen) => {
        const manifest: MutantManifest = {
          version: 1,
          mutants: entries.map((e) => ({ id: e.id, rule: e.rule, seam: 'x/y', public: false })),
        };
        const byId = Object.fromEntries(entries.map((e) => [e.id, reportFor(e.outcome)]));
        const clean = cleanGreen ? makeReport(baseFiles) : reportFailing(['[C1] one debit']);
        const { run, calls } = fakeRunner(byId, clean);

        const s = await checkRules(manifest, run);

        // every entry is run exactly once, alone, after one clean run
        expect(calls).toEqual([[], ...entries.map((e) => [e.id])]);
        expect(s.checked).toBe(entries.length);
        expect(s.ok + s.wrongRule + s.undetected).toBe(s.checked);

        // independent restatement of the definition
        let ok = 0;
        let wrong = 0;
        let undetected = 0;
        for (const e of entries) {
          if (e.outcome === null || e.outcome.length === 0) undetected++;
          else if (e.outcome.every((r) => r === e.rule)) ok++;
          else wrong++;
          expect(classify(e.rule, reportFor(e.outcome))).toBe(
            e.outcome === null || e.outcome.length === 0 ? 'undetected' : e.outcome.every((r) => r === e.rule) ? 'ok' : 'wrong-rule',
          );
        }
        expect([s.ok, s.wrongRule, s.undetected]).toEqual([ok, wrong, undetected]);
        expect(s.cleanSuite).toBe(cleanGreen);
        expect(passes(s)).toBe(cleanGreen && ok === entries.length);

        // the printed line never names a mutant
        const line = formatSummary(s);
        for (const e of entries) expect(line).not.toContain(e.id);
      }),
    );
  });
});
