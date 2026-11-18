/**
 * Oracles for a target that is not the Haunted Shop. Money and privacy oracles need the shop's own
 * ledgers, so they are never constructed here: only the DOM/HTTP ones are.
 */
import { ORACLES, type Observation, type Oracle, type OracleHit } from '@poltergeist/ghost-core';
import type { OracleName } from '@poltergeist/protocol';

export const SITE_ORACLE_NAMES = [
  'A11yViolation',
  'FocusFailure',
  'Crash',
  'TextCorruption',
  'ScriptExecution',
] as const satisfies readonly OracleName[];

export const SHOP_ONLY_ORACLE_NAMES = ['DoubleCharge', 'StateLoss', 'TillLoss', 'QuantityBreach', 'PrivacyLeak'] as const;

export type TargetKind = 'shop' | 'site';

/** Oracles that read a request's outcome; an HTTP 429 makes them inconclusive (as in ghost-core). */
const REQUEST_DRIVEN: ReadonlySet<string> = new Set(['Crash', 'TextCorruption']);

/** The oracle set for a target kind. For `site` it is built from the five DOM/HTTP names only. */
export function oraclesFor(kind: TargetKind): { name: OracleName; run: Oracle }[] {
  const names: readonly OracleName[] = kind === 'shop' ? (Object.keys(ORACLES) as OracleName[]) : SITE_ORACLE_NAMES;
  return names.map((name) => ({ name, run: ORACLES[name] }));
}

/** An Observation with no shop data, for targets that have no ShopObserver. */
export function siteObservation(parts: Partial<Pick<Observation, 'events' | 'axe' | 'focus' | 'texts'>>): Observation {
  return {
    ledgers: { customer: [], till: [], customerStart: 0, tillStart: 0 },
    orders: [],
    reads: [],
    intents: [],
    clean: { prices: {}, coupons: {} },
    events: parts.events ?? [],
    axe: parts.axe ?? [],
    focus: parts.focus ?? [],
    texts: parts.texts ?? [],
    refreshChecks: [],
  };
}

/** Runs only the site oracles over an observation. */
export function runSiteOracles(obs: Observation): OracleHit[] {
  const rateLimited = obs.events.some((e) => e.kind === 'http429');
  return oraclesFor('site').flatMap(({ name, run }) => (rateLimited && REQUEST_DRIVEN.has(name) ? [] : run(obs)));
}
