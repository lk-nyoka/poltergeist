// @vitest-environment node
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, it, expect } from 'vitest';
import { PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER } from 'next/constants';
import config, { buildCsp } from '../../next.config';

const ORIGIN = 'https://seance.example.test';

async function headerMap(phase: string, env: Record<string, string | undefined> = {}) {
  const saved = process.env['SEANCE_ORIGIN'];
  if (env['SEANCE_ORIGIN'] === undefined) delete process.env['SEANCE_ORIGIN'];
  else process.env['SEANCE_ORIGIN'] = env['SEANCE_ORIGIN'];
  try {
    const rules = await config(phase).headers!();
    expect(rules).toHaveLength(1);
    expect(rules[0]!.source).toBe('/:path*');
    return new Map(rules[0]!.headers.map((h) => [h.key, h.value]));
  } finally {
    if (saved === undefined) delete process.env['SEANCE_ORIGIN'];
    else process.env['SEANCE_ORIGIN'] = saved;
  }
}

describe('shop headers (REQ-12.1, REQ-12.2)', () => {
  it('production CSP is exactly the specified policy', () => {
    expect(buildCsp(ORIGIN, false)).toBe(
      "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; " +
        "connect-src 'self'; img-src 'self' data:; font-src 'self'; object-src 'none'; base-uri 'self'; " +
        `form-action 'self'; frame-ancestors ${ORIGIN}`,
    );
  });

  it("'unsafe-eval' appears in script-src in development only", async () => {
    const dev = (await headerMap(PHASE_DEVELOPMENT_SERVER, { SEANCE_ORIGIN: ORIGIN })).get('Content-Security-Policy')!;
    expect(dev).toContain("script-src 'self' 'unsafe-inline' 'unsafe-eval';");
    for (const phase of [PHASE_PRODUCTION_BUILD, PHASE_PRODUCTION_SERVER]) {
      const prod = (await headerMap(phase, { SEANCE_ORIGIN: ORIGIN })).get('Content-Security-Policy')!;
      expect(prod).not.toContain('unsafe-eval');
    }
  });

  it('never uses nonces, hashes or strict-dynamic (they would disable unsafe-inline and hide C7 mutants)', async () => {
    for (const phase of [PHASE_DEVELOPMENT_SERVER, PHASE_PRODUCTION_SERVER]) {
      const csp = (await headerMap(phase, { SEANCE_ORIGIN: ORIGIN })).get('Content-Security-Policy')!;
      expect(csp).not.toMatch(/nonce-|sha256-|sha384-|sha512-|strict-dynamic/);
      expect(csp).toContain("script-src 'self' 'unsafe-inline'");
    }
  });

  it('frame-ancestors comes from SEANCE_ORIGIN, with a localhost default for dev and tests', async () => {
    const set = (await headerMap(PHASE_PRODUCTION_SERVER, { SEANCE_ORIGIN: ORIGIN })).get('Content-Security-Policy')!;
    expect(set.endsWith(`frame-ancestors ${ORIGIN}`)).toBe(true);
    const unset = (await headerMap(PHASE_PRODUCTION_SERVER)).get('Content-Security-Policy')!;
    expect(unset.endsWith('frame-ancestors http://localhost:3001')).toBe(true);
  });

  it('sends X-Robots-Tag: noindex and no X-Frame-Options', async () => {
    const h = await headerMap(PHASE_PRODUCTION_SERVER, { SEANCE_ORIGIN: ORIGIN });
    expect(h.get('X-Robots-Tag')).toBe('noindex');
    expect([...h.keys()].map((k) => k.toLowerCase())).not.toContain('x-frame-options');
  });

  it('keeps the protocol package transpiled so its source imports resolve under Next', () => {
    expect(config(PHASE_PRODUCTION_BUILD).transpilePackages).toContain('@poltergeist/protocol');
  });
});

describe('/.well-known/security.txt (REQ-12.3)', () => {
  const text = readFileSync(fileURLToPath(new URL('../../public/.well-known/security.txt', import.meta.url)), 'utf8');

  it('has the required Contact and Expires fields', () => {
    expect(text).toMatch(/^Contact: https:\/\/github\.com\/lk-nyoka\/poltergeist\/issues$/m);
    const expires = text.match(/^Expires: (.+)$/m)?.[1];
    expect(expires).toBeDefined();
    expect(Date.parse(expires!)).toBeGreaterThan(Date.parse('2027-01-29')); // judging ends 29 Jan 2027
  });

  it('says it is an intentionally vulnerable, per-session sandboxed demo', () => {
    expect(text).toMatch(/intentionally vulnerable/i);
    expect(text).toMatch(/per-session sandbox/i);
  });
});
