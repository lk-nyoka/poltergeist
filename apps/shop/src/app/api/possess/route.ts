import { randomInt } from 'node:crypto';
import { PossessOptions } from '@poltergeist/protocol';
import { ApiError, handle, parseBody, requireBench, requireSecret } from '@/lib/http';
import { sealToken, unsealToken } from '@/lib/session';
import { getOverrides } from '@/seams/registry';

/** Fisher–Yates with a CSPRNG; returns n distinct items. */
function pick<T>(items: readonly T[], n: number): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = randomInt(i + 1);
    [a[i], a[j]] = [a[j]!, a[i]!];
  }
  return a.slice(0, n);
}

/**
 * Server-only (REQ-10.1/10.2). Mints a sealed session token and returns ONLY `{ token }`.
 * The shop never reads the manifest: it picks from the overrides' own `public` flag.
 */
export const POST = handle(async (req) => {
  requireSecret(req);
  const opts = await parseBody(req, PossessOptions);

  let mutants: string[];
  let hid: string | null = null;

  if ('clean' in opts) {
    mutants = [];
  } else if ('count' in opts) {
    const pool = getOverrides().filter((o) => !o.public);
    if (pool.length < opts.count) throw new ApiError(409, 'no_mutants');
    mutants = pick(pool.map((o) => o.id), opts.count);
  } else if ('demo' in opts) {
    mutants = getOverrides().filter((o) => o.public).map((o) => o.id);
    if (mutants.length === 0) throw new ApiError(409, 'no_mutants');
  } else if ('cloneOf' in opts) {
    const source = await unsealToken(opts.cloneOf);
    if (!source) throw new ApiError(400, 'bad_request', 'cloneOf is not a valid session token.');
    mutants = [...source.mutants];
    hid = source.hid;
  } else {
    requireBench(req); // BENCH_MODE=1 and x-poltergeist-bench === BENCH_SECRET
    const known = new Set(getOverrides().map((o) => o.id));
    if (!opts.mutantIds.every((id) => known.has(id))) throw new ApiError(400, 'bad_request', 'Unknown mutant id.');
    mutants = [...new Set(opts.mutantIds)];
  }

  // A brand-new session every time: fresh sid and issue time.
  const token = await sealToken({ sid: crypto.randomUUID(), mutants, iat: Date.now(), hid });
  return Response.json({ token });
});
