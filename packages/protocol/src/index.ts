/**
 * MutantOverride — one seam override that breaks exactly one contract rule (brief §6.1).
 * impl is called as impl(original, ...args). For render seams, impl(original) returns a component.
 * id is a random hash, never a descriptive name.
 */
export type MutantOverride = {
  /** Random hash, never a descriptive name */
  id: string;
  /** The seam key this override replaces, e.g. 'pricing/computeTotal' */
  seam: string;
  /** Called instead of the original seam function */
  // eslint-disable-next-line @typescript-eslint/no-unsafe-function-type
  impl: Function;
  /** true = public demo mutant (C1, C4, C8); false = random possession and benchmark only */
  public: boolean;
};

/** Seam keys have the form '<module>/<export>' (brief §6.1). */
export const SEAM_KEY = /^[a-z][a-z0-9-]*\/[A-Za-z][A-Za-z0-9]*$/;

/** Mutant ids are lowercase hex hashes, 8–64 characters. */
export const MUTANT_ID = /^[0-9a-f]{8,64}$/;

/** True when an override's id and seam have the shapes the registry expects. */
export function isWellFormedOverride(o: MutantOverride): boolean {
  return MUTANT_ID.test(o.id) && SEAM_KEY.test(o.seam) && typeof o.impl === 'function';
}

// Extensionless on purpose: this package is consumed as TypeScript source, and Turbopack does not
// map './x.js' to './x.ts' (tsconfig uses moduleResolution "Bundler", which allows extensionless).
export * from './manifest';
export * from './possess';
export * from './api';
