/**
 * PlaywrightDriver: the Driver on headless Chromium with real clicks, key presses and navigation.
 *
 * Shop target: `freshSession` asks the shop for a sealed token (server-side) and sets `__Host-pg_sid`
 * with `context.addCookies`. Any other site: a fresh isolated context, no cookie, DOM/HTTP oracles only.
 * The browser may only navigate within the verified host (the ownership gate's redirect rule).
 */
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import {
  chromium,
  type APIRequestContext,
  type Browser,
  type BrowserContext,
  type Locator as PwLocator,
  type Page,
} from 'playwright';
import type { AxeViolation, Driver, ElementInfo, Locator, PageEvent, PageEventKind, PossessOptions, Unsubscribe } from '@poltergeist/ghost-core';
import { AXE_RUN_SCRIPT, FOCUSED_SCRIPT, QUERY_SCRIPT } from './page-scripts';
import type { OwnershipDecision } from './ownership';
import type { TargetKind } from './site-oracles';

export const SESSION_COOKIE = '__Host-pg_sid';

export type PlaywrightDriverOptions = {
  baseUrl: string;
  kind: TargetKind;
  /** The decision from `assertOwnership`. Launch throws unless it allows exactly this host. */
  ownership: OwnershipDecision;
  /** Shop only: returns a sealed session token for the given possession. */
  possess?: (opts: PossessOptions) => Promise<string>;
  /** Possession used for the first session. Default `{ clean: true }`. */
  initial?: PossessOptions;
  /** Per-action timeout in ms. Default 5000. */
  actionTimeoutMs?: number;
  log?: (line: string) => void;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

let axeSource: string | null = null;
function loadAxe(): string {
  if (axeSource === null) {
    axeSource = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
  }
  return axeSource;
}

export class PlaywrightDriver implements Driver {
  private browser!: Browser;
  private context!: BrowserContext;
  private page!: Page;
  private token = '';
  private listeners = new Set<(e: PageEvent) => void>();
  private readonly base: URL;

  private constructor(private readonly opts: PlaywrightDriverOptions) {
    this.base = new URL(opts.baseUrl);
  }

  /** Launches Chromium and opens the first session. Refuses to launch without a matching ownership decision. */
  static async launch(opts: PlaywrightDriverOptions): Promise<PlaywrightDriver> {
    const base = new URL(opts.baseUrl);
    if (!opts.ownership.allowed || opts.ownership.host !== base.host) {
      throw new Error(`PlaywrightDriver: ownership of ${base.host} has not been verified`);
    }
    if (opts.kind === 'shop' && !opts.possess) throw new Error('PlaywrightDriver: a shop target needs a possess function');
    const driver = new PlaywrightDriver(opts);
    driver.browser = await chromium.launch({ headless: true, channel: 'chromium' });
    try {
      await driver.freshSession(opts.initial ?? { clean: true });
    } catch (e) {
      await driver.browser.close();
      throw e;
    }
    return driver;
  }

  async close(): Promise<void> {
    await this.context?.close().catch(() => {});
    await this.browser?.close().catch(() => {});
  }

  private get timeout(): number {
    return this.opts.actionTimeoutMs ?? 5000;
  }

  private emit(kind: PageEventKind, detail: string): void {
    const e: PageEvent = { kind, detail, at: Date.now() };
    for (const cb of [...this.listeners]) cb(e);
  }

  private url(path: string): string {
    const u = new URL(path, this.base);
    if (u.host !== this.base.host) throw new Error(`PlaywrightDriver: ${path} leaves the verified host`);
    return u.href;
  }

  // ── Driver: session ─────────────────────────────────────────────────────────────────────────────
  async freshSession(possession: PossessOptions): Promise<void> {
    await this.context?.close().catch(() => {});
    // A new context is isolated: no cookies, storage or cache from the previous session.
    this.context = await this.browser.newContext({ serviceWorkers: 'block' });
    this.context.setDefaultTimeout(this.timeout);
    this.context.setDefaultNavigationTimeout(Math.max(this.timeout, 15000));

    if (this.opts.kind === 'shop') {
      this.token = await this.opts.possess!(possession);
      await this.context.addCookies([
        // domain + path (not `url`): Chromium rejects the url form for a __Host- cookie.
        {
          name: SESSION_COOKIE,
          value: this.token,
          domain: this.base.hostname.replace(/^\[|\]$/g, ''),
          path: '/',
          httpOnly: true,
          secure: true,
          sameSite: 'None',
        },
      ]);
    } else {
      this.token = '';
    }

    // Top-level navigation may not leave the verified host (covers redirects and links alike).
    await this.context.route('**/*', async (route) => {
      const req = route.request();
      if (req.isNavigationRequest() && req.frame().parentFrame() === null) {
        let host = '';
        try {
          host = new URL(req.url()).host;
        } catch {
          /* blocked below */
        }
        if (host !== this.base.host && !req.url().startsWith('about:')) {
          this.opts.log?.(`navigation blocked: ${host || req.url()} is not the verified host ${this.base.host}`);
          await route.abort('blockedbyclient');
          return;
        }
      }
      await route.continue();
    });

    // Beacons: the only function injected pages may call. It records a token and does nothing else.
    await this.context.exposeFunction('__poltergeistBeacon', (token: unknown) => {
      this.emit('beacon', String(token));
    });

    this.page = await this.context.newPage();
    this.page.on('pageerror', (err) => this.emit('pageerror', err.message));
    this.page.on('response', (res) => {
      const line = `${res.status()} ${res.request().method()} ${new URL(res.url()).pathname}`;
      if (res.status() >= 500) this.emit('http5xx', line);
      else if (res.status() === 429) this.emit('http429', line);
    });
  }

  // ── Driver: actions ─────────────────────────────────────────────────────────────────────────────
  async goto(path: string): Promise<void> {
    await this.page.goto(this.url(path), { waitUntil: 'load' });
  }

  private locate(t: Locator): PwLocator {
    let loc: PwLocator | null = t.css === undefined ? null : this.page.locator(t.css);
    const and = (next: PwLocator) => {
      loc = loc === null ? next : loc.and(next);
    };
    if (t.testId !== undefined) and(this.page.getByTestId(t.testId));
    if (t.role !== undefined) {
      // Playwright's role type is a closed union; the protocol Locator carries a plain string.
      const role = t.role as Parameters<Page['getByRole']>[0];
      and(this.page.getByRole(role, t.name === undefined ? {} : { name: t.name, exact: true }));
    } else if (t.name !== undefined) {
      and(this.page.getByText(t.name, { exact: true }));
    }
    if (loc === null) throw new Error(`PlaywrightDriver: empty locator ${JSON.stringify(t)}`);
    return (loc as PwLocator).first();
  }

  async click(target: Locator, opts?: { count?: number; delayMs?: number }): Promise<void> {
    const count = opts?.count ?? 1;
    const delayMs = opts?.delayMs ?? 0;
    const loc = this.locate(target);
    for (let i = 0; i < count; i++) {
      if (i > 0 && delayMs > 0) await sleep(delayMs);
      try {
        // Repeat clicks may land on a page that has already moved on, as for a person.
        await loc.click({ timeout: i === 0 ? this.timeout : 1000 });
      } catch (e) {
        if (i === 0) throw e;
        break;
      }
    }
  }

  async type(target: Locator, text: string): Promise<void> {
    await this.locate(target).fill(text);
  }

  async press(key: 'Tab' | 'Shift+Tab' | 'Enter' | 'Escape'): Promise<void> {
    await this.page.keyboard.press(key);
  }

  async back(): Promise<void> {
    await this.page.goBack({ waitUntil: 'load' });
  }

  async reload(): Promise<void> {
    await this.page.reload({ waitUntil: 'load' });
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; json: unknown }> {
    const api: APIRequestContext = this.context.request;
    const res = await api.fetch(this.url(path), {
      method: method.toUpperCase(),
      headers,
      ...(body === undefined ? {} : { data: body as object | string }),
      failOnStatusCode: false,
      maxRedirects: 0,
    });
    const status = res.status();
    const line = `${status} ${method.toUpperCase()} ${path.split('?')[0]}`;
    if (status >= 500) this.emit('http5xx', line);
    else if (status === 429) this.emit('http429', line);
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = null;
    }
    return { status, json };
  }

  // ── Driver: observation ─────────────────────────────────────────────────────────────────────────
  async query(selector: string): Promise<ElementInfo[]> {
    return (await this.page.evaluate(`(${QUERY_SCRIPT})(${JSON.stringify(selector)})`)) as ElementInfo[];
  }

  async focused(): Promise<ElementInfo | null> {
    return (await this.page.evaluate(`(${FOCUSED_SCRIPT})()`)) as ElementInfo | null;
  }

  async axe(): Promise<AxeViolation[]> {
    // page.evaluate is not subject to the page's CSP, unlike injecting a <script> element.
    await this.page.evaluate('if (typeof axe === "undefined") {\n' + loadAxe() + '\n}');
    return (await this.page.evaluate(AXE_RUN_SCRIPT)) as AxeViolation[];
  }

  onEvent(cb: (e: PageEvent) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  pointer(_x: number, _y: number): void {
    // Ghost hands belong to DomDriver; nothing to draw in a headless browser.
  }

  async currentPath(): Promise<string> {
    const url = this.page.url();
    if (!url.startsWith('http')) return '/';
    const u = new URL(url);
    return u.pathname + u.search;
  }

  sessionToken(): string {
    return this.token;
  }

  /** Current value of the browser's session cookie, or null. Lets a caller confirm the shop kept our token. */
  async sessionCookie(): Promise<string | null> {
    const all = await this.context.cookies(this.base.origin);
    return all.find((c) => c.name === SESSION_COOKIE)?.value ?? null;
  }
}
