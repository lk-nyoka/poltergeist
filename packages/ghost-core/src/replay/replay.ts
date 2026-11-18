/**
 * Replay, verify and kill check (REQ-4.3 to REQ-4.5).
 *
 * A replay opens a fresh session, resolves the `{{intentId}}` / `{{orderId}}` placeholders from that
 * session's own observer reads, runs every step with its recorded gap, then runs the oracles.
 * Only the oracles decide; nothing here looks at what the original run saw.
 */
import type { OracleName, PossessOptions, Step } from '@poltergeist/protocol';
import type { AxeViolation, Driver, PageEvent } from '../driver';
import type { ShopObserver } from '../observer';
import { observe, type ObserveContext, type ObserveOptions } from '../oracles/observe';
import { runOracles } from '../oracles';
import type { Observation, OracleHit } from '../oracles/types';
import { resolvePlaceholders, type KnownValues } from '../record/recorder';

export type ReplayDeps = { driver: Driver; observer: ShopObserver };

/**
 * `cloneOf` the haunting session (same mutant set), `clean` (no mutants), or an explicit mutant set
 * (`mutantIds`, benchmark and oracle-level mutant-check only; the shop needs BENCH_MODE=1 for it).
 */
export type ReplayBase = { cloneOf: string } | { clean: true } | { mutantIds: string[] };

export type ReplayOptions = {
  /** Keep only hits from this oracle (the finding's oracle). Omit to keep every oracle's hits. */
  oracle?: OracleName;
  /** Cap on each recorded gap, in ms. */
  gapCapMs?: number;
  sleep?: (ms: number) => Promise<void>;
  observe?: ObserveOptions;
  /**
   * Extra evidence only the ghost can gather, such as a dialog focus trace or submitted-vs-rendered
   * text. Called once after the last step. Money, privacy, script, crash and axe evidence need no hook.
   */
  collect?: (driver: Driver) => Promise<Partial<ObserveContext>>;
};

export type ReplayResult = {
  /** Token of the fresh session the steps ran in. */
  token: string;
  hits: OracleHit[];
  fired: boolean;
  /** Steps that could not run, for example because their target does not exist in this session. */
  stepErrors: { index: number; message: string }[];
  observation: Observation;
};

const realSleep = (ms: number) => (ms > 0 ? new Promise<void>((r) => setTimeout(r, ms)) : Promise.resolve());

async function runStep(driver: Driver, s: Step): Promise<void> {
  switch (s.kind) {
    case 'goto':
      return driver.goto(s.path);
    case 'click':
      return driver.click(s.target, {
        ...(s.count !== undefined ? { count: s.count } : {}),
        ...(s.delayMs !== undefined ? { delayMs: s.delayMs } : {}),
      });
    case 'type':
      return driver.type(s.target, s.text);
    case 'press':
      return driver.press(s.key);
    case 'back':
      return driver.back();
    case 'reload':
      return driver.reload();
    case 'request':
      await driver.request(s.method, s.path, s.body, s.headers);
      return;
    case 'freshSession':
    case 'mcp':
      throw new Error(`replay cannot run a '${s.kind}' step here`);
  }
}

export async function replay(
  steps: Step[],
  deps: ReplayDeps,
  base: ReplayBase,
  opts: ReplayOptions = {},
): Promise<ReplayResult> {
  const { driver, observer } = deps;
  const sleep = opts.sleep ?? realSleep;
  const scanAxe = opts.oracle === undefined || opts.oracle === 'A11yViolation';
  const events: PageEvent[] = [];
  const off = driver.onEvent((e) => events.push(e));
  const axe = new Map<string, AxeViolation>();
  const stepErrors: ReplayResult['stepErrors'] = [];
  let refreshed = false;

  try {
    const open = async () => driver.freshSession(base as PossessOptions);
    await open();
    for (const [i, step] of steps.entries()) {
      // The recorded freshSession carries no options; the replay's own base replaces it.
      if (step.kind === 'freshSession') {
        if (i > 0) await open();
        continue;
      }
      await sleep(Math.min(step.gapMs, opts.gapCapMs ?? Infinity));
      let resolved = step;
      if (JSON.stringify(step).includes('{{')) {
        const token = driver.sessionToken();
        const [intents, orders] = await Promise.all([observer.intents(token), observer.orders(token, { reads: false })]);
        const known: KnownValues = {};
        const intentId = intents[intents.length - 1]?.id;
        const orderId = orders.orders[orders.orders.length - 1]?.id;
        if (intentId) known.intentId = intentId;
        if (orderId) known.orderId = orderId;
        resolved = resolvePlaceholders(step, known);
      }
      try {
        await runStep(driver, resolved);
      } catch (e) {
        stepErrors.push({ index: i, message: e instanceof Error ? e.message : String(e) });
      }
      if (step.kind === 'back' || step.kind === 'reload') refreshed = true;
      if (scanAxe) {
        for (const v of await driver.axe()) axe.set(`${v.id}|${v.targets.join(',')}`, v);
      }
    }

    const extra = (await opts.collect?.(driver)) ?? {};
    const token = driver.sessionToken();
    const observation = await observe(
      observer,
      token,
      {
        events,
        refreshed,
        axe: [...axe.values(), ...(extra.axe ?? [])],
        focus: extra.focus ?? [],
        texts: extra.texts ?? [],
      },
      opts.observe,
    );
    const all = runOracles(observation);
    const hits = opts.oracle ? all.filter((h) => h.oracle === opts.oracle) : all;
    return { token, hits, fired: hits.length > 0, stepErrors, observation };
  } finally {
    off();
  }
}

/** The part of a Finding that replay needs. */
export type ReplayFinding = { oracle: OracleName; steps: Step[] };

export type VerifyOptions = Omit<ReplayOptions, 'oracle'> & {
  /** Token of the haunting session; each replay runs in a fresh `cloneOf` it. */
  base: string;
  /** Default 3 (REQ-4.4). */
  replays?: number;
};

export type VerifyResult = { verified: boolean; reproductionRate: number; fired: number; replays: number };

/** Replays `replays` times on `{cloneOf: base}`; verified when the finding's oracle fires at least once. */
export async function verify(finding: ReplayFinding, deps: ReplayDeps, opts: VerifyOptions): Promise<VerifyResult> {
  const replays = opts.replays ?? 3;
  if (!Number.isInteger(replays) || replays < 1) throw new Error('verify: replays must be a positive integer');
  let fired = 0;
  for (let i = 0; i < replays; i++) {
    const r = await replay(finding.steps, deps, { cloneOf: opts.base }, { ...opts, oracle: finding.oracle });
    if (r.fired) fired += 1;
  }
  return { verified: fired >= 1, reproductionRate: fired / replays, fired, replays };
}

export type CleanReplayResult = { fired: boolean; silent: boolean; result: ReplayResult };

/** Replays once on `{clean: true}`. If the oracle fires there, the mutant did not cause it, so it is not a kill. */
export async function cleanReplay(
  finding: ReplayFinding,
  deps: ReplayDeps,
  opts: Omit<VerifyOptions, 'base' | 'replays'> = {},
): Promise<CleanReplayResult> {
  const result = await replay(finding.steps, deps, { clean: true }, { ...opts, oracle: finding.oracle });
  return { fired: result.fired, silent: !result.fired, result };
}

export type KillCheckResult = VerifyResult & {
  /** True when the clean replay did not fire the oracle (REQ-4.5). */
  cleanSilent: boolean;
  /** `verified && cleanSilent`: what the scorer needs from replay before it checks the oracle→rule map. */
  passed: boolean;
};

/** verify() on the haunting session, then cleanReplay(). */
export async function killCheck(finding: ReplayFinding, deps: ReplayDeps, opts: VerifyOptions): Promise<KillCheckResult> {
  const v = await verify(finding, deps, opts);
  const rest: Partial<VerifyOptions> = { ...opts };
  delete rest.base;
  delete rest.replays;
  const clean = await cleanReplay(finding, deps, rest);
  return { ...v, cleanSilent: clean.silent, passed: v.verified && clean.silent };
}
