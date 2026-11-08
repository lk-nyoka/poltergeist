# Tech
- TypeScript strict everywhere. pnpm workspaces (pin "packageManager": "pnpm@<exact>") + Turborepo. Node 22.
- Workspace package names: @poltergeist/<folder name> (e.g. @poltergeist/driver-playwright).
- Apps: Next.js 16 (App Router; request interception lives in proxy.ts) + Tailwind. seance and shop are two separate
  Vercel Hobby projects (separate, cross-site origins). landing is a static export on GitHub Pages.
- Iframe src and allowed origins come from env vars holding the production domains (<project>.vercel.app), never VERCEL_URL.
- Shop CSP: "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; connect-src 'self';
  img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; form-action 'self';
  frame-ancestors <SEANCE_ORIGIN from env>" (+ 'unsafe-eval' in dev only). Never add nonces, hashes or strict-dynamic.
  No X-Frame-Options. X-Robots-Tag: noindex.
- Shop sessions: iron-session sealed token. Cookie __Host-pg_sid (HttpOnly; Secure; SameSite=None; Partitioned; Path=/).
  The /s/[token]/ path token wins when it is under 30 minutes old AND (Sec-Fetch-Dest: iframe OR Sec-Fetch-Site: same-origin);
  proxy.ts then re-sets the cookie and rewrites to the plain route. Any other path token (top-level document, or a cross-site non-iframe request) → fresh empty session.
  BENCH_MODE=1 waives both checks (local only). Build every in-shop URL with shopUrl(path). Create sessions only in proxy.ts
  or Route Handlers.
- Shop dialogs: custom <div role="dialog" aria-modal="true"> with a JS focus trap and a keydown Escape handler; never <dialog>.
- Shop functions: wrap every exported pricing, session, data-access, validation and render function with seam('<module>/<export>', fn).
- Data: Supabase Free. Server-only access with the sb_secret_ key. RLS enabled with zero policies on every table.
  Every shop query is scoped by session_id through the data-access seams. Benchmarks use the bench schema.
- Testing: Vitest + fast-check property tests (100 runs on save, 1000 in CI); Playwright for e2e and the PlaywrightDriver;
  axe-core for accessibility. The Glitch uses fc.check (never fc.assert) with interruptAfterTimeLimit.
- Validation: zod schemas in packages/protocol for every message, step, finding and certificate (safeParse, strip unknown keys).
- LLM: Gemini API free tier. packages/ghost-core/src/llm.ts is only an Llm interface; the Séance Room implements it via its
  server route POST /api/narrate (GEMINI_API_KEY server-only, never NEXT_PUBLIC_, per-IP limits); the CLI has a Node
  implementation. Template fallback for no key, rate limits or per-IP limits. Shop text sent to the LLM is untrusted data. No LLM in the Poltergeist side of the benchmark.
- postMessage: always an explicit targetOrigin; check event.origin AND event.source.
- No paid services. No new dependency without a one-line reason in the spec's design.md.
- Windows 11 + PowerShell is the dev machine: scripts must be cross-platform (node scripts or cross-env, no bash-only commands).
- Never read or write apps/shop/src/mutants/**, bench/mutant-manifest.json, bench/manifest.sha256, bench/.private/** or
  .kiro/specs/S03-mutation-engine/** unless you are the mutant-maker agent (bench/.private is written only by the scorer). Never run repo-wide search, git show, git log -p
  or git diff without excluding those paths.
