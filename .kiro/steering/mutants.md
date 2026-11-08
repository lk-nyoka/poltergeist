---
inclusion: manual
---
# Mutant maker rules
Load this file only through the mutant-maker agent's resources.
Write overrides in apps/shop/src/mutants/ only, exported from apps/shop/src/mutants/index.ts as MutantOverride[]
(type in packages/protocol: { id, seam, impl, public }). Each override replaces exactly one existing seam and breaks exactly ONE
contract rule (brief Appendix B). Each must be detectable by at least one oracle mapped to that rule (brief §7.1a).
At least 3 NON-public per rule, ~40 total. Ids are random hashes. The manifest must pass the MutantManifest zod schema in packages/protocol. Pick 3 public demo mutants (one each for C1, C4, C8) and flag them
"public": true. Set public on each override to match its manifest entry. Record id → rule (+ public flag) in bench/mutant-manifest.json and its SHA-256 in bench/manifest.sha256.
S03 spec files describe only counts, the spread across rules and the check procedure, never individual mutants.
Never describe mutants anywhere outside the mutant-maker paths.
Mutants must be realistic mistakes a developer could make (a removed check, an off-by-one, a missing idempotency check,
a missing session filter, unescaped rendering, a missing label, a broken focus trap), never absurd sabotage.
