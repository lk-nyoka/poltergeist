/**
 * Shared HTTP helpers (design §10): ApiError, the one route wrapper, and the server-only secret checks.
 */
import { ZodError, type ZodType } from 'zod';
import { hasBenchSecret, hasServerSecret } from '@/lib/secret';
import { unsealToken, type SessionToken } from '@/lib/session';

const FRIENDLY: Record<string, string> = {
  bad_request: "That request wasn't quite right.",
  bad_quantity: 'Quantity must be a whole number from 1 to 10.',
  bad_coupon: "That coupon code isn't valid.",
  bad_text: 'Text must be 1–100 characters with no control characters.',
  coupon_already_applied: 'This cart already has a coupon.',
  empty_cart: 'Your cart is empty.',
  stale_intent: 'This checkout is out of date. Please reopen checkout.',
  missing_key: 'Missing Idempotency-Key header.',
  no_product: "We couldn't find that product.",
  no_line: "That product isn't in your cart.",
  not_found: 'Not found.',
  no_mutants: 'Not enough mutants available.',
  rate_limited: 'Too many requests. Please slow down.',
  payment_in_progress: 'Payment is still being processed. Please try again.',
  unhealthy: 'The store is not reachable.',
  internal: 'Something broke on our side.',
};

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;

  constructor(status: number, code: string, message?: string) {
    super(message ?? FRIENDLY[code] ?? 'Something went wrong with that request.');
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

/** The one error body shape: `{ error: { code, message } }` (REQ-7.1). */
export function errorResponse(status: number, code: string, message?: string): Response {
  return Response.json({ error: { code, message: message ?? FRIENDLY[code] ?? FRIENDLY['bad_request'] } }, { status });
}

/**
 * REQ-7.2: validation problems become 4xx; only genuine bugs surface as 500.
 * The 500 is returned as a Response (not rethrown) so the Crash oracle sees the status.
 */
type CtxArgs<C> = unknown extends C ? [ctx?: C] : [ctx: C];

export function handle<C = unknown>(fn: (req: Request, ctx: C) => Promise<Response>) {
  return async (req: Request, ...rest: CtxArgs<C>): Promise<Response> => {
    try {
      return await fn(req, rest[0] as C);
    } catch (e) {
      if (e instanceof ApiError) return errorResponse(e.status, e.code, e.message);
      if (e instanceof ZodError || e instanceof SyntaxError) return errorResponse(400, 'bad_request');
      console.error('[shop] unhandled error', e);
      return errorResponse(500, 'internal');
    }
  };
}

/** Reads a JSON body; malformed or empty JSON is a 400, never a crash. */
export async function readJson(req: Request): Promise<unknown> {
  try {
    return await req.json();
  } catch {
    throw new ApiError(400, 'bad_request');
  }
}

/** Reads and validates a JSON body with a (strict) zod schema. */
export async function parseBody<T>(req: Request, schema: ZodType<T>): Promise<T> {
  return schema.parse(await readJson(req));
}

/** REQ-10.1: server-only routes answer 404 (not 401) so they don't reveal themselves. */
export function requireSecret(req: Request): void {
  if (!hasServerSecret(req.headers)) throw new ApiError(404, 'not_found');
}

/** REQ-10.2: `{mutantIds}` also needs BENCH_MODE=1 and the bench secret. */
export function requireBench(req: Request): void {
  if (process.env['BENCH_MODE'] !== '1' || !hasBenchSecret(req.headers)) throw new ApiError(404, 'not_found');
}

/** REQ-10.4: the session under observation, named by `x-pg-observe`. Never the caller's own cookie. */
export async function observedSession(req: Request): Promise<SessionToken> {
  const raw = req.headers.get('x-pg-observe');
  const t = raw ? await unsealToken(raw) : null;
  if (!t) throw new ApiError(400, 'bad_request', 'Missing or invalid x-pg-observe token.');
  return t;
}
