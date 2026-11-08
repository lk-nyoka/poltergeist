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

```powershell
# Node 22 required (.nvmrc)
pnpm install
pnpm test        # must exit 0
```

## Kiro

This project was built with the [Kiro IDE](https://kiro.dev) as part of Kiroween 2026. The `.kiro/` directory is committed and contains specs, hooks, steering files and custom agents.
