/**
 * mutant-check, oracle level (R4).
 *
 * Per manifest entry, the rule's recipe is replayed through a real driver on `{mutantIds:[id]}` and on
 * `{clean:true}`. The entry is OK iff a MAPPED oracle (ORACLE_RULES) fires on the mutant session and no
 * mapped oracle fires on the clean one. The clean-suite flag is PASS iff NO oracle fires on any clean run.
 *
 * Pure: the replay is injected (`RunRecipe`), so this is unit-tested with a fake runner and the fixture
 * manifest. Output is counts only, in the same line format as the rule-level check.
 */
import { ORACLE_RULES, type MutantManifest, type OracleName, type PossessOptions, type Rule } from '@poltergeist/protocol';
import { INVALID_MANIFEST, NO_MANIFEST, formatSummary, loadManifest, passes, type Summary } from '../mutant-check/core';

/** Replays the recipe for `rule` on a fresh session with this possession and returns every oracle that fired. `null` = the run failed. */
export type RunRecipe = (rule: Rule, possession: PossessOptions) => Promise<ReadonlySet<OracleName> | null>;

export type OracleVerdict = 'ok' | 'wrong-rule' | 'undetected';

const mappedFor = (rule: Rule) => ORACLE_RULES[rule] as readonly OracleName[];

/**
 * - undetected: nothing fired on the mutant (or the run failed), or a mapped oracle also fired on the clean run
 *   (a false alarm is not a detection).
 * - wrong-rule: something fired on the mutant, but no mapped oracle did.
 * - ok: a mapped oracle fired on the mutant and none fired on the clean run.
 */
export function classifyOracles(
  rule: Rule,
  onMutant: ReadonlySet<OracleName> | null,
  onClean: ReadonlySet<OracleName> | null,
): OracleVerdict {
  if (!onMutant || onMutant.size === 0) return 'undetected';
  const mapped = mappedFor(rule);
  const mutantMapped = [...onMutant].some((o) => mapped.includes(o));
  if (!mutantMapped) return 'wrong-rule';
  if (!onClean) return 'undetected';
  return [...onClean].some((o) => mapped.includes(o)) ? 'undetected' : 'ok';
}

export async function checkOracles(manifest: MutantManifest, runRecipe: RunRecipe): Promise<Summary> {
  // A replay that throws is a failed run (null), never a crash that could print ids or seams.
  const run: RunRecipe = async (rule, possession) => {
    try {
      return await runRecipe(rule, possession);
    } catch {
      return null;
    }
  };
  // One clean replay per rule that appears in the manifest; the clean shop is the same for every mutant.
  const rules = [...new Set(manifest.mutants.map((m) => m.rule))].sort();
  const clean = new Map<Rule, ReadonlySet<OracleName> | null>();
  for (const rule of rules) clean.set(rule, await run(rule, { clean: true }));
  const cleanSuite = [...clean.values()].every((s) => s !== null && s.size === 0);

  const summary: Summary = { checked: 0, ok: 0, wrongRule: 0, undetected: 0, cleanSuite };
  for (const entry of manifest.mutants) {
    const onMutant = await run(entry.rule, { mutantIds: [entry.id] });
    const verdict = classifyOracles(entry.rule, onMutant, clean.get(entry.rule) ?? null);
    summary.checked++;
    if (verdict === 'ok') summary.ok++;
    else if (verdict === 'wrong-rule') summary.wrongRule++;
    else summary.undetected++;
  }
  return summary;
}

/** Whole oracle-level program with every effect injected. Returns the exit code. */
export async function oracleMutantCheck(deps: {
  manifestPath: string;
  run: RunRecipe;
  log: (line: string) => void;
}): Promise<number> {
  const loaded = await loadManifest(deps.manifestPath);
  if (loaded.kind === 'missing') {
    deps.log(NO_MANIFEST);
    return 0;
  }
  if (loaded.kind === 'invalid') {
    deps.log(INVALID_MANIFEST);
    return 1;
  }
  const summary = await checkOracles(loaded.manifest, deps.run);
  deps.log(formatSummary(summary));
  return passes(summary) ? 0 : 1;
}
