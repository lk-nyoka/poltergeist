import { Finding, type OracleName, type Step } from '@poltergeist/protocol';
import type { PageEvent } from '../driver';
import { DoubleCharge, QuantityBreach, StateLoss, TillLoss } from './money';
import { A11yViolation, Crash, FocusFailure, PrivacyLeak, ScriptExecution, TextCorruption } from './page';
import type { Observation, Oracle, OracleHit } from './types';

export type { FocusTrace, Observation, Oracle, OracleHit, TextCheck } from './types';
export { observe, type ObserveContext, type ObserveOptions } from './observe';
export { traceDialogFocus } from './focus-trace';
export { referenceTotal } from './reference';
export { DoubleCharge, StateLoss, TillLoss, QuantityBreach, PrivacyLeak, ScriptExecution, TextCorruption, A11yViolation, FocusFailure, Crash };
export { A11Y_RULE_IDS } from './page';

export const ORACLES: Readonly<Record<OracleName, Oracle>> = Object.freeze({
  DoubleCharge,
  StateLoss,
  TillLoss,
  QuantityBreach,
  PrivacyLeak,
  ScriptExecution,
  TextCorruption,
  A11yViolation,
  FocusFailure,
  Crash,
});

/** Oracles whose evidence comes from requests the shop answered. A 429 makes them inconclusive. */
const REQUEST_DRIVEN: ReadonlySet<OracleName> = new Set([
  'DoubleCharge',
  'StateLoss',
  'TillLoss',
  'QuantityBreach',
  'PrivacyLeak',
  'TextCorruption',
  'Crash',
]);

/** Runs every oracle over the observation. An HTTP 429 in the window silences the request-driven ones (REQ-3.3). */
export function runOracles(obs: Observation): OracleHit[] {
  const rateLimited = obs.events.some((e) => e.kind === 'http429');
  return (Object.keys(ORACLES) as OracleName[]).flatMap((name) =>
    rateLimited && REQUEST_DRIVEN.has(name) ? [] : ORACLES[name](obs),
  );
}

const STATUS_LINE = /^(\d{3}) ([A-Z]+) (\S+)/;

function network(events: PageEvent[]): { method: string; path: string; status: number }[] {
  return events.flatMap((e) => {
    if (e.kind === 'http5xx') {
      const m = STATUS_LINE.exec(e.detail);
      return m ? [{ status: Number(m[1]), method: m[2]!, path: m[3]! }] : [];
    }
    return [];
  });
}

/** Turns hits into structured Findings carrying the recipe (`steps`) and the haunting `seed`. */
export function buildFindings(obs: Observation, ctx: { steps: Step[]; seed: number }): Finding[] {
  const consoleLines = obs.events.filter((e) => e.kind === 'pageerror' || e.kind === 'errorBoundary').map((e) => e.detail);
  const http5xx = obs.events.filter((e) => e.kind === 'http5xx').map((e) => e.detail);
  return runOracles(obs).map((h) =>
    Finding.parse({
      title: h.title,
      rule: h.rule,
      oracle: h.oracle,
      harm: h.harm,
      evidence: {
        details: h.evidence,
        screenshot: null, // placeholder until the PlaywrightDriver (S05) captures one
        trace: null,
        console: consoleLines,
        network: network(obs.events),
        http5xx,
      },
      steps: ctx.steps,
      seed: ctx.seed,
    }),
  );
}
