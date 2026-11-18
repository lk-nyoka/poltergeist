import { ORACLE_RULES, RULES, type MutantManifest, type OracleName, type Rule } from '@poltergeist/protocol';

/** One finding of one run, as the benchmark runner reports it after replay. */
export type FindingResult = {
  oracle: OracleName;
  /** The oracle fired again on at least one replay on `{cloneOf}`. */
  verified: boolean;
  /** The oracle stayed silent on the `{clean: true}` replay. */
  killCheck: boolean;
};

/** One haunting of one mutant under one haunting seed. A run with no findings is still a tested run. */
export type RunResult = { mutantId: string; seed: number; findings: FindingResult[] };

/** The three facts recorded per (mutant, seed) (R10). */
export type Outcome = {
  mutantId: string;
  seed: number;
  rule: Rule;
  /** A mapped oracle fired at all. */
  detected: boolean;
  /** A mapped oracle's finding was verified on replay. */
  verified: boolean;
  /** A verified, mapped finding whose clean replay was silent. */
  killed: boolean;
};

const mapped = (rule: Rule, oracle: OracleName): boolean => (ORACLE_RULES[rule] as readonly OracleName[]).includes(oracle);

/** Kill = verified AND oracle mapped to the mutant's rule (§7.1a) AND clean replay silent. */
export function isKill(rule: Rule, f: FindingResult): boolean {
  return f.verified && mapped(rule, f.oracle) && f.killCheck;
}

export type OutcomeOptions = {
  /** Demo mutants (`public: true`) are excluded from the benchmark unless this is set. */
  includePublic?: boolean;
};

/**
 * Decides detected / verified / killed per (mutant, seed). Runs repeated for the same pair are
 * merged. A run for a mutant missing from the manifest is an error, not something to skip.
 */
export function decideOutcomes(results: RunResult[], manifest: MutantManifest, opts: OutcomeOptions = {}): Outcome[] {
  const byId = new Map(manifest.mutants.map((m) => [m.id, m]));
  const merged = new Map<string, { mutantId: string; seed: number; findings: FindingResult[] }>();
  for (const r of results) {
    const m = byId.get(r.mutantId);
    if (!m) throw new Error(`run for a mutant that is not in the manifest: ${r.mutantId}`);
    if (m.public && !opts.includePublic) continue;
    const key = `${r.mutantId}:${r.seed}`;
    const cur = merged.get(key) ?? { mutantId: r.mutantId, seed: r.seed, findings: [] };
    cur.findings.push(...r.findings);
    merged.set(key, cur);
  }
  return [...merged.values()].map((r) => {
    const rule = byId.get(r.mutantId)!.rule;
    const own = r.findings.filter((f) => mapped(rule, f.oracle));
    return {
      mutantId: r.mutantId,
      seed: r.seed,
      rule,
      detected: own.length > 0,
      verified: own.some((f) => f.verified),
      killed: r.findings.some((f) => isKill(rule, f)),
    };
  });
}

/** Kills ÷ mutants tested, for one haunting seed. 0 when nothing was tested under that seed. */
export function killRate(outcomes: Outcome[], seed: number): number {
  const tested = outcomes.filter((o) => o.seed === seed);
  return tested.length === 0 ? 0 : tested.filter((o) => o.killed).length / tested.length;
}

export type SeedSummary = { seed: number; tested: number; detected: number; verified: number; killed: number; rate: number };

export type Summary = {
  perSeed: SeedSummary[];
  /** Mean of the per-seed kill rates (the standard mutation score, averaged over seeds). */
  seedMean: number;
  min: number;
  max: number;
  /** Per rule, counted over (mutant, seed) runs. */
  perRule: Record<Rule, { tested: number; detected: number; killed: number }>;
  /** Mutants tested but never killed under any seed. */
  survivors: string[];
  /** (mutant, seed) pairs a mapped oracle detected but that were not killed (R10). */
  detectedNotKilled: string[];
};

export function summarise(outcomes: Outcome[]): Summary {
  const seeds = [...new Set(outcomes.map((o) => o.seed))].sort((a, b) => a - b);
  const perSeed = seeds.map((seed) => {
    const of = outcomes.filter((o) => o.seed === seed);
    return {
      seed,
      tested: of.length,
      detected: of.filter((o) => o.detected).length,
      verified: of.filter((o) => o.verified).length,
      killed: of.filter((o) => o.killed).length,
      rate: killRate(outcomes, seed),
    };
  });
  const rates = perSeed.map((s) => s.rate);
  const perRule = Object.fromEntries(
    RULES.map((rule) => {
      const of = outcomes.filter((o) => o.rule === rule);
      return [rule, { tested: of.length, detected: of.filter((o) => o.detected).length, killed: of.filter((o) => o.killed).length }];
    }),
  ) as Summary['perRule'];
  const killedIds = new Set(outcomes.filter((o) => o.killed).map((o) => o.mutantId));
  return {
    perSeed,
    seedMean: rates.length === 0 ? 0 : rates.reduce((a, b) => a + b, 0) / rates.length,
    min: rates.length === 0 ? 0 : Math.min(...rates),
    max: rates.length === 0 ? 0 : Math.max(...rates),
    perRule,
    survivors: [...new Set(outcomes.map((o) => o.mutantId))].filter((id) => !killedIds.has(id)).sort(),
    detectedNotKilled: outcomes.filter((o) => o.detected && !o.killed).map((o) => `${o.mutantId}:${o.seed}`),
  };
}
