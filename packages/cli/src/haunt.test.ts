import { describe, expect, it, vi } from 'vitest';
import { FakeDriver, fakeObserver, type FaultName } from '@poltergeist/ghost-core';
import { assertOwnership, emptyObserver } from '@poltergeist/driver-playwright';
import { main } from './cli';
import { parseHauntArgs } from './args';
import { haunt, type Ghost, type HauntDeps, type LaunchRequest } from './haunt';

const TOKEN = 'pg-test-token-0123456789';

function setup(opts: { faults?: FaultName[]; shop?: boolean; ghosts?: HauntDeps['ghosts']; env?: Record<string, string> } = {}) {
  const files = new Map<string, string>();
  const logs: string[] = [];
  const launch = vi.fn(async (_req: LaunchRequest) => {
    const driver = new FakeDriver({ seed: 1, faults: opts.faults ?? [] });
    return {
      driver,
      observer: opts.shop === false ? emptyObserver : fakeObserver(driver.shop),
      close: async () => {},
    };
  });
  const detectShop = vi.fn(async () => opts.shop !== false);
  const deps: HauntDeps = {
    env: { SEANCE_SERVER_SECRET: 'secret', POLTERGEIST_OWNERSHIP_TOKEN: TOKEN, ...opts.env },
    assertOwnership: (url, token, d) => assertOwnership(url, token, { ...d, lookup: async () => ['93.184.216.34'], fetch: noFetch }),
    detectShop,
    launch,
    ghosts: opts.ghosts ?? {},
    log: (l) => logs.push(l),
    mkdir: async () => {},
    writeFile: async (p, t) => {
      files.set(p.replace(/\\/g, '/'), t);
    },
  };
  return { deps, files, logs, launch, detectShop };
}

const noFetch = (async () => {
  throw new Error('no network in tests');
}) as never;

const opts = (extra: string[] = []) => parseHauntArgs(['haunt', 'http://127.0.0.1:3000', '--out', '/out', ...extra]);

/** Double-clicks Pay on a checkout: the Impatient One's first attack, written by hand for this test. */
const doublePayer: Ghost = {
  id: 'impatient',
  async run({ driver }) {
    await driver.goto('/');
    const link = (await driver.query('a')).find((l) => !/home|cart/i.test(l.name))!;
    await driver.click({ role: 'link', name: link.name });
    await driver.click({ role: 'button', name: 'Add to cart' });
    await driver.goto('/cart');
    await driver.click({ role: 'button', name: 'Checkout' });
    await driver.type({ role: 'textbox', name: 'Name' }, 'Ada');
    await driver.type({ role: 'textbox', name: 'Address' }, '1 Road');
    await driver.click({ role: 'button', name: 'Pay' }, { count: 2, delayMs: 30 });
  },
};

describe('haunt: ownership gate comes first', () => {
  it('refuses a non-loopback host with no token on the site, before any browser starts', async () => {
    const t = setup();
    const r = await haunt(parseHauntArgs(['haunt', 'https://example.org/']), t.deps);
    expect(r.exitCode).toBe(2);
    expect(r.report.ownership.allowed).toBe(false);
    expect(t.launch).not.toHaveBeenCalled();
    expect(t.detectShop).not.toHaveBeenCalled();
    expect(t.logs.join('\n')).toContain(TOKEN);
    expect(t.logs.join('\n')).toContain('.well-known/poltergeist.txt');
  });

  it.each(['http://10.0.0.5/', 'http://169.254.169.254/'])('refuses %s', async (url) => {
    const t = setup();
    const r = await haunt(parseHauntArgs(['haunt', url]), t.deps);
    expect(r.exitCode).toBe(2);
    expect(t.launch).not.toHaveBeenCalled();
  });

  it('refuses a too-short POLTERGEIST_OWNERSHIP_TOKEN', async () => {
    const t = setup({ env: { POLTERGEIST_OWNERSHIP_TOKEN: 'short' } });
    expect((await haunt(opts(), t.deps)).exitCode).toBe(2);
    expect(t.launch).not.toHaveBeenCalled();
  });

  it('generates and prints a token when none is given', async () => {
    const t = setup({ env: { POLTERGEIST_OWNERSHIP_TOKEN: undefined as never } });
    await haunt(opts(), t.deps);
    expect(t.logs[0]).toMatch(/^Ownership token for this run: pg-[0-9a-f]{32}$/);
  });

  it('allows loopback with no token file', async () => {
    const t = setup();
    const r = await haunt(opts(), t.deps);
    expect(r.report.ownership).toMatchObject({ allowed: true, method: 'loopback' });
    expect(t.launch).toHaveBeenCalledOnce();
  });
});

describe('haunt: pipeline on the fake shop', () => {
  it('a clean shop yields no findings, no files, exit 0', async () => {
    const t = setup();
    const r = await haunt(opts(), t.deps);
    expect(r).toMatchObject({ exitCode: 0, report: { kind: 'shop', findings: [], critical: 0 } });
    expect(t.files.size).toBe(0);
  });

  it('skips ghosts that do not exist yet and says so', async () => {
    const t = setup();
    const r = await haunt(opts(['--ghosts', 'glitch,night-owl']), t.deps);
    expect(r.report.ghosts).toEqual({ ran: [], skipped: ['glitch', 'night-owl'] });
  });

  it('a verified Medium finding writes a certificate and a test and exits 0', async () => {
    const t = setup({ faults: ['dropAlt'] });
    const r = await haunt(opts(), t.deps);
    expect(r.exitCode).toBe(0);
    const f = r.report.findings.find((x) => x.oracle === 'A11yViolation')!;
    expect(f).toMatchObject({ rule: 'C8', severity: 'Medium', cleanSilent: true });
    expect(f.reproduction.fired).toBeGreaterThanOrEqual(1);
    const [md] = [...t.files].filter(([p]) => p.endsWith('.md'));
    expect(md![0]).toMatch(/^\/?.*\/out\/01-A11yViolation-C8\.md$/);
    expect(md![1]).toContain('Cause of death:** A11yViolation');
    expect([...t.files.keys()].some((p) => p.endsWith('.spec.ts'))).toBe(true);
  });

  it('a verified Critical finding exits non-zero', async () => {
    const t = setup({ faults: ['skipClaim'], ghosts: { impatient: doublePayer } });
    const r = await haunt(opts(['--ghosts', 'impatient']), t.deps);
    expect(r.report.ghosts.ran).toEqual(['impatient']);
    expect(r.report.findings.map((f) => f.oracle)).toContain('DoubleCharge');
    expect(r.report.critical).toBeGreaterThan(0);
    expect(r.exitCode).toBe(1);
    const spec = [...t.files].find(([p]) => p.endsWith('DoubleCharge-C1.spec.ts'))!;
    expect(spec[1]).toContain('/api/oracle/ledgers');
  });

  it('the same ghost on a clean shop finds nothing', async () => {
    const t = setup({ ghosts: { impatient: doublePayer } });
    const r = await haunt(opts(['--ghosts', 'impatient']), t.deps);
    expect(r).toMatchObject({ exitCode: 0, report: { findings: [] } });
  });

  it('--bench writes nothing to disk', async () => {
    const t = setup({ faults: ['dropAlt'] });
    const r = await haunt(opts(['--bench']), t.deps);
    expect(r.report.findings.length).toBeGreaterThan(0);
    expect(r.report.findings.every((f) => f.files === null)).toBe(true);
    expect(t.files.size).toBe(0);
  });
});

describe('haunt: a site that is not the Haunted Shop', () => {
  it('runs only DOM/HTTP oracles: the Critical money bug is out of reach', async () => {
    const t = setup({ faults: ['skipClaim', 'dropAlt'], shop: false, ghosts: { impatient: doublePayer } });
    const r = await haunt(opts(['--ghosts', 'impatient']), t.deps);
    expect(r.report.kind).toBe('site');
    const names = r.report.findings.map((f) => f.oracle);
    expect(names).toContain('A11yViolation');
    expect(names).not.toContain('DoubleCharge');
    expect(r.report.findings.every((f) => f.cleanSilent === null)).toBe(true);
    expect(r.exitCode).toBe(0);
    const spec = [...t.files].find(([p]) => p.endsWith('.spec.ts'))![1];
    expect(spec).not.toContain('/api/possess');
  });
});

describe('main', () => {
  const run = async (argv: string[], t = setup({ faults: ['dropAlt'] })) => {
    const out: string[] = [];
    const err: string[] = [];
    const code = await main(argv, t.deps.env, { out: (l) => out.push(l), err: (l) => err.push(l) }, (_env, log) => ({ ...t.deps, log }));
    return { code, out, err, t };
  };

  it('--bench prints exactly one JSON line on stdout and keeps progress on stderr', async () => {
    const { code, out, err } = await run(['haunt', 'http://127.0.0.1:3000', '--bench']);
    expect(code).toBe(0);
    expect(out).toHaveLength(1);
    const report = JSON.parse(out[0]!);
    expect(report).toMatchObject({ schema: 1, kind: 'shop', ownership: { allowed: true } });
    expect(JSON.stringify(report)).not.toContain(TOKEN);
    expect(err.join('\n')).toContain('Arriving');
  });

  it('bad usage exits 2 with the usage text', async () => {
    const { code, err } = await run(['haunt']);
    expect(code).toBe(2);
    expect(err.join('\n')).toContain('Usage: poltergeist haunt');
  });

  it('a refused target exits 2', async () => {
    expect((await run(['haunt', 'http://192.168.1.10/'])).code).toBe(2);
  });
});
