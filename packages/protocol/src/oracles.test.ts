import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { ORACLE_NAMES, ORACLE_RULES, RULES } from './oracles';

const brief = readFileSync(fileURLToPath(new URL('../../../docs/brief.md', import.meta.url)), 'utf8');

/** Rows of the table that follows `heading`, as arrays of trimmed cells. */
function tableAfter(heading: string): string[][] {
  const start = brief.indexOf(heading);
  expect(start).toBeGreaterThan(-1);
  const rows: string[][] = [];
  for (const line of brief.slice(start).split(/\r?\n/).slice(1)) {
    if (line.startsWith('|')) {
      rows.push(line.split('|').slice(1, -1).map((c) => c.trim()));
    } else if (rows.length > 0) {
      break;
    }
  }
  return rows.filter((r) => !/^-+$/.test(r[0] ?? '') && r[0] !== 'Rule' && r[0] !== 'Oracle');
}

describe('ORACLE_RULES', () => {
  it('matches the §7.1a table in docs/brief.md exactly', () => {
    const rows = tableAfter('### 7.1a');
    const fromBrief = Object.fromEntries(
      rows.map((r) => [r[0]!.split(' ')[0]!, r[1]!.split(',').map((s) => s.trim())]),
    );
    expect(Object.keys(fromBrief)).toEqual([...RULES]);
    expect(fromBrief).toEqual(ORACLE_RULES);
  });

  it('names exactly the 10 oracles of §7.1', () => {
    const fromBrief = tableAfter('### 7.1 Oracles').map((r) => r[0]!.replaceAll('`', ''));
    expect(fromBrief).toEqual([...ORACLE_NAMES]);
  });

  it('gives every rule an oracle and uses only known oracle names', () => {
    for (const rule of RULES) {
      expect(ORACLE_RULES[rule].length).toBeGreaterThan(0);
      for (const o of ORACLE_RULES[rule]) expect(ORACLE_NAMES).toContain(o);
    }
  });

  it('is deeply frozen', () => {
    expect(Object.isFrozen(ORACLE_RULES)).toBe(true);
    for (const rule of RULES) expect(Object.isFrozen(ORACLE_RULES[rule])).toBe(true);
    expect(() => {
      (ORACLE_RULES as Record<string, unknown>)['C1'] = [];
    }).toThrow();
    expect(() => {
      (ORACLE_RULES.C1 as string[]).push('Crash');
    }).toThrow();
  });
});
