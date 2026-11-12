import { ApiError } from '@/lib/http';
import { hasServerSecret } from '@/lib/secret';

/**
 * In-memory token bucket per instance and per client IP (design §11).
 * Limits are per 10 minutes and sit well above 5 full hosted hauntings per 10 minutes.
 */
const WINDOW_MS = 10 * 60 * 1000;
const LIMITS = { checkout: 60, reviews: 60, mint: 120 } as const;
export type LimitName = keyof typeof LIMITS;

type Bucket = { tokens: number; at: number };
const buckets = new Map<string, Bucket>();
const MAX_BUCKETS = 10_000;

/** First address of x-forwarded-for (set by the platform), else 'local'. */
export function clientIp(h: Headers): string {
  return h.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
}

/** Takes one token; returns false when the bucket is empty. */
export function take(name: LimitName, ip: string, now = Date.now()): boolean {
  const cap = LIMITS[name];
  const key = `${name}:${ip}`;
  const prev = buckets.get(key);
  const tokens = prev ? Math.min(cap, prev.tokens + ((now - prev.at) * cap) / WINDOW_MS) : cap;
  if (tokens < 1) {
    buckets.set(key, { tokens, at: now });
    return false;
  }
  if (buckets.size >= MAX_BUCKETS) pruneFull(now);
  buckets.set(key, { tokens: tokens - 1, at: now });
  return true;
}

/** Drop buckets that have fully refilled; they carry no information. */
function pruneFull(now: number) {
  for (const [k, b] of buckets) {
    const cap = LIMITS[k.slice(0, k.indexOf(':')) as LimitName];
    if (b.tokens + ((now - b.at) * cap) / WINDOW_MS >= cap) buckets.delete(k);
  }
}

/**
 * REQ-12.5: throws 429 `rate_limited` when the caller is over the limit.
 * Skipped for BENCH_MODE=1 and for requests carrying the server-to-server secret.
 */
export function checkLimit(name: LimitName, req: Request): void {
  if (process.env['BENCH_MODE'] === '1' || hasServerSecret(req.headers)) return;
  if (!take(name, clientIp(req.headers))) throw new ApiError(429, 'rate_limited');
}

/** Tests only. */
export function _resetRateLimitsForTest(): void {
  buckets.clear();
}
