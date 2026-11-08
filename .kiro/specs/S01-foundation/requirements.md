# S01 — Foundation: Requirements

**Spec:** S01-foundation  
**Agent:** builder (mutant-maker once, for the stub)  
**Target done date:** 9 Nov 2026  
**Source of truth:** docs/brief.md §14, §5.1, §6.1, §13.2, §13.3, §2 (H1–H3, H9), Appendix A, Appendix E

---

## 1. Monorepo root

- REQ-1.1: The system SHALL use pnpm workspaces as the monorepo package manager with the exact installed pnpm version pinned in the root `package.json` `"packageManager"` field.
- REQ-1.2: The system SHALL use Turborepo 2 for build orchestration with a `turbo.json` using the `"tasks"` key (not the deprecated `"pipeline"` key) defining at least `build`, `test`, and `test:prop` tasks.
- REQ-1.3: The system SHALL target Node 22, declared in both an `.nvmrc` file containing `22` and the root `package.json` `"engines"` field.
- REQ-1.4: The system SHALL include an MIT `LICENSE` file at the repo root in a format that GitHub detects and displays in the repository's About section.
- REQ-1.5: The system SHALL include a `README.md` that discloses any starter templates used (e.g. `create-next-app`) and all third-party libraries.
- REQ-1.6: The system SHALL include `.ignore` and `.rgignore` files at the repo root that each list exactly these five paths so that repo-wide searches skip them:
  - `apps/shop/src/mutants`
  - `bench/mutant-manifest.json`
  - `bench/manifest.sha256`
  - `bench/.private`
  - `.kiro/specs/S03-mutation-engine`
- REQ-1.7: The `.kiro/` directory SHALL be committed and SHALL NOT appear in `.gitignore`. It SHALL contain `steering/`, `specs/`, `hooks/`, `agents/`, and `settings/` subdirectories.
- REQ-1.8: The root `.gitignore` SHALL exclude at minimum: `node_modules`, `.next`, `.turbo`, `.env*`, and `bench/.private`.
- REQ-1.9: A root `.env.example` file SHALL exist listing every environment variable the project requires, with placeholder values and inline comments.
- REQ-1.10: An empty `docs/kiro-diary.md` file SHALL exist and be committed, ready for the `diary` hook to append to.
- REQ-1.11: The repository SHALL be initialised with `git init`, have a first commit, and be pushed to a new public GitHub repository `lk-nyoka/poltergeist`.

## 2. TypeScript configuration

- REQ-2.1: Every `tsconfig.json` across all packages and apps SHALL include `"strict": true`.
- REQ-2.2: The root SHALL provide a base `tsconfig.base.json` that all workspace packages extend.
- REQ-2.3: Every workspace package and app SHALL have its own `tsconfig.json` extending the base config.

## 3. ESLint

- REQ-3.1: The workspace SHALL have a shared ESLint configuration applied across all packages and apps.
- REQ-3.2: WHEN `pnpm lint` is run from the workspace root, it SHALL exit 0 on the freshly scaffolded codebase.

## 4. Testing: Vitest and fast-check

- REQ-4.1: The workspace SHALL use Vitest as the test runner, configured at the workspace root via a shared Vitest config that sets `passWithNoTests: true`.
- REQ-4.2: The workspace SHALL include fast-check as a property-based testing dependency available to all packages.
- REQ-4.3: A shared Vitest setup file SHALL call `fc.configureGlobal({ numRuns: Number(process.env.FC_NUM_RUNS ?? 100) })` so all property tests respect the run-count environment variable.
- REQ-4.4: WHEN property tests run locally (via the `pbt-on-save` hook or `pnpm test`), `FC_NUM_RUNS` SHALL default to 100 when not set.
- REQ-4.5: WHEN property tests run in CI, the workflow SHALL set `FC_NUM_RUNS=1000`.
- REQ-4.6: Every workspace package and app SHALL have a `test` script and a `test:prop` script in its `package.json`. The `test:prop` script SHALL run only files matching `*.prop.test.ts`.
- REQ-4.7: Property test files SHALL be colocated with the code they test and named `*.prop.test.ts`.
- REQ-4.8: `packages/protocol` SHALL contain at least one real property test (`*.prop.test.ts`) that verifies a meaningful property of the `MutantOverride` type, so that `pnpm test` reports a passed property-based test from day one.
- REQ-4.9: WHEN `pnpm test` is run from the workspace root on Windows 11 with PowerShell, it SHALL exit 0 and SHALL report at least one passed property-based test.

## 5. App and package scaffolds

- REQ-5.1: The repository SHALL contain the following app directories, each with a valid `package.json` using the `@poltergeist/<folder>` naming convention, plus `test` and `test:prop` scripts:
  - `apps/seance` (`@poltergeist/seance`)
  - `apps/shop` (`@poltergeist/shop`)
  - `apps/landing` (`@poltergeist/landing`)
- REQ-5.2: `apps/shop` SHALL be scaffolded using `create-next-app@16` with the flags `--ts --app --src-dir --import-alias "@/*" --eslint --tailwind --use-pnpm --skip-install --disable-git`. After scaffolding, the `package.json` `name` field SHALL be changed to `@poltergeist/shop` and the `tsconfig.json` SHALL be updated to extend the root `tsconfig.base.json`. The exact Next.js version installed SHALL be pinned.
- REQ-5.3: `apps/seance` SHALL be scaffolded using `create-next-app@16` with the same flags as REQ-5.2. After scaffolding, the `package.json` `name` field SHALL be changed to `@poltergeist/seance` and the `tsconfig.json` SHALL extend the root `tsconfig.base.json`. The exact Next.js version SHALL be pinned.
- REQ-5.4: `apps/landing` SHALL be a bare package with a minimal `package.json` (name `@poltergeist/landing`, `test` and `test:prop` scripts) and a `tsconfig.json` extending the base. It SHALL NOT be scaffolded with `create-next-app` in S01.
- REQ-5.5: The repository SHALL contain the following package directories, each with a valid `package.json` (`@poltergeist/<folder>` name, `test` and `test:prop` scripts) and a `tsconfig.json` extending the base:
  - `packages/ghost-core` (`@poltergeist/ghost-core`)
  - `packages/driver-dom` (`@poltergeist/driver-dom`)
  - `packages/driver-playwright` (`@poltergeist/driver-playwright`)
  - `packages/cli` (`@poltergeist/cli`)
  - `packages/protocol` (`@poltergeist/protocol`)
  - `packages/scorer` (`@poltergeist/scorer`)
- REQ-5.6: The repository SHALL contain a `bench/` directory and a `docs/` directory at the root.
- REQ-5.7: `docs/brief.md` SHALL be the committed copy of the project brief.

## 6. packages/protocol — MutantOverride type

- REQ-6.1: `packages/protocol` SHALL export a `MutantOverride` TypeScript type with exactly these fields:
  - `id: string` (a random hash)
  - `seam: string`
  - `impl: Function`
  - `public: boolean`
- REQ-6.2: The `MutantOverride` export SHALL be importable by other workspace packages via `@poltergeist/protocol`.

## 7. Mutant stub (mutant-maker task)

- REQ-7.1: The file `apps/shop/src/mutants/index.ts` SHALL exist and SHALL contain exactly:
  ```ts
  import type { MutantOverride } from '@poltergeist/protocol';
  export const overrides: MutantOverride[] = [];
  ```
- REQ-7.2: This file SHALL NOT be created or edited by `builder`, `ghost-smith` or `judge`. (Done 9 Nov 2026: the stub was written outside any builder session, by the reviewing agent, with the exact content below. From S03 on, only `mutant-maker` writes in this folder.) The `protocol` package and the `apps/shop` scaffold SHALL exist before this step runs.
- REQ-7.3: This file SHALL be committed before spec S02 begins, because the S02 seam registry imports it statically.
- REQ-7.4: The stub SHALL use a static import (never a guarded dynamic import), so that bundlers do not fail on a missing module.

## 8. Cross-platform scripts

- REQ-8.0: The existing `scripts/protect-mutants.mjs` and `scripts/pbt-on-save.mjs` SHALL NOT be modified in S01 (they are already tested; see design §13).
- REQ-8.1: `scripts/protect-mutants.mjs` SHALL exist and SHALL be the implementation invoked by the `protect-mutants` inline hook in the `builder`, `ghost-smith`, and `judge` agents.
- REQ-8.2: `scripts/pbt-on-save.mjs` SHALL exist and SHALL be the implementation invoked by the `pbt-on-save` workspace hook.
- REQ-8.3: All scripts SHALL be cross-platform: they SHALL use Node `.mjs` scripts or `cross-env`; they SHALL NOT use bash-only syntax or shebangs.

## 9. Kiro configuration

- REQ-9.1: The following steering files SHALL exist under `.kiro/steering/` (already created; this requirement confirms they are committed):
  `product.md`, `tech.md`, `structure.md`, `ghost-impatient.md`, `ghost-fraudster.md`, `ghost-nightowl.md`, `ghost-glitch.md`, `mutants.md`.
- REQ-9.2: `mutants.md` SHALL have `inclusion: manual` as its front-matter, so it is never auto-loaded.
- REQ-9.3: The four agent files (`builder.json`, `mutant-maker.json`, `ghost-smith.json`, `judge.json`) SHALL exist under `.kiro/agents/` and SHALL have been validated against the current Kiro custom-agent documentation. Agent files use plain `"file://…"` strings in `resources`; hooks reference `scripts/*.mjs` implementations. This format is confirmed correct and SHALL NOT be changed.
- REQ-9.4: `builder`, `ghost-smith`, and `judge` agents SHALL each contain an inline `protect-mutants` hook with three `PreToolUse` entries (matchers: `read`, `write`, `shell`) that exit code 2 when a path field or shell command string matches `/apps[\\/]shop[\\/]src[\\/]mutants|mutant-manifest\.json|manifest\.sha256|bench[\\/]\.private|S03-mutation-engine|steering[\\/]mutants\.md/i`.
- REQ-9.5: The `protect-mutants` hook SHALL check only path fields and shell command strings from the stdin JSON; it SHALL NOT inspect file contents, so that the seam registry's `import ... from '@/mutants/index'` is never blocked.
- REQ-9.6: The `mutant-maker` agent SHALL NOT include a `protect-mutants` hook.
- REQ-9.7: The `pbt-on-save` hook SHALL exist at `.kiro/hooks/pbt-on-save.json`, trigger on `PostFileSave` matching `packages/`, and run property tests for the affected package at 100 runs. Acceptance: the hook appears as enabled in the Kiro Hooks panel.
- REQ-9.8: The `diary` hook SHALL exist at `.kiro/hooks/diary.json`, trigger on `PostTaskExec`, and append an entry to `docs/kiro-diary.md` using the Appendix D template, except when the active spec is S03-mutation-engine. Acceptance: the hook appears as enabled in the Kiro Hooks panel.
- REQ-9.9: `.kiro/settings/mcp.json` SHALL exist and be committed. It SHALL configure the Playwright MCP server (`@playwright/mcp`) at a pinned version using `npx`. It SHALL contain no secrets. Any future secret references SHALL use `${VAR_NAME}` syntax only.

## 10. Continuous integration

- REQ-10.1: A GitHub Actions workflow file SHALL exist at `.github/workflows/ci.yml` and SHALL run `pnpm test` on every push and pull request.
- REQ-10.2: The CI workflow SHALL set `FC_NUM_RUNS=1000` so property tests run 1000 iterations in CI.
- REQ-10.3: The CI workflow SHALL use a matrix of `ubuntu-latest` and `windows-latest` runners.
- REQ-10.4: WHEN the CI workflow runs, it SHALL install dependencies with `pnpm install` and exit non-zero if any test fails.
- REQ-10.5: The CI workflow SHALL NOT require any paid services or secrets in S01.

## 11. Hard constraints

- REQ-11.1: Every commit in the repository SHALL be dated on or after 30 Oct 2026 (H1).
- REQ-11.2: The repository SHALL be hosted on GitHub (not GitLab) at `lk-nyoka/poltergeist` and SHALL be public (H2).
- REQ-11.3: No code SHALL be copied from earlier projects (H1). The README SHALL disclose all starter templates and libraries used.
- REQ-11.4: The `.kiro/` directory SHALL NOT appear in `.gitignore` at any level (H3).
- REQ-11.5: WHEN any `pnpm` script defined at the workspace root is run on Windows 11 with PowerShell, it SHALL complete without requiring a Unix shell (H9).

## 12. Acceptance criteria (done-when gates)

- AC-1: `pnpm test` exits 0 in PowerShell on Windows 11 with no manual setup beyond `pnpm install`, and the output includes at least one passed property-based test from `packages/protocol`.
- AC-2: Every agent file in `.kiro/agents/` has been checked against the current Kiro custom-agent documentation; the `"file://…"` resource format and `scripts/*.mjs` hook format are confirmed correct.
- AC-3: `packages/protocol` correctly exports `MutantOverride`; a TypeScript import in `apps/shop/src/mutants/index.ts` compiles without error.
- AC-4: `apps/shop/src/mutants/index.ts` exists with exactly the specified stub content and was written by `mutant-maker` as the main session agent, after `packages/protocol` and `apps/shop` scaffold exist.
- AC-5: `.ignore` and `.rgignore` each contain all five protected paths.
- AC-6: The MIT `LICENSE` file is present at the repo root and GitHub detects it in the About section.
- AC-7: `pnpm install` exits 0 with no unresolved peer dependency errors.
- AC-8: The `pbt-on-save` and `diary` hooks both show as enabled in the Kiro Hooks panel.
- AC-9: The GitHub repo `lk-nyoka/poltergeist` is public, and CI passes on both ubuntu-latest and windows-latest.
- AC-8: Both `pbt-on-save` and `diary` hooks appear as enabled in the Kiro Hooks panel.
- AC-9: The repository is live at `https://github.com/lk-nyoka/poltergeist` as a public repo.
- AC-10: The CI matrix (ubuntu-latest, windows-latest) passes on the first push.
