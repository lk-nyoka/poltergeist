import { PossessOptions } from '@poltergeist/protocol';

export type ShopPossessConfig = {
  baseUrl: string;
  /** SEANCE_SERVER_SECRET. Server-side only. */
  serverSecret: string;
  /** BENCH_SECRET, needed for `{mutantIds}` possessions (the shop also needs BENCH_MODE=1). */
  benchSecret?: string;
};

/** Calls the shop's server-only POST /api/possess and returns the sealed session token. */
export function httpPossess(cfg: ShopPossessConfig): (opts: PossessOptions) => Promise<string> {
  return async (opts) => {
    const parsed = PossessOptions.parse(opts);
    const headers: Record<string, string> = { 'content-type': 'application/json', 'x-poltergeist-secret': cfg.serverSecret };
    if (cfg.benchSecret) headers['x-poltergeist-bench'] = cfg.benchSecret;
    const res = await fetch(new URL('/api/possess', cfg.baseUrl), {
      method: 'POST',
      headers,
      body: JSON.stringify(parsed),
      redirect: 'error',
    });
    if (!res.ok) throw new Error(`possess failed: HTTP ${res.status}`);
    const body = (await res.json()) as { token?: unknown };
    if (typeof body.token !== 'string' || body.token === '') throw new Error('possess returned no token');
    return body.token;
  };
}
