import { NextResponse, type NextRequest } from 'next/server';
import { sealToken, unsealToken, COOKIE, HEADER } from '@/lib/session';
import { hasServerSecret } from '@/lib/secret';

const MAX_AGE_MS = 30 * 60 * 1000;

export async function proxy(req: NextRequest) {
  const url = req.nextUrl.clone();
  const headers = new Headers(req.headers);
  headers.delete(HEADER); // REQ-8.5: never trust a client-sent session header

  // Server-to-server calls (possess, oracle) never mint a session or count against limits (design §5).
  if (hasServerSecret(req.headers)) return NextResponse.next({ request: { headers } });

  const m = url.pathname.match(/^\/s\/([^/]+)(\/.*)?$/);
  const bench = process.env['BENCH_MODE'] === '1';
  let token: string | null = null;
  let fromPath = false;

  if (m) {
    const raw = decodeURIComponent(m[1]!);
    const t = await unsealToken(raw);
    const dest = req.headers.get('sec-fetch-dest');
    const site = req.headers.get('sec-fetch-site');
    const fresh = t ? Date.now() - t.iat < MAX_AGE_MS : false;
    const okCtx = dest === 'iframe' || site === 'same-origin';
    if (t && ((fresh && okCtx) || bench)) { token = raw; fromPath = true; }
    url.pathname = m[2] ?? '/';
    headers.set('x-pg-prefix', fromPath ? `/s/${m[1]}` : '');
  }
  if (!token) {
    const c = req.cookies.get(COOKIE)?.value;
    if (c && (await unsealToken(c))) token = c;
  }
  let minted = false;
  if (!token) {
    token = await sealToken({ sid: crypto.randomUUID(), mutants: [], iat: Date.now(), hid: null });
    minted = true;
  }
  headers.set(HEADER, token);
  const res = m ? NextResponse.rewrite(url, { request: { headers } }) : NextResponse.next({ request: { headers } });
  if (fromPath || minted) {
    res.cookies.set(COOKIE, token, { httpOnly: true, secure: true, sameSite: 'none', partitioned: true, path: '/' });
  }
  return res;
}

export const config = { matcher: ['/((?!_next/static|_next/image|favicon.ico|.well-known).*)'] };
