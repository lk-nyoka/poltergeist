import { sealData, unsealData } from 'iron-session';

export type SessionToken = { sid: string; mutants: string[]; iat: number; hid: string | null };

const password = () => {
  const p = process.env['SESSION_SECRET'];
  if (p && p.length >= 32) return p;
  if (process.env['NODE_ENV'] === 'production') throw new Error('SESSION_SECRET must be set (≥32 chars)');
  return 'dev-only-secret-at-least-32-characters-long!!';
};

export const sealToken = (t: SessionToken) => sealData(t, { password: password(), ttl: 0 });

export async function unsealToken(s: string): Promise<SessionToken | null> {
  try {
    const t = await unsealData<SessionToken>(s, { password: password(), ttl: 0 });
    return t && typeof t.sid === 'string' && Array.isArray(t.mutants) ? t : null;
  } catch {
    return null;
  }
}

export const COOKIE = '__Host-pg_sid';
export const HEADER = 'x-pg-session';
