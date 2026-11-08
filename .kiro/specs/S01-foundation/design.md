# S01 — Foundation: Design

**Spec:** S01-foundation  
**Agent:** builder (mutant-maker once, for the stub)  
**Requirements:** requirements.md  
**New dependencies:** Every dependency below has a one-line justification. All versions were resolved with `npm show <pkg> version` on 8 Nov 2026 and are pinned exactly.  
**Do not re-derive versions, guess script content, or edit the scripts/ folder.**
**Dry-run tested by Claude on 8 Nov 2026:** pnpm 12.18.0 install, `pnpm test`, `FC_NUM_RUNS=1000` giving exactly 1000 runs, `pnpm build`, `pnpm lint`, the create-next-app 16.4.5 scaffold and the shop typecheck with the mutant stub all pass.

---

## 1. Repository initialisation

Run these commands once, at the workspace root, before creating any files:

```powershell
git init
git branch -M main
```

Create the following root files immediately. They must exist before the first commit.

### `.nvmrc`
```
22
```

### `LICENSE`
Standard MIT, with the year `2026` and the name `Lindokuhle Nyoka`. GitHub detects this and shows it in the About section only when the file uses the exact SPDX header line `MIT License`.

```
MIT License

Copyright (c) 2026 Lindokuhle Nyoka

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

### `.gitignore`
```
# dependencies
node_modules

# Next.js
.next
out

# Turborepo
.turbo

# environment variables
.env*
!.env.example

# benchmark private data (never committed)
bench/.private
```

Note: `.kiro/` must NOT appear here. `bench/.private` is listed so it is never accidentally committed.

### `.ignore` and `.rgignore`
Both files are identical. They tell ripgrep and other search tools to skip protected paths:
```
apps/shop/src/mutants
bench/mutant-manifest.json
bench/manifest.sha256
bench/.private
.kiro/specs/S03-mutation-engine
```

### `.env.example`
```
# Supabase — server-only, never NEXT_PUBLIC_
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SECRET_KEY=sb_secret_...

# Iron-session — used to seal/unseal session tokens in apps/shop
SESSION_SECRET=at-least-32-chars-random-string-here

# Cross-origin origins (production Vercel URLs, never VERCEL_URL)
SHOP_ORIGIN=https://poltergeist-shop.vercel.app
SEANCE_ORIGIN=https://poltergeist-seance.vercel.app

# Server-to-server shared secret (Séance → Shop)
SEANCE_SERVER_SECRET=random-string-here

# Benchmark-only (never deployed)
BENCH_SECRET=random-string-here
BENCH_MODE=

# Gemini API (server-only, never NEXT_PUBLIC_)
GEMINI_API_KEY=
```

---

## 2. Root package.json

**Before any `pnpm install`:** run `npm install -g pnpm@12.18.0` and confirm `pnpm --version` prints `12.18.0`. The `packageManager` field must hold the real pinned version before anything else runs; a placeholder breaks pnpm and Turborepo.

All versions below were resolved with `npm show <pkg> version` on 8 Nov 2026.

```json
{
  "name": "poltergeist",
  "private": true,
  "packageManager": "pnpm@12.18.0",
  "engines": {
    "node": ">=22.12.0"
  },
  "scripts": {
    "build": "turbo build",
    "test": "turbo test",
    "test:prop": "turbo test:prop",
    "lint": "turbo lint",
    "dev": "turbo dev",
    "clean": "turbo clean"
  },
  "devDependencies": {
    "turbo": "2.11.10",
    "typescript": "6.0.3",
    "eslint": "10.14.0",
    "@eslint/js": "10.0.1",
    "typescript-eslint": "8.72.1",
    "vitest": "5.1.0",
    "vite": "8.3.6",
    "@types/node": "22.20.5",
    "fast-check": "4.10.2",
    "cross-env": "10.1.0"
  }
}
```

**Dependency justifications:**
- `turbo@2.11.10`: task orchestration and caching across the monorepo (uses `"tasks"` key).
- `typescript@6.0.3`: pinned to `<6.1.0` because `typescript-eslint@8.72.1` declares peer `typescript >=4.8.4 <6.1.0`; TypeScript 7 is not yet supported by typescript-eslint.
- `eslint@10.14.0` + `@eslint/js@10.0.1` + `typescript-eslint@8.72.1`: flat-config linting with TypeScript rules; typescript-eslint 8 supports eslint `^8.57 || ^9 || ^10`. `@eslint/js` provides `js.configs.recommended`, imported directly in §6.
- `vitest@5.1.0` + `vite@8.3.6`: test runner; Vitest 5 has vite as a required peer, so it is pinned explicitly. Requires Node ≥22.12.
- `@types/node@22.20.5`: **verified, do not change.** Node 22 types, matching the Node 22 runtime. The latest `@types/node` (26.x) describes Node 26 APIs that don't exist on Node 22, so code could type-check and then fail at runtime. It satisfies Vitest 5's peer range (`^22.0.0 || >=24`).
- `fast-check@4.10.2`: property-based testing; used by every package's `*.prop.test.ts` and later by The Glitch.
- `cross-env@10.1.0`: sets `FC_NUM_RUNS` in npm scripts without requiring bash.

## 3. pnpm-workspace.yaml

```yaml
packages:
  - 'apps/*'
  - 'packages/*'
```

---

## 4. Turborepo — `turbo.json`

Turborepo 2 uses the `"tasks"` key. The `"pipeline"` key is removed.

```json
{
  "$schema": "https://turbo.build/schema.json",
  "tasks": {
    "build": {
      "dependsOn": ["^build"],
      "outputs": [".next/**", "!.next/cache/**", "dist/**"]
    },
    "test": {
      "dependsOn": ["^build"],
      "outputs": [],
      "cache": false
    },
    "test:prop": {
      "dependsOn": ["^build"],
      "outputs": [],
      "cache": false
    },
    "lint": {
      "outputs": []
    },
    "dev": {
      "cache": false,
      "persistent": true
    },
    "clean": {
      "cache": false
    }
  },
  "globalEnv": ["FC_NUM_RUNS", "NODE_ENV"]
}
```

`test` and `test:prop` have `"cache": false` because test results must always re-run in CI; they must not be served from a stale Turborepo cache.

---

## 5. TypeScript — `tsconfig.base.json`

Packages are consumed as TypeScript source (no `dist/`), and the Next.js apps need bundler resolution. So the base config does not emit, and uses bundler resolution.

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    "strict": true,
    "target": "ES2022",
    "lib": ["ES2022"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "noEmit": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "resolveJsonModule": true,
    "isolatedModules": true,
    "verbatimModuleSyntax": true,
    "noUncheckedIndexedAccess": true,
    "noImplicitOverride": true,
    "types": ["node"]
  }
}
```

Do not add `composite`, `declaration` or `NodeNext`: they conflict with Next.js and with source-only packages.

## 6. ESLint — `eslint.config.mjs` (root, flat config, for packages)

**Verified 8 Nov 2026 — do not change.** `tseslint.config()` is deprecated in typescript-eslint 8.72 ("ESLint core now provides this functionality via `defineConfig()`"), so this uses ESLint's own `defineConfig`. Tested: `pnpm lint` passes and an `any` produces the expected warning.

The root config lints `packages/*` and root scripts. The two Next.js apps **keep the `eslint.config.mjs` that create-next-app generated** (it carries the Next/React rules) and lint themselves.

```js
import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import { defineConfig } from 'eslint/config';

export default defineConfig(
  {
    ignores: [
      '**/node_modules/**',
      '**/.next/**',
      '**/dist/**',
      '**/.turbo/**',
      'apps/**',
      'bench/.private/**',
    ],
  },
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
);
```

Each package's `lint` script is `eslint .`, which finds this root config.

## 7. Vitest — one shared config, one setup file

Vitest only reads the config in the folder it runs from; it doesn't look in parent folders. So the shared settings live in `vitest.shared.ts` at the root, and every package and app re-exports it via their own `vitest.config.ts`.

**There is no root `vitest.config.ts`.** Tests always run per-package, dispatched by Turborepo.

### `vitest.shared.ts` (root)

```ts
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    passWithNoTests: true,
    include: ['src/**/*.test.{ts,tsx}'],
    exclude: ['**/node_modules/**', '**/.next/**'],
    setupFiles: [fileURLToPath(new URL('./vitest.setup.ts', import.meta.url))],
  },
});
```

### `vitest.setup.ts` (root)

```ts
import fc from 'fast-check';

fc.configureGlobal({
  numRuns: Number(process.env.FC_NUM_RUNS ?? 100),
});
```

This is the single place that sets fast-check's run count. Locally and in the `pbt-on-save` hook it defaults to 100; CI sets `FC_NUM_RUNS=1000`.

### `vitest.config.ts` in every package and app

Each package and app gets a one-line re-export:

```ts
export { default } from '../../vitest.shared';
```

(Apps under `apps/` use the same relative path `../../vitest.shared`.)

### Scripts in every package and app

```json
"test": "vitest run",
"test:prop": "vitest run prop.test"
```

`prop.test` is a Vitest substring filter — it matches any test file whose path contains `prop.test`. No glob quoting needed.

## 8. packages/protocol

### Directory structure
```
packages/protocol/
├── src/
│   ├── index.ts
│   └── mutant-override.prop.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

### `packages/protocol/package.json`
```json
{
  "name": "@poltergeist/protocol",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p . --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:prop": "vitest run prop.test"
  }
}
```

Tooling (vitest, fast-check, typescript) comes from the root `devDependencies`; don't repeat it here with `"*"`.

### `packages/protocol/tsconfig.json`
```json
{
  "extends": "../../tsconfig.base.json",
  "include": ["src", "vitest.config.ts"]
}
```

### `packages/protocol/src/index.ts`
```ts
/**
 * MutantOverride — one seam override that breaks exactly one contract rule (brief §6.1).
 * impl is Function so the seam registry can call it with the original's arguments.
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
```

### `packages/protocol/src/mutant-override.prop.test.ts`

A real property (it tests `isWellFormedOverride`, not the generator), written for **fast-check 4** (`hexaString` no longer exists).

```ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isWellFormedOverride, type MutantOverride } from './index';

const hex = fc.string({ unit: fc.constantFrom(...'0123456789abcdef'), minLength: 8, maxLength: 64 });
const seam = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}\/[A-Za-z][A-Za-z0-9]{0,15}$/);
const override: fc.Arbitrary<MutantOverride> = fc.record({
  id: hex,
  seam,
  impl: fc.constant(() => undefined),
  public: fc.boolean(),
});

describe('MutantOverride', () => {
  it('accepts every override with a hex id and a <module>/<export> seam', () => {
    fc.assert(fc.property(override, (o) => isWellFormedOverride(o)));
  });

  it('rejects any id containing a non-hex character', () => {
    const badId = fc
      .tuple(hex, fc.constantFrom(...'ghijklmnopqrstuvwxyz-_ G'))
      .map(([h, c]) => h + c);
    fc.assert(
      fc.property(override, badId, (o, id) => {
        expect(isWellFormedOverride({ ...o, id })).toBe(false);
      }),
    );
  });
});
```

## 9. App scaffolds

### 9.1 apps/shop and apps/seance — create-next-app@16.4.5

Run **from the repo root**. First create the parent folder with `mkdir apps`: create-next-app reports "application path is not writable" if `apps/` doesn't exist. `apps/shop` and `apps/seance` must not exist yet (it refuses a non-empty folder). The flags were checked against `create-next-app@16.4.5 --help`. `--yes` stops it prompting; `--skip-install` and `--disable-git` stop it installing with npm or making a nested git repo.

```powershell
npx create-next-app@16.4.5 apps/shop   --ts --app --src-dir --import-alias "@/*" --eslint --tailwind --use-pnpm --skip-install --disable-git --yes
npx create-next-app@16.4.5 apps/seance --ts --app --src-dir --import-alias "@/*" --eslint --tailwind --use-pnpm --skip-install --disable-git --yes
```

Then make these edits in **both** apps (all tested on 8 Nov 2026 with create-next-app 16.4.5):

0. **Delete the nested workspace file** create-next-app writes (`apps/shop/pnpm-workspace.yaml`, `apps/seance/pnpm-workspace.yaml`), and delete the `"packageManager"` field from both apps' `package.json`. Only the root has these.
1. **Rename** in `package.json`: `"name": "@poltergeist/shop"` / `"@poltergeist/seance"`.
2. **Pin exactly**: create-next-app 16.4.5 already writes `"next": "16.4.5"`, `"react": "19.3.0"`, `"react-dom": "19.3.0"`. After `pnpm install`, replace every remaining `^` range in the app's `devDependencies` with the exact version shown by `pnpm --filter @poltergeist/<app> list --depth 0`.
3. **Depend on protocol**: add `"@poltergeist/protocol": "workspace:*"` to `dependencies`.
4. **Add scripts**: `"test": "vitest run"`, `"test:prop": "vitest run prop.test"`, `"typecheck": "next typegen && tsc --noEmit"`. `next typegen` must run first: the generated `layout.tsx` uses Next's global `LayoutProps` type, which exists only after typegen. Keep the generated `lint`, `dev`, `build`, `start` scripts.
5. **tsconfig**: keep the generated `tsconfig.json` as it is (it already has `strict: true`, bundler resolution, `noEmit` and the `@/*` path). Add only `"extends": "../../tsconfig.base.json"` as the first key. Next.js's own options override the base where they differ.
6. **next.config.ts**: add `transpilePackages: ['@poltergeist/protocol']` to the config object, so the app can import workspace packages from source.
7. **vitest.config.ts**: add the one-line re-export from §7.
8. **ESLint**: keep the generated `eslint.config.mjs`.
9. **Leave the generated Next options alone in S01** (`cacheComponents: true`, `partialPrefetching: true`, the Turbopack CSS rule). Whether the shop keeps Cache Components with per-session cookies is an S02 decision.
10. Keep the generated `AGENTS.md`, `README.md` and app `.gitignore`.
11. **App ESLint stays on 9: `"eslint": "9.39.5"` (verified, do not change).** eslint-config-next's plugins (eslint-plugin-react, -import, -jsx-a11y) support ESLint only up to 9, so ESLint 10 in the apps gives unmet-peer warnings. The root (packages only) uses ESLint 10.14.0. Apps also use `"@types/node": "22.20.5"`.

### 9.2 apps/landing — bare package (built in S13)

`apps/landing/package.json`:
```json
{
  "name": "@poltergeist/landing",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "scripts": {
    "build": "node -e \"console.log('landing: built in S13')\"",
    "test": "vitest run",
    "test:prop": "vitest run prop.test"
  }
}
```

Add `apps/landing/vitest.config.ts` (the §7 re-export) and `apps/landing/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "vitest.config.ts"] }
```

## 10. Skeleton packages (ghost-core, driver-dom, driver-playwright, cli, scorer)

Each is a skeleton in S01, filled out in later specs:

```
packages/<name>/
├── src/
│   └── index.ts        ← export {};
├── package.json
├── tsconfig.json
└── vitest.config.ts    ← the §7 re-export
```

`packages/<name>/package.json`:
```json
{
  "name": "@poltergeist/<name>",
  "version": "0.0.1",
  "private": true,
  "type": "module",
  "exports": { ".": "./src/index.ts" },
  "types": "./src/index.ts",
  "scripts": {
    "build": "tsc -p . --noEmit",
    "lint": "eslint .",
    "test": "vitest run",
    "test:prop": "vitest run prop.test"
  }
}
```

`packages/<name>/tsconfig.json`:
```json
{ "extends": "../../tsconfig.base.json", "include": ["src", "vitest.config.ts"] }
```

`packages/<name>/src/index.ts`:
```ts
// Implemented in a later spec (brief §14).
export {};
```

Apply to: `ghost-core`, `driver-dom`, `driver-playwright`, `cli`, `scorer`.

## 11. bench/ directory

```
bench/
└── .gitkeep
```

A single `.gitkeep` so the directory is committed. All benchmark content is added in later specs.

---

## 12. Mutant stub — mutant-maker task

**Done 9 Nov 2026, outside any builder session** (written by the reviewing agent with the exact content below, to save Kiro credits). The rule that matters is that `builder`, `ghost-smith` and `judge` never write here; from S03 on, only `mutant-maker` does.

The `apps/shop` scaffold and `packages/protocol` must exist before this step. The mutant-maker agent:

1. Creates `apps/shop/src/mutants/` directory.
2. Writes `apps/shop/src/mutants/index.ts` with exactly this content:

```ts
import type { MutantOverride } from '@poltergeist/protocol';
export const overrides: MutantOverride[] = [];
```

No other files in `apps/shop/src/mutants/` are created in S01. No dynamic imports. The file is committed.

---

## 13. scripts/ directory — DO NOT MODIFY

`scripts/protect-mutants.mjs` and `scripts/pbt-on-save.mjs` already exist and have been tested. **Do not rewrite, reformat, or edit them in S01 or any later spec unless a breaking change in the hook payload schema requires it.**

What they do (for documentation only — do not reproduce this logic):

- **`protect-mutants.mjs`**: reads stdin via fd 0 (Windows-safe; `/dev/stdin` does not exist on Windows), parses the Kiro tool invocation JSON, walks `tool_input` recursively for path-like fields and shell command strings only (skips content fields by key name), and exits 2 when any value matches the protected-path regex. Allows the seam registry's `import ... from '@/mutants/index'` because that string appears in a content field (`old_str`/`new_str`), not a path field.
- **`pbt-on-save.mjs`**: finds `packages/<name>` in the raw hook payload string, then runs `pnpm --filter @poltergeist/<name> run --if-present test:prop` with `FC_NUM_RUNS=100`. The `--if-present` flag means packages without a `test:prop` script are silently skipped.

The only S01 check: both files exist. Run `'' | node scripts/protect-mutants.mjs` in PowerShell — must exit 0 (empty input is allowed).

## 14. Kiro configuration

### `.kiro/settings/mcp.json`

```json
{
  "mcpServers": {
    "playwright": {
      "command": "npx",
      "args": ["@playwright/mcp@0.0.84"],
      "disabled": false
    }
  }
}
```

`@playwright/mcp` is pinned to `0.0.84` (latest as of 8 Nov 2026). No secrets are needed for Playwright MCP. The GitHub MCP server and Supabase MCP/Power are added in later specs when they are first used.

### Steering, agents, hooks

Already created. No changes in S01 design. The acceptance criterion is that both `pbt-on-save` and `diary` hooks appear as enabled in the Kiro Hooks panel after session start.

---

## 15. docs/ directory

```
docs/
├── brief.md          ← already committed (copy of POLTERGEIST_KIRO_BRIEF.md)
└── kiro-diary.md     ← empty file, ready for the diary hook
```

`docs/kiro-diary.md` must be an empty file (or contain only a `# Kiro Diary` heading). Do not add placeholder text — the `diary` hook appends entries automatically.

```markdown
# Kiro Diary
```

---

## 16. GitHub Actions — `.github/workflows/ci.yml`

```yaml
name: CI

on:
  push:
    branches: ['**']
  pull_request:
    branches: ['**']

jobs:
  test:
    name: Test (${{ matrix.os }})
    runs-on: ${{ matrix.os }}
    strategy:
      fail-fast: false
      matrix:
        os: [ubuntu-latest, windows-latest]

    steps:
      - uses: actions/checkout@v4

      - name: Setup Node 22
        uses: actions/setup-node@v4
        with:
          node-version: '22'

      - name: Setup pnpm
        uses: pnpm/action-setup@v4
        with:
          run_install: false

      - name: Get pnpm store directory
        shell: bash
        run: echo "STORE_PATH=$(pnpm store path --silent)" >> $GITHUB_ENV

      - name: Cache pnpm store
        uses: actions/cache@v4
        with:
          path: ${{ env.STORE_PATH }}
          key: ${{ runner.os }}-pnpm-store-${{ hashFiles('**/pnpm-lock.yaml') }}
          restore-keys: |
            ${{ runner.os }}-pnpm-store-

      - name: Install dependencies
        run: pnpm install --frozen-lockfile

      - name: Run tests
        run: pnpm test
        env:
          FC_NUM_RUNS: '1000'
```

The `pnpm/action-setup@v4` action reads the `"packageManager"` field from the root `package.json`, so no explicit `with: version:` is needed — it uses the pinned version automatically.

---

## 17. README.md

```markdown
# Poltergeist

> Ghosts that break your app before your customers do, and show you who gets hurt.

Poltergeist is a crew of AI ghost agents that possess a web app, break it the way real people do, and report who gets hurt. Built for the Kiroween 2026 hackathon (Frankenstein category).

## Project status

Under active construction. See `docs/brief.md` for the full specification.

## Disclosure of templates and libraries

- **`apps/shop`** and **`apps/seance`** were scaffolded with [`create-next-app@16`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).
- **Runtime libraries** include: Next.js 16, Tailwind CSS, iron-session, Supabase, fast-check, zod, axe-core, Playwright.
- **Build tooling** includes: pnpm workspaces, Turborepo 2, Vitest, TypeScript strict, ESLint 9.

No code has been copied from earlier projects. All commits are dated on or after 30 Oct 2026.

## Setup (Windows 11 + PowerShell)

\`\`\`powershell
# Node 22 required (.nvmrc)
pnpm install
pnpm test        # must exit 0
\`\`\`

## Kiro

This project was built with the [Kiro IDE](https://kiro.dev) as part of Kiroween 2026. The `.kiro/` directory is committed and contains specs, hooks, steering files and custom agents.
```

---

## 18. First commit and GitHub push

After `pnpm install` and `pnpm test` pass and the mutant stub exists:

```powershell
git add .
git commit -m "S01: foundation — monorepo, protocol, shop + seance scaffold, CI"
```

Then create the public repo and push. **Check for `gh` first:**

```powershell
gh auth status
```

- **If `gh` is installed and authenticated:**
  ```powershell
  gh repo create lk-nyoka/poltergeist --public --source . --remote origin --push
  ```
  This creates the repo, sets the remote, and pushes in one step.

- **If `gh` is not installed or not logged in — stop here.** Ask Lindokuhle to:
  1. Go to `https://github.com/new`
  2. Set owner to `lk-nyoka`, repo name to `poltergeist`, visibility to **Public**
  3. **Do not** check any of "Add a README", "Add .gitignore", or "Choose a license" — any pre-seeded file will block the push
  4. Click **Create repository**, then run:
     ```powershell
     git remote add origin https://github.com/lk-nyoka/poltergeist.git
     git push -u origin main
     ```

## 19. Build order summary

This is the exact order tasks.md follows:

1. `npm install -g pnpm@12.18.0`, confirm `pnpm --version` = 12.18.0
2. `git init`, `git branch -M main`; root files: `.nvmrc`, `LICENSE`, `.gitignore`, `.ignore`, `.rgignore`, `.env.example`
3. Root `package.json` (real `packageManager` value), `pnpm-workspace.yaml`, `turbo.json`, `tsconfig.base.json`
4. `eslint.config.mjs`, `vitest.shared.ts`, `vitest.setup.ts`
5. `mkdir apps`, then `apps/shop` and `apps/seance` via create-next-app@16.4.5, then the §9.1 edits (including deleting the nested `pnpm-workspace.yaml`)
6. `apps/landing` bare package
7. `packages/protocol` (type, helpers, property test)
8. Skeleton packages: `ghost-core`, `driver-dom`, `driver-playwright`, `cli`, `scorer`
9. `bench/.gitkeep`, `docs/kiro-diary.md` (`docs/brief.md` already exists)
10. `scripts/`: existence check only (§13). No edits
11. `.kiro/settings/mcp.json`
12. `.github/workflows/ci.yml`
13. `README.md`
14. `pnpm install`, then `pnpm test`: must exit 0 with the protocol property tests passing
15. **Switch to `mutant-maker` as the main session agent** → write `apps/shop/src/mutants/index.ts`
16. Back to `builder`: `pnpm --filter @poltergeist/shop typecheck` passes, then commit and push (§18)

## 20. Acceptance verification

| AC | How to verify |
|----|--------------|
| AC-1 | Run `pnpm test` in PowerShell. Expect exit 0. Output must show `mutant-override.prop.test.ts` with 2 tests passing. |
| AC-2 | Agent format confirmed: `"file://…"` resources, `scripts/*.mjs` hooks. No change needed. |
| AC-3 | Run `pnpm --filter @poltergeist/shop typecheck`. Expect no type errors (it runs `next typegen` first). |
| AC-4 | Check `apps/shop/src/mutants/index.ts` content matches the stub exactly. Confirm it was written in a `mutant-maker` main-agent session. |
| AC-5 | Open `.ignore` and `.rgignore`. Both must list all five protected paths. |
| AC-6 | Visit `https://github.com/lk-nyoka/poltergeist`. MIT license must appear in the About section on the right. |
| AC-7 | Run `pnpm install --frozen-lockfile`. Expect exit 0, no unresolved peer deps. |
| AC-8 | Open Kiro Hooks panel. Both `pbt-on-save` and `diary` must show as enabled. |
| AC-9 | Visit `https://github.com/lk-nyoka/poltergeist`. Repo must be public. |
| AC-10 | After the first push, visit the Actions tab. The CI matrix (ubuntu, windows) must both pass. |
