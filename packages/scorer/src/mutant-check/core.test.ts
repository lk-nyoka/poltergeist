import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  INVALID_MANIFEST,
  NO_MANIFEST,
  classify,
  cleanSuitePasses,
  failingContractTags,
  formatSummary,
  isContractFile,
  loadManifest,
  mutantCheck,
  ruleTag,
} from './core';
import { CLEAN_FILES, fakeRunner, makeReport, reportFailing } from './fake-runner';

/** The fixture manifest. The real bench/mutant-manifest.json is never read by these tests. */
const FIXTURE = fileURLToPath(new URL('../../test/fixtures/manifest.fixture.json', import.meta.url));

type Entry = { id: string; rule: string; seam: string; public: boolean };
let fixture: { version: 1; mutants: Entry[] };
let tmp: string;

beforeAll(async () => {
  fixture = JSON.parse(await readFile(FIXTURE, 'utf8'));
  tmp = await mkdtemp(join(tmpdir(), 'pg-scorer-test-'));
});
afterAll(async () => {
  await rm(tmp, { recursive: true, force: true });
});

/** Runs the whole program against the fixture with a fake runner; returns exit code, printed lines and runner calls. */
async function runFixture(byId: Parameters<typeof fakeRunner>[0], clean?: Parameters<typeof fakeRunner>[1], manifestPath = FIXTURE) {
  const { run, calls } = fakeRunner(byId, clean);
  const lines: string[] = [];
  const code = await mutantCheck({ manifestPath, runSuite: run, log: (l) => lines.push(l) });
  return { code, lines, calls };
}

/** A report in which the given entry is killed exactly by its own rule. */
const killedBy = (rule: string) => {
  const title = Object.values(CLEAN_FILES).flat().find(([t]) => t.startsWith(`[${rule}] `))?.[0];
  if (!title) throw new Error(`fixture has no clean test for ${rule}`);
  return reportFailing([title]);
};

describe('which failures count', () => {
  it('a contract file is under src/contract/, with either path separator', () => {
    expect(isContractFile('/repo/apps/shop/src/contract/c1-c2-payments.test.ts')).toBe(true);
    expect(isContractFile('C:\\repo\\apps\\shop\\src\\contract\\c9-dialog-focus.test.tsx')).toBe(true);
    expect(isContractFile('src/contract/c5-c6-pricing.test.ts')).toBe(true);
  });

  it('tags.test.ts, helpers.test.ts and files outside src/contract/ never count', () => {
    expect(isContractFile('/repo/apps/shop/src/contract/tags.test.ts')).toBe(false);
    expect(isContractFile('C:\\repo\\apps\\shop\\src\\contract\\helpers.test.ts')).toBe(false);
    expect(isContractFile('/repo/apps/shop/src/components/a11y.test.tsx')).toBe(false);
    expect(isContractFile('/repo/apps/shop/src/domain/cart.test.ts')).toBe(false);
    expect(isContractFile('/repo/apps/shop/src/contractor/c1.test.ts')).toBe(false);
  });

  it('reads the rule tag at the start of a title, [C1] to [C12] only', () => {
    expect(ruleTag('[C1] one debit')).toBe('C1');
    expect(ruleTag('[C9] Escape closes')).toBe('C9');
    expect(ruleTag('[C10] round-trips')).toBe('C10');
    expect(ruleTag('[C12] no 5xx')).toBe('C12');
    for (const t of ['[C0] x', '[C13] x', '[C1]x', 'x [C1] y', 'C1 x', '[c1] x', '']) expect(ruleTag(t), t).toBeNull();
  });

  it('collects only FAILING, TAGGED tests in contract files', () => {
    const report = makeReport({
      ...CLEAN_FILES,
      '/repo/apps/shop/src/contract/c3-c4-cart.test.ts': [['[C3] qty refused', 'failed'], ['[C4] one coupon', 'passed'], ['untagged helper case', 'failed']],
      '/repo/apps/shop/src/contract/tags.test.ts': [['[C7] looks tagged but is the guard file', 'failed']],
      '/repo/apps/shop/src/contract/helpers.test.ts': [['[C5] also excluded', 'failed']],
      '/repo/apps/shop/src/domain/cart.test.ts': [['[C11] outside the contract folder', 'failed']],
      '/repo/apps/shop/src/contract/c10-text.test.ts': [['[C10] skipped', 'skipped']],
    });
    expect([...failingContractTags(report)]).toEqual(['C3']);
  });
});

describe('verdict for one entry', () => {
  it('ok: something failed and every failing tag is the entry rule', () => {
    expect(classify('C3', reportFailing(['[C3] qty refused']))).toBe('ok');
    expect(classify('C1', reportFailing(['[C1] one debit']))).toBe('ok');
  });

  it('wrong-rule: at least one failing tag belongs to another rule', () => {
    expect(classify('C3', reportFailing(['[C3] qty refused', '[C12] no 5xx']))).toBe('wrong-rule');
    expect(classify('C4', reportFailing(['[C3] qty refused']))).toBe('wrong-rule');
  });

  it('undetected: no tagged contract test failed, or there was no report', () => {
    expect(classify('C8', makeReport(CLEAN_FILES))).toBe('undetected');
    expect(classify('C8', null)).toBe('undetected');
    const onlyExcluded = makeReport({
      ...CLEAN_FILES,
      '/repo/apps/shop/src/contract/tags.test.ts': [['every contract test title starts with a rule tag', 'failed']],
      '/repo/apps/shop/src/components/a11y.test.tsx': [['[C8] outside contract', 'failed']],
    });
    expect(classify('C8', onlyExcluded)).toBe('undetected');
  });
});

describe('the clean suite', () => {
  it('passes when everything passed and contract tests ran', () => {
    expect(cleanSuitePasses(makeReport(CLEAN_FILES))).toBe(true);
  });

  it('fails on any failing test anywhere, including the plumbing files', () => {
    expect(cleanSuitePasses(reportFailing(['[C4] one coupon']))).toBe(false);
    expect(cleanSuitePasses(reportFailing(['every contract test title starts with a rule tag']))).toBe(false);
  });

  it('fails when there was no report, when a file failed to load, or when no contract test ran', () => {
    expect(cleanSuitePasses(null)).toBe(false);
    const loadError = makeReport(CLEAN_FILES);
    loadError.testResults.push({ name: '/repo/apps/shop/src/contract/c7-render-text.test.tsx', status: 'failed', assertionResults: [] });
    expect(cleanSuitePasses(loadError)).toBe(false);
    expect(cleanSuitePasses(makeReport({ '/repo/apps/shop/src/contract/tags.test.ts': [['guard', 'passed']] }))).toBe(false);
    expect(cleanSuitePasses(makeReport({}))).toBe(false);
  });
});

describe('loading the manifest', () => {
  it('reads and validates the fixture', async () => {
    const loaded = await loadManifest(FIXTURE);
    expect(loaded.kind).toBe('ok');
    if (loaded.kind === 'ok') expect(loaded.manifest.mutants).toHaveLength(fixture.mutants.length);
  });

  it('a missing file is "missing"', async () => {
    expect(await loadManifest(join(tmp, 'does-not-exist.json'))).toEqual({ kind: 'missing' });
  });

  it('broken JSON, a schema violation or duplicate ids are "invalid"', async () => {
    const write = async (name: string, text: string) => {
      const p = join(tmp, name);
      await writeFile(p, text);
      return p;
    };
    expect((await loadManifest(await write('broken.json', '{not json'))).kind).toBe('invalid');
    expect((await loadManifest(await write('v2.json', JSON.stringify({ version: 2, mutants: [] })))).kind).toBe('invalid');
    const badRule = { version: 1, mutants: [{ id: 'a', rule: 'C13', seam: 's/x', public: false }] };
    expect((await loadManifest(await write('rule.json', JSON.stringify(badRule)))).kind).toBe('invalid');
    const dup = { version: 1, mutants: [fixture.mutants[0], fixture.mutants[0]] };
    expect((await loadManifest(await write('dup.json', JSON.stringify(dup)))).kind).toBe('invalid');
  });
});

describe('mutant-check (fixture manifest, fake runner)', () => {
  it('no manifest: prints "no manifest yet", exits 0 and runs nothing', async () => {
    const { code, lines, calls } = await runFixture({}, undefined, join(tmp, 'absent.json'));
    expect(code).toBe(0);
    expect(lines).toEqual([NO_MANIFEST]);
    expect(calls).toEqual([]);
  });

  it('invalid manifest: prints only "manifest invalid", exits 1 and runs nothing', async () => {
    const p = join(tmp, 'invalid-for-cli.json');
    await writeFile(p, '{"version":1,"mutants":[{"id":"x"}]}');
    const { code, lines, calls } = await runFixture({}, undefined, p);
    expect(code).toBe(1);
    expect(lines).toEqual([INVALID_MANIFEST]);
    expect(calls).toEqual([]);
  });

  it('runs the clean suite once, then each entry once with only that mutant active', async () => {
    const { calls } = await runFixture({});
    expect(calls[0]).toEqual([]);
    expect(calls.slice(1)).toEqual(fixture.mutants.map((m) => [m.id]));
  });

  it('every entry killed by its own rule and a green clean suite: exit 0', async () => {
    const byId = Object.fromEntries(fixture.mutants.map((m) => [m.id, killedBy(m.rule)]));
    const { code, lines } = await runFixture(byId);
    expect(lines).toEqual([`checked 6 · ok 6 · wrong-rule 0 · undetected 0 · clean-suite PASS`]);
    expect(code).toBe(0);
  });

  it('counts wrong-rule and undetected entries, and exits 1', async () => {
    const [a, b, c, d, e, f] = fixture.mutants as [Entry, Entry, Entry, Entry, Entry, Entry];
    const byId = {
      [a.id]: killedBy(a.rule), // ok
      [b.id]: reportFailing(['[C3] qty refused', '[C12] no 5xx']), // wrong-rule: C3 entry also fails C12
      [c.id]: reportFailing(['[C3] qty refused']), // wrong-rule: C4 entry fails only C3
      [d.id]: makeReport(CLEAN_FILES), // undetected: nothing fails
      [e.id]: null, // undetected: no report
      [f.id]: killedBy(f.rule), // ok
    };
    const { code, lines } = await runFixture(byId);
    expect(lines).toEqual([`checked 6 · ok 2 · wrong-rule 2 · undetected 2 · clean-suite PASS`]);
    expect(code).toBe(1);
  });

  it('a red clean suite fails the check even when every entry is ok', async () => {
    const byId = Object.fromEntries(fixture.mutants.map((m) => [m.id, killedBy(m.rule)]));
    const { code, lines } = await runFixture(byId, reportFailing(['[C10] round-trips']));
    expect(lines).toEqual([`checked 6 · ok 6 · wrong-rule 0 · undetected 0 · clean-suite FAIL`]);
    expect(code).toBe(1);
  });

  it('an empty manifest checks nothing and passes on a green clean suite', async () => {
    const p = join(tmp, 'empty.json');
    await writeFile(p, JSON.stringify({ version: 1, mutants: [] }));
    const { code, lines } = await runFixture({}, undefined, p);
    expect(lines).toEqual([`checked 0 · ok 0 · wrong-rule 0 · undetected 0 · clean-suite PASS`]);
    expect(code).toBe(0);
  });

  it('prints exactly one line, with no ids, seams or rule names in it', async () => {
    const [a, b] = fixture.mutants as [Entry, Entry];
    const { lines } = await runFixture({ [a.id]: killedBy(a.rule), [b.id]: reportFailing(['[C1] one debit']) });
    expect(lines).toHaveLength(1);
    const line = lines[0]!;
    for (const m of fixture.mutants) {
      expect(line).not.toContain(m.id);
      expect(line).not.toContain(m.seam);
    }
    expect(line).not.toMatch(/\bC(?:1[0-2]|[1-9])\b/);
    expect(line).toMatch(/^checked \d+ · ok \d+ · wrong-rule \d+ · undetected \d+ · clean-suite (PASS|FAIL)$/);
  });

  it('formatSummary has the exact documented shape', () => {
    expect(formatSummary({ checked: 40, ok: 38, wrongRule: 1, undetected: 1, cleanSuite: false })).toBe(
      'checked 40 · ok 38 · wrong-rule 1 · undetected 1 · clean-suite FAIL',
    );
  });
});
