// @vitest-environment node
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

/**
 * Guards the tagging convention. `mutant-check` decides which rule a mutant broke from the [Cn] tags of the
 * FAILING tests, so an untagged, mis-tagged, skipped or session-less contract test makes a mutant undetectable.
 * This file is itself untagged and is excluded from the scan.
 */
const dir = fileURLToPath(new URL('.', import.meta.url));
const NOT_CONTRACT = new Set(['tags.test.ts', 'helpers.test.ts']);
const files = readdirSync(dir)
  .filter((f) => /\.test\.tsx?$/.test(f) && !NOT_CONTRACT.has(f))
  .sort();

const TITLE = /^[ \t]*(?:it|test)\s*\(\s*(['"`])((?:\\.|(?!\1)[^\\])*)\1/gm;
const TAG = /^\[C(1[0-2]|[1-9])\] \S/;

function titlesOf(file: string): string[] {
  const src = readFileSync(`${dir}${file}`, 'utf8');
  return [...src.matchAll(TITLE)].map((m) => m[2]!);
}

const all = files.flatMap((f) => titlesOf(f).map((title) => ({ file: f, title })));

describe('contract suite conventions', () => {
  it('finds the contract test files', () => {
    expect(files.length).toBeGreaterThanOrEqual(7);
    expect(all.length).toBeGreaterThan(40);
  });

  it('every contract test title starts with a rule tag [C1] to [C12]', () => {
    const untagged = all.filter((t) => !TAG.test(t.title)).map((t) => `${t.file}: ${t.title}`);
    expect(untagged).toEqual([]);
  });

  it('all twelve rules have at least four tests', () => {
    const counts = new Map<string, number>();
    for (const { title } of all) {
      const rule = /^\[(C\d+)\]/.exec(title)?.[1];
      if (rule) counts.set(rule, (counts.get(rule) ?? 0) + 1);
    }
    for (let n = 1; n <= 12; n++) expect(counts.get(`C${n}`) ?? 0, `C${n}`).toBeGreaterThanOrEqual(4);
  });

  it('no contract test is skipped, focused, todo or generated (a skipped test silently passes under every mutant)', () => {
    for (const f of files) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      expect(src, f).not.toMatch(/\b(?:it|test|describe)\s*\.\s*(?:only|skip|todo|each|fails|concurrent|runIf|skipIf)\b/);
    }
  });

  it('every contract file gets its sessions from contractSession()', () => {
    for (const f of files) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      expect(src, f).toMatch(/\bcontractSession\s*\(/);
      expect(src, f).toMatch(/from '\.\/helpers'/);
    }
  });

  it('no contract file builds its own session token or calls a route behind contractSession()', () => {
    for (const f of files) {
      const src = readFileSync(`${dir}${f}`, 'utf8');
      expect(src, f).not.toMatch(/\bsealToken\b|\bnewSession\b|@\/app\/api\//);
    }
  });

  it('every contract file resets the world between tests', () => {
    for (const f of files) {
      expect(readFileSync(`${dir}${f}`, 'utf8'), f).toMatch(/resetContractWorld/);
    }
  });
});
