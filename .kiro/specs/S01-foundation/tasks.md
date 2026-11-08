# S01 — Foundation: Tasks

**Spec:** S01-foundation  
**Agent:** builder (task 15 runs as mutant-maker)  
**Design order:** follows §19 exactly — do not reorder.  
**Stop rule:** complete tasks 1–14, then STOP and tell the user before executing task 15.

---

- [x] 1. Install pnpm and confirm version
  - Run `npm install -g pnpm@12.18.0`
  - Confirm `pnpm --version` prints `12.18.0`

- [x] 2. Git init and root scaffold files
  - Run `git init` then `git branch -M main` in the workspace root
  - Create `.nvmrc` containing `22`
  - Create `LICENSE` (MIT, 2026, Lindokuhle Nyoka — exact text from design §1)
  - Create `.gitignore` (node_modules, .next, out, .turbo, .env*, !.env.example, bench/.private)
  - Create `.ignore` and `.rgignore` (both identical — 5 protected paths from design §1)
  - Create `.env.example` (all env vars from design §1, placeholder values)

- [x] 3. Root config files
  - Create root `package.json` with exact versions from design §2 (`packageManager: pnpm@12.18.0`, all pinned devDependencies)
  - Create `pnpm-workspace.yaml` (`apps/*`, `packages/*`)
  - Create `turbo.json` using `"tasks"` key with build, test, test:prop, lint, dev, clean tasks from design §4
  - Create `tsconfig.base.json` with ESNext/Bundler/noEmit/strict settings from design §5

- [x] 4. ESLint, Vitest shared config and setup file
  - Create `eslint.config.mjs` using `tseslint.config(...)` from design §6
  - Create `vitest.shared.ts` at repo root exporting `defineConfig` with passWithNoTests, include, setupFiles from design §7
  - Create `vitest.setup.ts` at repo root calling `fc.configureGlobal` from design §7

- [x] 5. Scaffold apps/shop and apps/seance with create-next-app@16.4.5
  - Create `apps/` directory if it doesn't exist
  - Run `npx create-next-app@16.4.5 apps/shop --ts --app --src-dir --import-alias "@/*" --eslint --tailwind --use-pnpm --skip-install --disable-git --yes`
  - Run `npx create-next-app@16.4.5 apps/seance --ts --app --src-dir --import-alias "@/*" --eslint --tailwind --use-pnpm --skip-install --disable-git --yes`
  - Apply post-scaffold edits to both apps (design §9.1 steps 0–10):
    - Delete nested `pnpm-workspace.yaml` and remove `"packageManager"` from app package.json
    - Rename to `@poltergeist/shop` / `@poltergeist/seance`
    - Pin `"next": "16.4.5"` (no `^`); pin react/react-dom to exact versions create-next-app wrote
    - Add `"@poltergeist/protocol": "workspace:*"` to dependencies
    - Add `"test": "vitest run"` and `"test:prop": "vitest run prop.test"` scripts
    - Add `"typecheck": "next typegen && tsc --noEmit"` script
    - Add `"extends": "../../tsconfig.base.json"` as first key in tsconfig.json
    - Add `transpilePackages: ['@poltergeist/protocol']` to next.config.ts
    - Create `vitest.config.ts` re-exporting from `../../vitest.shared`

- [x] 6. Create apps/landing bare package
  - Create `apps/landing/package.json` with name `@poltergeist/landing`, build/test/test:prop scripts from design §9.2
  - Create `apps/landing/vitest.config.ts` re-exporting from `../../vitest.shared`
  - Create `apps/landing/tsconfig.json` extending `../../tsconfig.base.json`

- [x] 7. Create packages/protocol with MutantOverride type and property test
  - Create `packages/protocol/src/index.ts` exporting `MutantOverride` type, `SEAM_KEY`, `MUTANT_ID` constants and `isWellFormedOverride` function from design §8
  - Create `packages/protocol/src/mutant-override.prop.test.ts` with both property tests from design §8
  - Create `packages/protocol/package.json` with name `@poltergeist/protocol`, exports, and scripts from design §8
  - Create `packages/protocol/tsconfig.json` extending `../../tsconfig.base.json`
  - Create `packages/protocol/vitest.config.ts` re-exporting from `../../vitest.shared`

- [x] 8. Create skeleton packages (ghost-core, driver-dom, driver-playwright, cli, scorer)
  - For each of the five packages, create: `package.json`, `tsconfig.json`, `vitest.config.ts`, and `src/index.ts` (export {}) using the template from design §10

- [x] 9. Create bench/.gitkeep and docs/kiro-diary.md
  - Create `bench/.gitkeep` (empty file so bench/ is committed)
  - Create `docs/kiro-diary.md` containing only `# Kiro Diary`
  - Verify `docs/brief.md` already exists (do not overwrite)

- [x] 10. Verify scripts/ — existence check only
  - Confirm `scripts/protect-mutants.mjs` exists
  - Confirm `scripts/pbt-on-save.mjs` exists
  - Run `'' | node scripts/protect-mutants.mjs` in PowerShell — must exit 0
  - **Do not edit either file**

- [x] 11. Create .kiro/settings/mcp.json
  - Create `.kiro/settings/mcp.json` with Playwright MCP at `@playwright/mcp@0.0.84` from design §14
  - No secrets

- [x] 12. Create .github/workflows/ci.yml
  - Create `.github/workflows/ci.yml` with ubuntu-latest and windows-latest matrix, FC_NUM_RUNS=1000 env var, from design §16

- [x] 13. Create README.md
  - Create `README.md` with project description, disclosure of create-next-app and all libraries, setup instructions from design §17

- [x] 14. Run pnpm install then pnpm test — must pass
  - Run `pnpm install` from workspace root — must exit 0 with no unresolved peer deps
  - Run `pnpm test` from workspace root — must exit 0
  - Verify output includes `mutant-override.prop.test.ts` with 2 tests passing
  - If any failure: fix it before proceeding (do not move to task 15)

- [x] 15. **Mutant stub** — done 9 Nov 2026 outside any builder session (exact §12 content). Builder must not touch apps/shop/src/mutants/.
  - This task must run as the `mutant-maker` agent as the main session agent, never as a sub-agent
  - Switch to `mutant-maker` as the main session agent
  - Create `apps/shop/src/mutants/` directory
  - Write `apps/shop/src/mutants/index.ts` with exact stub content from design §12
  - Run `pnpm --filter @poltergeist/shop exec tsc --noEmit` — must pass

- [ ] 16. Final commit and push to lk-nyoka/poltergeist
  - Stage all files: `git add .`
  - Commit: `git commit -m "S01: foundation — monorepo, protocol, shop + seance scaffold, CI"`
  - Try `gh auth status`; if authenticated run `gh repo create lk-nyoka/poltergeist --public --source . --remote origin --push`
  - Otherwise stop and ask Lindokuhle to create the repo manually (design §18)
