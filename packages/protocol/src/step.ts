import { z } from 'zod';

/** How a driver finds an element. All given fields must match. */
export const LocatorSchema = z.object({
  role: z.string().optional(),
  name: z.string().optional(),
  css: z.string().optional(),
  testId: z.string().optional(),
});
export type Locator = z.infer<typeof LocatorSchema>;

export const StepKey = z.enum(['Tab', 'Shift+Tab', 'Enter', 'Escape']);
export type StepKey = z.infer<typeof StepKey>;

/** Timing fields carried by every step: the recorded gap and whether replay timing matters. */
const timing = {
  gapMs: z.number().int().min(0),
  timingSensitive: z.boolean().default(false),
};

/**
 * One recorded driver call (S04 design §3). Steps are session-independent: `freshSession` carries no
 * options, and any string field may hold the placeholders `{{intentId}}` or `{{orderId}}`.
 *
 * The timing fields are spread into each variant instead of using `.and(...)`, so the schema stays a
 * plain discriminated union and strips unknown keys on every variant.
 */
export const Step = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('freshSession'), ...timing }),
  z.object({ kind: z.literal('goto'), path: z.string(), ...timing }),
  z.object({
    kind: z.literal('click'),
    target: LocatorSchema,
    count: z.number().int().min(1).max(3).optional(),
    delayMs: z.number().int().min(0).optional(),
    ...timing,
  }),
  z.object({ kind: z.literal('type'), target: LocatorSchema, text: z.string(), ...timing }),
  z.object({ kind: z.literal('press'), key: StepKey, ...timing }),
  z.object({ kind: z.literal('back'), ...timing }),
  z.object({ kind: z.literal('reload'), ...timing }),
  z.object({
    kind: z.literal('request'),
    method: z.string(),
    path: z.string(),
    body: z.unknown().optional(),
    headers: z.record(z.string(), z.string()).optional(),
    ...timing,
  }),
  // Baseline traces (S05).
  z.object({ kind: z.literal('mcp'), tool: z.string(), args: z.record(z.string(), z.unknown()), ...timing }),
]);
export type Step = z.infer<typeof Step>;
