import { headers } from 'next/headers';
import { unsealToken, HEADER } from '@/lib/session';
import { requestContext, type RequestCtx } from './registry';

async function ctxFromHeader(hdrs: Headers): Promise<RequestCtx> {
  const raw = hdrs.get(HEADER) ?? '';
  const t = raw ? await unsealToken(raw) : null;
  return {
    sid: t?.sid ?? crypto.randomUUID(),
    token: raw,
    mutants: new Set(t?.mutants ?? []),
  };
}

/** For route handlers: runs fn(ctx) inside the request context. */
export async function withRequest<T>(req: Request, fn: (ctx: RequestCtx) => Promise<T>): Promise<T> {
  const ctx = await ctxFromHeader(new Headers(req.headers));
  return requestContext.run(ctx, () => fn(ctx));
}

/** For server components: reads headers() from next/headers. */
export async function withPage<T>(fn: (ctx: RequestCtx) => Promise<T>): Promise<T> {
  const hdrs = await headers();
  const ctx = await ctxFromHeader(hdrs as unknown as Headers);
  return requestContext.run(ctx, () => fn(ctx));
}

/**
 * Runs fn with an empty mutant set (used by GET /api/oracle/products).
 * Needs no request headers, so it also works when a route handler is called directly in tests.
 */
export async function cleanContext<T>(fn: (ctx: RequestCtx) => Promise<T>): Promise<T> {
  const ctx: RequestCtx = { sid: '', token: '', mutants: new Set() };
  return requestContext.run(ctx, () => fn(ctx));
}

/** Runs fn as the session under observation (oracle routes). */
export async function observeContext<T>(token: string, fn: (ctx: RequestCtx) => Promise<T>): Promise<T> {
  const t = await unsealToken(token);
  const ctx: RequestCtx = {
    sid: t?.sid ?? '',
    token,
    mutants: new Set(t?.mutants ?? []),
  };
  return requestContext.run(ctx, () => fn(ctx));
}
