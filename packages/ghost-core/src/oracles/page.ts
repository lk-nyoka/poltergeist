/** Page-level oracles: PrivacyLeak, ScriptExecution, TextCorruption, A11yViolation, FocusFailure, Crash. */
import { isContractText } from '../contract';
import type { Oracle, OracleHit } from './types';

export const STRANGER_ORDER = 'stranger-order-fixed';

/** `order_reads` shows the session under observation read the stranger's order. */
export const PrivacyLeak: Oracle = (obs) =>
  obs.reads
    .filter((r) => r.orderId === STRANGER_ORDER)
    .slice(0, 1)
    .map(() => ({
      oracle: 'PrivacyLeak' as const,
      rule: 'C11' as const,
      title: "Another customer's order was readable",
      harm: "A stranger's name and address were shown to someone who never placed that order.",
      evidence: { orderId: STRANGER_ORDER, reads: obs.reads.filter((r) => r.orderId === STRANGER_ORDER).length },
    }));

/** A beacon token from an injected payload called `window.__poltergeistBeacon`. */
export const ScriptExecution: Oracle = (obs) => {
  const tokens = [...new Set(obs.events.filter((e) => e.kind === 'beacon').map((e) => e.detail))];
  return tokens.map((token) => ({
    oracle: 'ScriptExecution' as const,
    rule: 'C7' as const,
    title: 'Text typed into the shop ran as a script',
    harm: 'Anything a visitor types could run code in other visitors\u2019 browsers.',
    evidence: { token },
  }));
};

/** A contract-valid text comes back different from what was submitted. */
export const TextCorruption: Oracle = (obs) =>
  obs.texts
    .filter((t) => t.rendered !== null && isContractText(t.submitted) && t.rendered !== t.submitted)
    .map((t) => ({
      oracle: 'TextCorruption' as const,
      rule: 'C10' as const,
      title: 'Text came back changed',
      harm: `The printed receipt shows a ${t.field} that is not what the customer typed.`,
      evidence: { field: t.field, submitted: t.submitted, rendered: t.rendered },
    }));

/** The axe-core rules that make an interface unusable for a screen-reader user (brief §7.1). */
export const A11Y_RULE_IDS = [
  'button-name',
  'image-alt',
  'svg-img-alt',
  'input-image-alt',
  'label',
  'select-name',
  'link-name',
  'aria-command-name',
  'aria-input-field-name',
] as const;

export const A11yViolation: Oracle = (obs) =>
  obs.axe
    .filter((v) => (A11Y_RULE_IDS as readonly string[]).includes(v.id))
    .map((v) => ({
      oracle: 'A11yViolation' as const,
      rule: 'C8' as const,
      title: 'Controls with no accessible name',
      harm: `A screen-reader user hears nothing useful for ${v.targets.length} element(s) (${v.id}).`,
      evidence: { ruleId: v.id, impact: v.impact, targets: v.targets },
    }));

/** With a dialog open: focus escapes, no close control is reachable, or focus is not returned. */
export const FocusFailure: Oracle = (obs) => {
  const hits: OracleHit[] = [];
  for (const t of obs.focus) {
    const harm = (what: string) => `A keyboard user ${what}.`;
    const escaped = t.sequence.filter((s) => !s.inDialog);
    if (escaped.length > 0) {
      hits.push({
        oracle: 'FocusFailure',
        rule: 'C9',
        title: 'Keyboard focus left the open dialog',
        harm: harm('tabs out of the dialog into the page behind it'),
        evidence: { shape: 'escaped', opener: t.opener, escapedTo: escaped.map((s) => s.label) },
      });
    }
    if (!t.sequence.some((s) => s.isClose) && !t.escapeCloses) {
      hits.push({
        oracle: 'FocusFailure',
        rule: 'C9',
        title: 'The dialog cannot be closed from the keyboard',
        harm: harm('is trapped in a dialog with no reachable close control'),
        evidence: { shape: 'no-close', opener: t.opener, stops: t.sequence.map((s) => s.label) },
      });
    }
    if (t.closed && t.returnedTo !== t.opener) {
      hits.push({
        oracle: 'FocusFailure',
        rule: 'C9',
        title: 'Focus was not returned after the dialog closed',
        harm: harm('loses their place on the page after closing a dialog'),
        evidence: { shape: 'not-returned', opener: t.opener, returnedTo: t.returnedTo },
      });
    }
  }
  return hits;
};

/** A page error, an error boundary rendering, or an HTTP 5xx. */
export const Crash: Oracle = (obs) => {
  const seen = new Set<string>();
  const hits: OracleHit[] = [];
  for (const e of obs.events) {
    if (e.kind !== 'pageerror' && e.kind !== 'errorBoundary' && e.kind !== 'http5xx') continue;
    const key = `${e.kind}:${e.detail}`;
    if (seen.has(key)) continue;
    seen.add(key);
    hits.push({
      oracle: 'Crash',
      rule: 'C12',
      title: e.kind === 'http5xx' ? 'The shop answered with a server error' : 'The page crashed',
      harm: 'A customer sees a broken page instead of a friendly message.',
      evidence: { kind: e.kind, detail: e.detail },
    });
  }
  return hits;
};
