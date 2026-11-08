# Structure
apps/seance (Séance Room: ghost-core + DomDriver run here), apps/shop (Haunted Shop + seams + haunt-runtime.js),
apps/landing (static, GitHub Pages)
packages/ghost-core (ghosts, oracles, recorder, replay, shrinker, FakeDriver), packages/driver-dom (DomDriver RPC client +
thin runtime), packages/driver-playwright, packages/cli, packages/protocol (zod + MutantOverride type), packages/scorer
bench/ (baseline prompt, harness, checklist, quota, results; manifest + hash are mutant-maker only), docs/ (kiro-diary.md, writeup.md)
Specs live in .kiro/specs/S01-… to S13-…, numbered in build order.
Rules: ghost-core imports only the Driver interface, never DOM or Playwright APIs. The haunt runtime holds no ghost logic.
Victim views live in apps/seance/src/victims/, one component each. Property tests sit next to the code as *.prop.test.ts.
