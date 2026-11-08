import { timingSafeEqual } from 'node:crypto';

/** Constant-time string compare; false when either side is missing (design §10.2). */
export function safeEqual(given: string | null | undefined, expected: string | undefined): boolean {
  if (!given || !expected) return false;
  const a = Buffer.from(given);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

/** True when the request carries the Séance server-to-server secret. */
export const hasServerSecret = (h: Headers) =>
  safeEqual(h.get('x-poltergeist-secret'), process.env['SEANCE_SERVER_SECRET']);

/** True when the request also carries the benchmark secret (only meaningful with BENCH_MODE=1). */
export const hasBenchSecret = (h: Headers) =>
  safeEqual(h.get('x-poltergeist-bench'), process.env['BENCH_SECRET']);
