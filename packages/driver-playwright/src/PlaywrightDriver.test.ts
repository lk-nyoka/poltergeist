import { existsSync } from 'node:fs';
import { createServer, type Server } from 'node:http';
import type { AddressInfo } from 'node:net';
import { chromium } from 'playwright';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import type { PageEvent } from '@poltergeist/ghost-core';
import { PlaywrightDriver } from './PlaywrightDriver';
import { SHOP_ONLY_ORACLE_NAMES, SITE_ORACLE_NAMES, oraclesFor, runSiteOracles, siteObservation } from './site-oracles';
import type { OwnershipDecision } from './ownership';

const haveBrowser = existsSync(chromium.executablePath());

const PAGE = `<!doctype html><html lang="en"><head><title>fixture</title></head><body>
<main><h1>Fixture</h1>
<button id="nameless"><svg width="10" height="10"></svg></button>
<button aria-label="Named">Named</button>
<input aria-label="Field" id="f">
<a href="/two">Two</a><a href="https://elsewhere.invalid/">Away</a>
<script>window.__poltergeistBeacon && window.__poltergeistBeacon('tok-1');</script>
</main></body></html>`;

let server: Server;
let base = '';
let ownership: OwnershipDecision;

beforeAll(async () => {
  server = createServer((req, res) => {
    if (req.url === '/boom') {
      res.setHeader('content-type', 'text/html');
      res.end('<script>throw new Error("kaboom")</script>');
    } else if (req.url === '/api/echo') {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ cookie: req.headers.cookie ?? null }));
    } else if (req.url === '/api/fail') {
      res.statusCode = 503;
      res.end('{}');
    } else if (req.url === '/leave') {
      res.statusCode = 302;
      res.setHeader('location', 'http://localhost:1/');
      res.end();
    } else {
      res.setHeader('content-type', 'text/html');
      res.end(PAGE);
    }
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  ownership = { allowed: true, method: 'loopback', host: new URL(base).host, reason: 'test', addresses: ['127.0.0.1'] };
});
afterAll(() => new Promise<void>((r) => server.close(() => r())));

describe('PlaywrightDriver launch gate', () => {
  it('refuses to launch without a matching, allowed ownership decision', async () => {
    const refused = { ...ownership, allowed: false, method: null };
    await expect(PlaywrightDriver.launch({ baseUrl: base, kind: 'site', ownership: refused })).rejects.toThrow(/ownership/);
    const wrongHost = { ...ownership, host: 'other.example' };
    await expect(PlaywrightDriver.launch({ baseUrl: base, kind: 'site', ownership: wrongHost })).rejects.toThrow(/ownership/);
  });

  it('needs a possess function for a shop target', async () => {
    await expect(PlaywrightDriver.launch({ baseUrl: base, kind: 'shop', ownership })).rejects.toThrow(/possess/);
  });
});

describe('site oracle set', () => {
  it('constructs only the five DOM/HTTP oracles off the shop', () => {
    expect(oraclesFor('site').map((o) => o.name).sort()).toEqual([...SITE_ORACLE_NAMES].sort());
    for (const shopOnly of SHOP_ONLY_ORACLE_NAMES) {
      expect(oraclesFor('site').map((o) => o.name)).not.toContain(shopOnly);
    }
    expect(oraclesFor('shop')).toHaveLength(10);
  });
});

describe.skipIf(!haveBrowser)('PlaywrightDriver on a non-shop site (real Chromium)', () => {
  let d: PlaywrightDriver;
  const events: PageEvent[] = [];

  beforeAll(async () => {
    d = await PlaywrightDriver.launch({ baseUrl: base, kind: 'site', ownership });
    d.onEvent((e) => events.push(e));
  }, 60_000);
  afterAll(() => d?.close());

  it('navigates, queries elements with roles and names, and reports focus', async () => {
    await d.goto('/');
    expect(await d.currentPath()).toBe('/');
    const buttons = await d.query('button');
    expect(buttons.map((b) => b.name)).toEqual(['', 'Named']);
    expect(buttons.every((b) => b.role === 'button' && b.focusable)).toBe(true);
    await d.press('Tab');
    expect((await d.focused())?.role).toBe('button');
    await d.click({ role: 'link', name: 'Two' });
    expect(await d.currentPath()).toBe('/two');
    await d.back();
    expect(await d.currentPath()).toBe('/');
  }, 30_000);

  it('types into a field and keeps the contract text', async () => {
    await d.goto('/');
    await d.type({ role: 'textbox', name: 'Field' }, 'héllo 👻');
    expect((await d.query('#f'))[0]?.text).toBe('héllo 👻');
  }, 30_000);

  it('runs axe and the A11yViolation oracle flags the nameless button', async () => {
    await d.goto('/');
    const axe = await d.axe();
    expect(axe.map((v) => v.id)).toContain('button-name');
    const hits = runSiteOracles(siteObservation({ axe }));
    expect(hits.map((h) => h.oracle)).toContain('A11yViolation');
  }, 30_000);

  it('delivers beacons through the exposed function', async () => {
    events.length = 0;
    await d.goto('/');
    expect(events.filter((e) => e.kind === 'beacon').map((e) => e.detail)).toContain('tok-1');
    expect(runSiteOracles(siteObservation({ events })).map((h) => h.oracle)).toContain('ScriptExecution');
  }, 30_000);

  it('reports page errors and 5xx as Crash evidence', async () => {
    events.length = 0;
    await d.goto('/boom');
    const res = await d.request('GET', '/api/fail');
    expect(res.status).toBe(503);
    expect(events.map((e) => e.kind)).toEqual(expect.arrayContaining(['pageerror', 'http5xx']));
    expect(runSiteOracles(siteObservation({ events })).map((h) => h.oracle)).toContain('Crash');
  }, 30_000);

  it('request() returns parsed JSON', async () => {
    const res = await d.request('GET', '/api/echo');
    expect(res).toEqual({ status: 200, json: { cookie: null } });
  });

  it('never leaves the verified host, by goto, link or redirect', async () => {
    await expect(d.goto('https://elsewhere.invalid/')).rejects.toThrow(/verified host/);
    await d.goto('/');
    await d.click({ role: 'link', name: 'Away' }).catch(() => {});
    expect(await d.currentPath()).toBe('/');
    await expect(d.goto('/leave')).rejects.toThrow();
    expect(await d.currentPath()).toBe('/');
  }, 30_000);

  it('freshSession opens an isolated context with no cookies carried over', async () => {
    await d['context'].addCookies([{ name: 'leak', value: '1', url: `${base}/` }]);
    expect((await d.request('GET', '/api/echo')).json).toEqual({ cookie: 'leak=1' });
    await d.freshSession({ clean: true });
    expect((await d.request('GET', '/api/echo')).json).toEqual({ cookie: null });
    expect(d.sessionToken()).toBe('');
  }, 30_000);
});
