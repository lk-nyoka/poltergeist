/**
 * The shrinker (REQ-6) and the length-biased text arbitraries the Glitch uses.
 * Always `fc.check`, never `fc.assert`: a failed run is data here, not a thrown error.
 */
import fc from 'fast-check';

/**
 * Default `fc.string()` almost never makes long strings, so a "breaks above 41 code points" bug goes
 * unseen. This mix keeps short inputs and adds a long arm (design §7).
 */
export const textArb: fc.Arbitrary<string> = fc.oneof(
  fc.string({ unit: 'grapheme', maxLength: 30 }),
  fc.string({ unit: 'grapheme', maxLength: 300, size: 'max' }),
);

/** Boundary cases around contract C10: lengths 99/100/101, a control character, a lone surrogate. */
export const boundaryTextArb: fc.Arbitrary<string> = fc.constantFrom(
  '',
  'x'.repeat(99),
  'x'.repeat(100),
  'x'.repeat(101),
  '\u0007',
  'a\u0000b',
  '\uD800',
  'a\uDC00b',
);

/** What the Glitch feeds text fields: length-biased random text plus the boundary cases. */
export const glitchTextArb: fc.Arbitrary<string> = fc.oneof(
  { arbitrary: textArb, weight: 6 },
  { arbitrary: boundaryTextArb, weight: 1 },
);

export type ShrinkOptions = {
  /** Time limit in ms for the whole run, shrinking included. Omit for no limit. */
  budgetMs?: number;
  /** The fast-check seed (not the haunting seed). */
  seed: number;
  /** A counterexample path from an earlier run; with the same seed it reproduces that input. */
  path?: string;
  numRuns?: number;
};

export type ShrinkResult<T> =
  | {
      found: true;
      /** The shrunk failing input. */
      value: T;
      /** The first failing input fast-check hit, before any shrinking. */
      original: T;
      seed: number;
      path: string;
      numShrinks: number;
      interrupted: boolean;
    }
  | { found: false };

/**
 * Looks for an input where `holds` returns false, then shrinks it.
 * `failed: true` is a finding even when the time limit interrupted the shrinking; `failed: false`
 * is no finding, even when the run was interrupted (REQ-6.2).
 */
export async function shrink<T>(
  arb: fc.Arbitrary<T>,
  holds: (v: T) => Promise<boolean> | boolean,
  o: ShrinkOptions,
): Promise<ShrinkResult<T>> {
  let original: { v: T } | undefined;
  const d = await fc.check(
    fc.asyncProperty(arb, async (v) => {
      const ok = await holds(v);
      if (!ok && original === undefined) original = { v }; // fast-check tests the unshrunk failure first
      return ok;
    }),
    {
      seed: o.seed,
      ...(o.budgetMs !== undefined ? { interruptAfterTimeLimit: o.budgetMs } : {}),
      ...(o.path !== undefined ? { path: o.path } : {}),
      ...(o.numRuns !== undefined ? { numRuns: o.numRuns } : {}),
    },
  );
  // A run interrupted before its first test reports `failed: true` with no counterexample (measured
  // with fast-check 4.10.2). Nothing was tested, so that is no finding.
  if (!d.failed || d.counterexample === null) return { found: false };
  return {
    found: true,
    value: d.counterexample![0] as T,
    original: (original?.v ?? d.counterexample![0]) as T,
    seed: d.seed,
    path: d.counterexamplePath!,
    numShrinks: d.numShrinks,
    interrupted: d.interrupted,
  };
}
