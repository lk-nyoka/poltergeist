import { z } from 'zod';
import { OracleName, Rule } from './oracles';
import { Step } from './step';

/**
 * What an oracle saw (S04 review-driven additions R9). The shape is frozen here so death
 * certificates (S11) need no schema change. Screenshot and trace handles are placeholders until the
 * PlaywrightDriver (S05) captures them.
 */
export const Evidence = z.object({
  /** The oracle's own numbers, element or token. */
  details: z.record(z.string(), z.unknown()),
  screenshot: z.string().nullable(),
  trace: z.string().nullable(),
  console: z.array(z.string()),
  network: z.array(z.object({ method: z.string(), path: z.string(), status: z.number().int() })),
  http5xx: z.array(z.string()),
});
export type Evidence = z.infer<typeof Evidence>;

export const Finding = z.object({
  title: z.string(),
  rule: Rule,
  oracle: OracleName,
  /** One line on who is hurt. */
  harm: z.string(),
  evidence: Evidence,
  /** The reproduction recipe. */
  steps: z.array(Step),
  /** The haunting seed. */
  seed: z.number().int(),
});
export type Finding = z.infer<typeof Finding>;
