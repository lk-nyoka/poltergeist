# S03 — Mutation engine: Design

**Spec:** S03-mutation-engine · **Agent:** mutant-maker (main session agent) · **Requirements:** requirements.md
**Prepared with Claude (planning) on 9 Nov 2026.** Counts and procedure only (brief §13.2).

## 1. Inputs mutant-maker uses

- `.kiro/steering/mutants.md` (loaded through the mutant-maker agent's `resources`)
- `docs/brief.md` Appendix B (contract) and §7.1a (oracle → rule map)
- `pnpm --filter @poltergeist/shop seams:list`: the only valid seam keys
- `packages/protocol/src/index.ts`: the `MutantOverride` type (`impl(original, ...args)`)
- Reading shop source under `apps/shop/src/` is allowed, to understand what each seam does. Writing outside the REQ-4.1 paths is not.

## 2. Target counts

| Rule | Non-public overrides | Public demo | Total |
| --- | --- | --- | --- |
| C1 | ≥ 3 | 1 | ≥ 4 |
| C2–C3 | ≥ 3 each | — | ≥ 3 each |
| C4 | ≥ 3 | 1 | ≥ 4 |
| C5–C7 | ≥ 3 each | — | ≥ 3 each |
| C8 | ≥ 3 | 1 | ≥ 4 |
| C9–C12 | ≥ 3 each | — | ≥ 3 each |

That's at least 39 overrides; aim for about 40. Spread each rule's overrides across **different seams** where the shop has more than one relevant seam, so no single ghost tactic catches all of a rule's mutants.

## 3. File layout

```
apps/shop/src/mutants/
├── index.ts            imports every m-<id>.ts and exports overrides: MutantOverride[]
├── m-<id>.ts           one override per file (server-side logic or a server render override)
└── m-<id>.client.tsx   only when a render override needs client behaviour ('use client')
```

`index.ts` keeps the S01 export name and type exactly:
```ts
import type { MutantOverride } from '@poltergeist/protocol';
// imports of each m-<id> …
export const overrides: MutantOverride[] = [ /* … */ ];
```

## 4. Procedure (tasks.md follows this order)

1. Run `pnpm --filter @poltergeist/shop seams:list` and keep the list open.
2. For each rule C1–C12: write its overrides (§2 counts), one file each, with random ids (generate with `node -e "console.log(require('crypto').randomBytes(6).toString('hex'))"`).
3. Pick the 3 public demo overrides (C1, C4, C8). Each must make its hero oracle fire on the simplest path a ghost takes: pay twice; apply a coupon; load a product page.
4. Add every override to `index.ts`.
5. Write `bench/mutant-manifest.json`: `{ "version": 1, "mutants": [ { "id", "rule", "seam", "public" } … ] }`.
6. Run `pnpm --filter @poltergeist/scorer mutant-check`. For every entry that's not OK:
   - **undetected:** the override doesn't make any contract test of its rule fail. Make the mistake reach observable behaviour.
   - **wrong-rule:** it also breaks another rule. Narrow it.

   Repeat until `ok N · clean-suite PASS`.
7. Run `pnpm --filter @poltergeist/shop typecheck` and `pnpm --filter @poltergeist/shop build`.
8. Write `bench/manifest.sha256`: `node -e "const c=require('crypto'),f=require('fs');f.writeFileSync('bench/manifest.sha256',c.createHash('sha256').update(f.readFileSync('bench/mutant-manifest.json')).digest('hex')+'\n')"`.
9. Commit only the REQ-4.1 paths: `git add apps/shop/src/mutants bench/mutant-manifest.json bench/manifest.sha256 .kiro/specs/S03-mutation-engine`, then `git commit -m "S03: mutation engine (N mutants, ≥3 per rule)"`.

## 5. Notes

- `mutant-check` prints counts only, so running it never reveals mutants to anyone watching the output.
- The S05 oracle-level check will re-run every override through the real browser driver and the §7.1a oracles. mutant-maker re-runs `mutant-check` once after S05 and fixes any override reported as undetected at oracle level.
- Do not touch the clean seams, contract tests or any shop code outside `src/mutants/`. If an override seems impossible without changing shop code, report it to Lindokuhle instead.
