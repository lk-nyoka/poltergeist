import type { OracleName } from '@poltergeist/protocol';

export type Severity = 'Critical' | 'High' | 'Medium' | 'Low';

/**
 * Severity by what the harm costs a person. Money moved wrongly, strangers' data exposed and
 * attacker script running are Critical; a broken page or altered text is High; an app a keyboard or
 * screen-reader user cannot operate is Medium.
 */
export const SEVERITY: Readonly<Record<OracleName, Severity>> = Object.freeze({
  DoubleCharge: 'Critical',
  TillLoss: 'Critical',
  QuantityBreach: 'Critical',
  PrivacyLeak: 'Critical',
  ScriptExecution: 'Critical',
  StateLoss: 'High',
  Crash: 'High',
  TextCorruption: 'High',
  A11yViolation: 'Medium',
  FocusFailure: 'Medium',
});
