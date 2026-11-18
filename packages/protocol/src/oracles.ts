import { z } from 'zod';

/** The 12 contract rules (brief Appendix B). */
export const RULES = ['C1', 'C2', 'C3', 'C4', 'C5', 'C6', 'C7', 'C8', 'C9', 'C10', 'C11', 'C12'] as const;
export const Rule = z.enum(RULES);
export type Rule = z.infer<typeof Rule>;

/** The 10 oracles (brief §7.1). */
export const ORACLE_NAMES = [
  'DoubleCharge',
  'StateLoss',
  'TillLoss',
  'QuantityBreach',
  'PrivacyLeak',
  'ScriptExecution',
  'TextCorruption',
  'A11yViolation',
  'FocusFailure',
  'Crash',
] as const;
export const OracleName = z.enum(ORACLE_NAMES);
export type OracleName = z.infer<typeof OracleName>;

/**
 * Oracle → rule map (brief §7.1a): for each rule, the oracles that may kill its mutants.
 * Frozen so no caller can change how kills are decided. `oracles.test.ts` pins it to docs/brief.md.
 */
export const ORACLE_RULES: Readonly<Record<Rule, readonly OracleName[]>> = Object.freeze({
  C1: Object.freeze(['DoubleCharge'] as const),
  C2: Object.freeze(['StateLoss', 'DoubleCharge'] as const),
  C3: Object.freeze(['QuantityBreach', 'TillLoss'] as const),
  C4: Object.freeze(['TillLoss'] as const),
  C5: Object.freeze(['TillLoss'] as const),
  C6: Object.freeze(['TillLoss'] as const),
  C7: Object.freeze(['ScriptExecution'] as const),
  C8: Object.freeze(['A11yViolation'] as const),
  C9: Object.freeze(['FocusFailure'] as const),
  C10: Object.freeze(['TextCorruption', 'Crash'] as const),
  C11: Object.freeze(['PrivacyLeak'] as const),
  C12: Object.freeze(['Crash'] as const),
});
