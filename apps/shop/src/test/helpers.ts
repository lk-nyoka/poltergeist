/** Test-only helpers. Never import from application code. */
import { sealToken, unsealToken } from '@/lib/session';

export async function newSession(mutants: string[] = [], hid: string | null = null) {
  const token = await sealToken({ sid: crypto.randomUUID(), mutants, iat: Date.now(), hid });
  const sid = (await unsealToken(token))!.sid;
  return { token, sid };
}

type Opts = {
  /** Sent as x-pg-session, exactly as the proxy would forward it. */
  token?: string;
  /** Objects are JSON-encoded; strings are sent raw (to test malformed JSON). */
  body?: unknown;
  headers?: Record<string, string>;
};

export function makeRequest(method: string, path: string, opts: Opts = {}): Request {
  const headers = new Headers(opts.headers);
  if (opts.token) headers.set('x-pg-session', opts.token);
  let body: string | undefined;
  if (opts.body !== undefined) {
    body = typeof opts.body === 'string' ? opts.body : JSON.stringify(opts.body);
    if (!headers.has('content-type')) headers.set('content-type', 'application/json');
  }
  return new Request(`http://localhost:3000${path}`, { method, headers, body });
}

export async function json<T = Record<string, unknown>>(res: Response): Promise<T> {
  return (await res.json()) as T;
}

/** Runs fn with env vars set, restoring them afterwards. `undefined` deletes a var. */
export async function withEnv<T>(vars: Record<string, string | undefined>, fn: () => Promise<T>): Promise<T> {
  const saved: Record<string, string | undefined> = {};
  for (const [k, v] of Object.entries(vars)) {
    saved[k] = process.env[k];
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
  try {
    return await fn();
  } finally {
    for (const [k, v] of Object.entries(saved)) {
      if (v === undefined) delete process.env[k];
      else process.env[k] = v;
    }
  }
}
