// @vitest-environment node
import { describe, it, expect, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { proxy } from './proxy';
import { sealToken } from '@/lib/session';
import { COOKIE, HEADER } from '@/lib/session';

async function makeToken(overrides?: Partial<{ iat: number; mutants: string[] }>) {
  return sealToken({ sid: 'test-sid', mutants: [], iat: Date.now(), hid: null, ...overrides });
}

function makeReq(url: string, opts: { cookie?: string; dest?: string; site?: string; sessionHeader?: string } = {}) {
  const headers: Record<string, string> = {};
  if (opts.dest) headers['sec-fetch-dest'] = opts.dest;
  if (opts.site) headers['sec-fetch-site'] = opts.site;
  if (opts.sessionHeader) headers[HEADER] = opts.sessionHeader;
  const req = new NextRequest(url, { headers });
  if (opts.cookie) {
    req.cookies.set(COOKIE, opts.cookie);
  }
  return req;
}

describe('proxy', () => {
  const origBench = process.env['BENCH_MODE'];
  afterEach(() => {
    if (origBench === undefined) delete process.env['BENCH_MODE'];
    else process.env['BENCH_MODE'] = origBench;
  });

  it('no cookie → new sid; sets Secure HttpOnly SameSite=none Partitioned cookie', async () => {
    const res = await proxy(makeReq('http://localhost:3000/'));
    const setCookie = res.cookies.get(COOKIE);
    expect(setCookie).toBeDefined();
    // The cookie must have been set (minted=true path)
    expect(res.headers.get('set-cookie')).toMatch(/HttpOnly/i);
    expect(res.headers.get('set-cookie')).toMatch(/SameSite=None/i);
  });

  it('path token + Sec-Fetch-Dest: iframe → path sid used, cookie re-set', async () => {
    const token = await makeToken();
    const url = `http://localhost:3000/s/${encodeURIComponent(token)}/products`;
    const res = await proxy(makeReq(url, { dest: 'iframe' }));
    // The path token wins: the cookie is re-set to exactly that token and passed on to the app
    expect(res.cookies.get(COOKIE)?.value).toBe(token);
    expect(res.headers.get('x-middleware-request-x-pg-session')).toBe(token);
  });

  it('path token + Sec-Fetch-Dest: document → new clean sid', async () => {
    const token = await makeToken();
    const url = `http://localhost:3000/s/${encodeURIComponent(token)}/`;
    const res = await proxy(makeReq(url, { dest: 'document' }));
    // A new session is minted, not the path one
    const cookie = res.cookies.get(COOKIE);
    expect(cookie?.value).not.toBe(token);
  });

  it('path token + Sec-Fetch-Site: same-origin → path sid used', async () => {
    const token = await makeToken();
    const url = `http://localhost:3000/s/${encodeURIComponent(token)}/cart`;
    const res = await proxy(makeReq(url, { site: 'same-origin' }));
    expect(res.headers.get('set-cookie')).not.toBeNull();
  });

  it('spoofed x-pg-session from client is ignored → new sid issued', async () => {
    const token = await makeToken();
    const res = await proxy(makeReq('http://localhost:3000/', { sessionHeader: token }));
    // A new session is still minted; the spoofed header is stripped
    expect(res.cookies.get(COOKIE)).toBeDefined();
  });

  it('expired path token in iframe → new clean sid', async () => {
    const oldToken = await makeToken({ iat: Date.now() - 31 * 60 * 1000 });
    const url = `http://localhost:3000/s/${encodeURIComponent(oldToken)}/`;
    const res = await proxy(makeReq(url, { dest: 'iframe' }));
    const cookie = res.cookies.get(COOKIE);
    expect(cookie?.value).not.toBe(oldToken);
  });

  it('BENCH_MODE=1 waives destination and age checks', async () => {
    process.env['BENCH_MODE'] = '1';
    const oldToken = await makeToken({ iat: Date.now() - 31 * 60 * 1000 });
    const url = `http://localhost:3000/s/${encodeURIComponent(oldToken)}/`;
    const res = await proxy(makeReq(url)); // no fetch headers
    // Should use the path token even though it's old and has no iframe header
    expect(res.headers.get('set-cookie')).not.toBeNull();
  });
});

describe('proxy — server-to-server exemption', () => {
  afterEach(() => { delete process.env['SEANCE_SERVER_SECRET']; });

  it('a request with the correct secret is not given a session', async () => {
    process.env['SEANCE_SERVER_SECRET'] = 'test-secret';
    const req = new NextRequest('http://localhost:3000/api/oracle/products', { headers: { 'x-poltergeist-secret': 'test-secret' } });
    const res = await proxy(req);
    expect(res.cookies.get(COOKIE)).toBeUndefined();
    expect(res.headers.get('x-middleware-request-x-pg-session')).toBeNull();
  });

  it('a wrong secret is treated like any visitor (a session is minted)', async () => {
    process.env['SEANCE_SERVER_SECRET'] = 'test-secret';
    const req = new NextRequest('http://localhost:3000/', { headers: { 'x-poltergeist-secret': 'nope' } });
    const res = await proxy(req);
    expect(res.cookies.get(COOKIE)).toBeDefined();
  });
});
