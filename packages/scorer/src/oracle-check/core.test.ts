import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import { MutantManifest, ORACLE_NAMES, ORACLE_RULES, type OracleName, type PossessOptions, type Rule } from '@poltergeist/protocol';
import { readFileSync } from 'node:fs';
import { checkOracles, classifyOracles, oracleMutantCheck, type RunRecipe } from './core';
import { formatSummary } from '../mutant-check/core';

const FIXTURE = fileURLToPath(new URL('../../test/fixtures/manifest.fixture.json', import.meta.url));
const manifest = MutantManifest.parse(JSON.parse(readFileSync(FIXTURE, 'utf8')));
const set = (...o: OracleName[]) => new Set<OracleName>(o);

/** A fake replay: the mutant session fires `byId[id]`; the clean session fires `clean[rule]` (default nothing). */
function fakeRun(byId: Record<string, ReadonlySet<OracleName> | null | 'throw'>, clean: Partial<Record<Rule, ReadonlySet<OracleName>>> = {}) {
  const calls: { rule: Rule; possession: PossessOptions }[] = [];
  const run: RunRecipe = async (rule, possession) => {
    calls.push({ rule, possession });
    if ('clean' in possession) return clean[rule] ?? set();
    if (!('mutantIds' in possession)) throw new Error('unexpected possession');
    const r = byId[possession.mutantIds[0]!];
    if (r === 'throw') throw new Error('browser died');
    return r === undefined ? set() : r;
  };
  return { run, calls };
}

/** The first mapped oracle of each fixture rule: what a healthy detection looks like. */
const mappedFor = (rule: Rule) => set(ORACLE_RULES[rule][0]!);
const healthy = Object.fromEntries(manifest.mutants.map((m) => [m.id, mappedFor(m.rule)]));

describe('classifyOracles', () => {
  it('ok: a mapped oracle fires on the mutant and nothing mapped fires on clean', () => {
    expect(classifyOracles('C1', set('DoubleCharge'), set())).toBe('ok');
  });
  it('ok even if an unrelated oracle also fires on the mutant', () => {
    expect(classifyOracles('C1', set('DoubleCharge', 'Crash'), set())).toBe('ok');
  });
  it('wrong-rule: only an unmapped oracle fires on the mutant', () => {
    expect(classifyOracles('C1', set('A11yViolation'), set())).toBe('wrong-rule');
  });
  it('undetected: nothing fires, or the run failed', () => {
    expect(classifyOracles('C1', set(), set())).toBe('undetected');
    expect(classifyOracles('C1', null, set())).toBe('undetected');
  });
  it('undetected: the mapped oracle also fires on clean (a false alarm is not a detection)', () => {
    expect(classifyOracles('C1', set('DoubleCharge'), set('DoubleCharge'))).toBe('undetected');
  });
  it('an unmapped oracle firing on clean does not void a detection (the clean-suite flag reports it)', () => {
    expect(classifyOracles('C1', set('DoubleCharge'), set('Crash'))).toBe('ok');
  });
  it('undetected when the clean replay failed, since the detection cannot be confirmed', () => {
    expect(classifyOracles('C1', set('DoubleCharge'), null)).toBe('undetected');
  });
  it.each(Object.entries(ORACLE_RULES))('every oracle mapped to %s counts as ok', (rule, oracles) => {
    for (const o of oracles) expect(classifyOracles(rule as Rule, set(o), set())).toBe('ok');
  });
  it('an oracle that no rule maps never produces ok', () => {
    for (const o of ORACLE_NAMES) {
      for (const [rule, mapped] of Object.entries(ORACLE_RULES)) {
        expect(classifyOracles(rule as Rule, set(o), set()) === 'ok').toBe((mapped as readonly string[]).includes(o));
      }
    }
  });
});

describe('checkOracles with the fixture manifest', () => {
  it('all entries detected by a mapped oracle, silent clean: everything ok and the clean suite passes', async () => {
    const { run } = fakeRun(healthy);
    expect(await checkOracles(manifest, run)).toEqual({ checked: 6, ok: 6, wrongRule: 0, undetected: 0, cleanSuite: true });
  });

  it('counts wrong-rule and undetected entries separately', async () => {
    const ids = manifest.mutants.map((m) => m.id);
    const { run } = fakeRun({ ...healthy, [ids[1]!]: set('A11yViolation'), [ids[2]!]: set(), [ids[4]!]: null });
    const s = await checkOracles(manifest, run);
    expect(s).toMatchObject({ checked: 6, ok: 3, wrongRule: 1, undetected: 2, cleanSuite: true });
  });

  it('replays each entry on {mutantIds:[id]} and each rule once on {clean:true}', async () => {
    const { run, calls } = fakeRun(healthy);
    await checkOracles(manifest, run);
    const mutantCalls = calls.filter((c) => 'mutantIds' in c.possession);
    expect(mutantCalls.map((c) => (c.possession as { mutantIds: string[] }).mutantIds)).toEqual(manifest.mutants.map((m) => [m.id]));
    const cleanRules = calls.filter((c) => 'clean' in c.possession).map((c) => c.rule);
    expect(cleanRules.sort()).toEqual([...new Set(manifest.mutants.map((m) => m.rule))].sort());
    for (const c of mutantCalls) {
      const entry = manifest.mutants.find((m) => m.id === (c.possession as { mutantIds: string[] }).mutantIds[0])!;
      expect(c.rule).toBe(entry.rule);
    }
  });

  it('any oracle firing on a clean replay fails the clean suite', async () => {
    const { run } = fakeRun(healthy, { C8: set('Crash') });
    const s = await checkOracles(manifest, run);
    expect(s.cleanSuite).toBe(false);
    expect(s.ok).toBe(6); // the unmapped oracle does not void the C8 detection
  });

  it('a mapped oracle on a clean replay fails the suite and its rule entries are not ok', async () => {
    const { run } = fakeRun(healthy, { C3: set('QuantityBreach') });
    const s = await checkOracles(manifest, run);
    expect(s).toMatchObject({ cleanSuite: false, ok: 5, undetected: 1 });
  });

  it('a clean replay that failed fails the clean suite', async () => {
    const run: RunRecipe = async (rule, possession) => ('clean' in possession && rule === 'C1' ? null : mappedFor(rule));
    expect((await checkOracles(manifest, run)).cleanSuite).toBe(false);
  });

  it('a replay that throws is an undetected entry, never a crash', async () => {
    const { run } = fakeRun({ ...healthy, [manifest.mutants[0]!.id]: 'throw' });
    const s = await checkOracles(manifest, run);
    expect(s).toMatchObject({ checked: 6, ok: 5, undetected: 1 });
  });

  it('an empty manifest checks nothing', async () => {
    const { run } = fakeRun({});
    expect(await checkOracles({ version: 1, mutants: [] }, run)).toEqual({ checked: 0, ok: 0, wrongRule: 0, undetected: 0, cleanSuite: true });
  });
});

describe('oracleMutantCheck program', () => {
  it('prints exactly one counts-only line, with no ids, seams or rules, and exits 0 when green', async () => {
    const log = vi.fn();
    const { run } = fakeRun(healthy);
    const code = await oracleMutantCheck({ manifestPath: FIXTURE, run, log });
    expect(code).toBe(0);
    expect(log).toHaveBeenCalledTimes(1);
    const line = log.mock.calls[0]![0] as string;
    expect(line).toBe('checked 6 · ok 6 · wrong-rule 0 · undetected 0 · clean-suite PASS');
    expect(line).not.toMatch(/f1x|C\d|\//);
  });

  it('exits non-zero when anything is not ok', async () => {
    const log = vi.fn();
    const { run } = fakeRun({ ...healthy, [manifest.mutants[3]!.id]: set() });
    expect(await oracleMutantCheck({ manifestPath: FIXTURE, run, log })).toBe(1);
    expect(log.mock.calls[0]![0]).toBe(formatSummary({ checked: 6, ok: 5, wrongRule: 0, undetected: 1, cleanSuite: true }));
  });

  it('reports a missing manifest and does not run anything', async () => {
    const log = vi.fn();
    const run = vi.fn();
    expect(await oracleMutantCheck({ manifestPath: `${FIXTURE}.nope`, run, log })).toBe(0);
    expect(log).toHaveBeenCalledWith('no manifest yet');
    expect(run).not.toHaveBeenCalled();
  });

  it('reports an invalid manifest without echoing its content', async () => {
    const log = vi.fn();
    const code = await oracleMutantCheck({ manifestPath: fileURLToPath(new URL('./core.test.ts', import.meta.url)), run: vi.fn(), log });
    expect(code).toBe(1);
    expect(log).toHaveBeenCalledWith('manifest invalid');
  });
});
