/**
 * The real RunRecipe: replays a rule's recipe through the PlaywrightDriver against a LOCAL Haunted Shop
 * (BENCH_MODE=1, BENCH_SECRET for `{mutantIds}` sessions). Never exercised by unit tests; they use a fake.
 */
import {
  PlaywrightDriver,
  assertOwnership,
  httpObserver,
  httpPossess,
} from '@poltergeist/driver-playwright';
import {
  replay,
  traceDialogFocus,
  type ObserveContext,
  type ReplayBase,
  type ShopObserver,
} from '@poltergeist/ghost-core';
import type { Driver } from '@poltergeist/ghost-core';
import type { OracleName } from '@poltergeist/protocol';
import type { RunRecipe } from './core';
import { RECIPES, type CollectSpec } from './recipes';

export type RecipeRunnerConfig = {
  baseUrl: string;
  serverSecret: string;
  benchSecret: string;
};

/** Turns a recipe's collect spec into replay's `collect` hook. */
export function buildCollect(spec: CollectSpec | undefined): ((d: Driver) => Promise<Partial<ObserveContext>>) | undefined {
  if (!spec) return undefined;
  return async (d) => {
    const out: Partial<ObserveContext> = {};
    if (spec.texts) {
      out.texts = [];
      for (const x of spec.texts) {
        const els = await d.query(x.selector);
        const rendered = els.length === 0 ? null : els[els.length - 1]!.text;
        out.texts.push({ field: x.field, submitted: x.submitted, rendered });
      }
    }
    if (spec.dialogFocus) {
      const name = spec.dialogFocus.openerName;
      const trace = await traceDialogFocus(d, { open: () => d.click({ role: 'button', name }), opener: name });
      out.focus = trace ? [trace] : [];
    }
    return out;
  };
}

/** Replays one recipe with a given driver and observer. Split out so it can be tested with FakeDriver. */
export function recipeRunner(driver: Driver, observer: ShopObserver): RunRecipe {
  return async (rule, possession) => {
    const recipe = RECIPES[rule];
    const collect = buildCollect(recipe.collect);
    const r = await replay(recipe.steps, { driver, observer }, possession as ReplayBase, collect ? { collect } : {});
    return new Set<OracleName>(r.hits.map((h) => h.oracle));
  };
}

export async function openRecipeRunner(cfg: RecipeRunnerConfig): Promise<{ run: RunRecipe; close(): Promise<void> }> {
  const ownership = await assertOwnership(cfg.baseUrl, '');
  if (!ownership.allowed || ownership.method !== 'loopback') {
    throw new Error('the oracle-level check only runs against a local (loopback) shop');
  }
  const driver = await PlaywrightDriver.launch({
    baseUrl: cfg.baseUrl,
    kind: 'shop',
    ownership,
    possess: httpPossess({ baseUrl: cfg.baseUrl, serverSecret: cfg.serverSecret, benchSecret: cfg.benchSecret }),
  });
  return { run: recipeRunner(driver, httpObserver({ baseUrl: cfg.baseUrl, serverSecret: cfg.serverSecret })), close: () => driver.close() };
}
