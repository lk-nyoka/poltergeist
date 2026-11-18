import { describe, expect, it } from 'vitest';
import { RULES, Step } from '@poltergeist/protocol';
import { FakeDriver, fakeObserver, type Driver, type ElementInfo } from '@poltergeist/ghost-core';
import { checkOracles } from './core';
import { RECIPES, recipeFor } from './recipes';
import { buildCollect, recipeRunner } from './playwright-runner';

describe('RECIPES', () => {
  it('has a recipe for every contract rule', () => {
    expect(Object.keys(RECIPES).sort()).toEqual([...RULES].sort());
  });

  it.each(RULES)('%s: every step is a valid Step and the recipe starts with a fresh session', (rule) => {
    const { steps } = recipeFor(rule);
    expect(steps.length).toBeGreaterThan(1);
    expect(steps[0]!.kind).toBe('freshSession');
    for (const s of steps) expect(Step.safeParse(s).success, JSON.stringify(s)).toBe(true);
    // The replayer cannot run these two kinds.
    expect(steps.slice(1).some((s) => s.kind === 'freshSession' || s.kind === 'mcp')).toBe(false);
  });

  it('uses only the placeholders the replayer fills', () => {
    for (const rule of RULES) {
      const found = JSON.stringify(RECIPES[rule].steps).match(/\{\{[^}]*\}\}/g) ?? [];
      for (const f of found) expect(['{{intentId}}', '{{orderId}}']).toContain(f);
    }
  });

  it('presses are 20 to 150 ms apart for the double-pay recipe, never 0 ms', () => {
    const pays = RECIPES.C1.steps.filter((s) => s.kind === 'request' && s.path === '/api/checkout');
    expect(pays).toHaveLength(3);
    for (const p of pays) expect(p.gapMs).toBeGreaterThanOrEqual(20);
    for (const p of pays) expect(p.gapMs).toBeLessThanOrEqual(150);
  });

  it('beacon payloads only call the beacon with a token', () => {
    const typed = RECIPES.C7.steps.flatMap((s) => (s.kind === 'type' ? [s.text] : []));
    expect(typed).toHaveLength(3);
    for (const text of typed) {
      expect(text).toMatch(/__poltergeistBeacon\('pg-c7-[a-z]+'\)/);
      expect(text).not.toMatch(/cookie|localStorage|sessionStorage|fetch|XMLHttpRequest/i);
    }
  });

  it('contains no mutant ids or seam names', () => {
    const all = JSON.stringify(RECIPES);
    expect(all).not.toMatch(/f1x[0-9a-f]+/);
    expect(all).not.toMatch(/[a-z]+\/[A-Za-z]+Seam|checkout\/claim/);
  });
});

/** A driver that only answers query(), enough to test the collect hook. */
function queryDriver(rows: Record<string, ElementInfo[]>): Driver {
  return { query: async (sel: string) => rows[sel] ?? [] } as unknown as Driver;
}
const el = (text: string): ElementInfo => ({ role: 'listitem', name: text, text, box: { x: 0, y: 0, width: 1, height: 1 }, focusable: false });

describe('buildCollect', () => {
  it('is absent when the recipe needs no extra evidence', () => {
    expect(buildCollect(undefined)).toBeUndefined();
  });

  it('reads the latest matching element back as the rendered text', async () => {
    const collect = buildCollect({ texts: [{ field: 'review', submitted: 'abc', selector: 'li' }] })!;
    const out = await collect(queryDriver({ li: [el('older'), el('abc ')] }));
    expect(out.texts).toEqual([{ field: 'review', submitted: 'abc', rendered: 'abc ' }]);
  });

  it('reports null when nothing was rendered, so the oracle stays silent', async () => {
    const collect = buildCollect({ texts: [{ field: 'review', submitted: 'abc', selector: 'li' }] })!;
    expect((await collect(queryDriver({}))).texts).toEqual([{ field: 'review', submitted: 'abc', rendered: null }]);
  });
});

describe('recipeRunner glue (FakeDriver and FakeShop, not the real shop)', () => {
  it('replays a recipe on {mutantIds} and on {clean} and reports the oracles that fired', async () => {
    const driver = new FakeDriver({ seed: 1 });
    const run = recipeRunner(driver, fakeObserver(driver.shop));
    expect([...((await run('C8', { mutantIds: ['dropAlt'] })) ?? [])]).toContain('A11yViolation');
    expect((await run('C8', { clean: true }))?.size).toBe(0);
  });

  it('feeds the oracle-level check end to end with a fixture manifest', async () => {
    const driver = new FakeDriver({ seed: 1 });
    const run = recipeRunner(driver, fakeObserver(driver.shop));
    const manifest = { version: 1 as const, mutants: [{ id: 'dropAlt', rule: 'C8' as const, seam: 'render/ProductImage', public: true }] };
    expect(await checkOracles(manifest, run)).toEqual({ checked: 1, ok: 1, wrongRule: 0, undetected: 0, cleanSuite: true });
  });
});

