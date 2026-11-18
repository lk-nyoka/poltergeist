/**
 * FakeDriver: an in-memory Driver over FakeShop. No DOM, no browser, no timers except `delayMs`.
 * Its behaviour is a pure function of (haunting seed, fault set) and the calls made, so the same
 * steps replayed on the same driver settings give identical results.
 */
import type {
  AxeViolation,
  Driver,
  ElementInfo,
  Locator,
  PageEvent,
  PageEventKind,
  PossessOptions,
  Unsubscribe,
} from '../driver';
import {
  DEMO_FAULTS,
  FAULT_NAMES,
  FakeShop,
  PRODUCTS,
  type ApiResult,
  type FaultName,
  type OrderRow,
} from './FakeShop';

type El = {
  key: string;
  tag: string;
  role: string;
  name: string;
  text: string;
  testId?: string;
  focusable: boolean;
  dialog: boolean;
};

export type FakeDriverOptions = {
  /** The haunting seed: fixes every id the fake shop mints. */
  seed?: number;
  /** The mutant set of the initial session. */
  faults?: Iterable<FaultName>;
};

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));
const isFault = (v: string): v is FaultName => (FAULT_NAMES as readonly string[]).includes(v);

export class FakeDriver implements Driver {
  readonly shop: FakeShop;
  /** Last position passed to `pointer`. FakeDriver has no overlay, so this is only recorded. */
  lastPointer: { x: number; y: number } | null = null;

  private token: string;
  private listeners = new Set<(e: PageEvent) => void>();
  private history: string[] = ['/'];
  private index = 0;
  private path = '/';
  private els: El[] = [];
  private focusKey: string | null = null;
  private dialogOpen = false;
  private intentId: string | null = null;
  private form = new Map<string, string>();
  private status = '';
  private order: OrderRow | null = null;
  private beaconsSeen = new Set<string>();

  constructor(opts: FakeDriverOptions = {}) {
    this.shop = new FakeShop(opts.seed ?? 0);
    this.token = this.shop.createSession(opts.faults ?? []);
    this.load('/');
  }

  // ── Driver ────────────────────────────────────────────────────────────────────────────────────
  async goto(path: string): Promise<void> {
    this.history = [...this.history.slice(0, this.index + 1), path];
    this.index = this.history.length - 1;
    this.load(path);
  }

  async click(target: Locator, opts?: { count?: number; delayMs?: number }): Promise<void> {
    const count = opts?.count ?? 1;
    const delayMs = opts?.delayMs ?? 0;
    for (let i = 0; i < count; i++) {
      if (i > 0 && delayMs > 0) await sleep(delayMs);
      const el = this.find(target);
      if (!el) {
        // A repeat click can land on a page that has already moved on, as it can for a person.
        if (i === 0) throw new Error(`FakeDriver: no element matches ${JSON.stringify(target)}`);
        break;
      }
      this.activate(el);
    }
  }

  async type(target: Locator, text: string): Promise<void> {
    const el = this.find(target);
    if (!el) throw new Error(`FakeDriver: no element matches ${JSON.stringify(target)}`);
    if (el.tag !== 'input' && el.tag !== 'textarea') throw new Error(`FakeDriver: ${el.role} is not typeable`);
    this.form.set(el.key, text);
    this.focusKey = el.key;
  }

  async press(key: 'Tab' | 'Shift+Tab' | 'Enter' | 'Escape'): Promise<void> {
    if (key === 'Escape') {
      if (this.dialogOpen) this.closeDialog();
      return;
    }
    if (key === 'Enter') {
      const el = this.els.find((e) => e.key === this.focusKey);
      if (el && (el.tag === 'button' || el.tag === 'a')) this.activate(el);
      return;
    }
    // Tab: a dialog's own handler keeps focus inside unless the focus trap is missing.
    const trapped = this.dialogOpen && !this.shop.faults(this.token).has('noFocusTrap');
    const pool = this.els.filter((e) => e.focusable && (!trapped || e.dialog));
    if (pool.length === 0) return;
    const cur = pool.findIndex((e) => e.key === this.focusKey);
    const next =
      key === 'Tab' ? (cur + 1) % pool.length : cur <= 0 ? pool.length - 1 : cur - 1;
    this.focusKey = pool[next]!.key;
  }

  async back(): Promise<void> {
    if (this.index > 0) this.index -= 1;
    this.shop.onRefresh(this.token);
    this.load(this.history[this.index]!);
  }

  async reload(): Promise<void> {
    this.shop.onRefresh(this.token);
    this.load(this.path);
  }

  async freshSession(opts: PossessOptions): Promise<void> {
    this.token = this.shop.createSession(this.faultsFor(opts));
    this.history = ['/'];
    this.index = 0;
    this.beaconsSeen.clear();
    this.load('/');
  }

  async request(
    method: string,
    path: string,
    body?: unknown,
    _headers?: Record<string, string>,
  ): Promise<{ status: number; json: unknown }> {
    const r = this.call(method, path, body);
    this.rerender();
    return r;
  }

  async query(selector: string): Promise<ElementInfo[]> {
    const matcher = parseSelector(selector);
    return this.els.flatMap((e, i) => (matcher(e) ? [this.info(e, i)] : []));
  }

  async focused(): Promise<ElementInfo | null> {
    const i = this.els.findIndex((e) => e.key === this.focusKey);
    return i < 0 ? null : this.info(this.els[i]!, i);
  }

  async axe(): Promise<AxeViolation[]> {
    const rules: { id: string; help: string; applies: (e: El) => boolean }[] = [
      { id: 'image-alt', help: 'Images must have alternative text', applies: (e) => e.role === 'img' },
      { id: 'button-name', help: 'Buttons must have discernible text', applies: (e) => e.role === 'button' },
      { id: 'link-name', help: 'Links must have discernible text', applies: (e) => e.role === 'link' },
      {
        id: 'label',
        help: 'Form elements must have labels',
        applies: (e) => e.role === 'textbox' || e.role === 'spinbutton',
      },
    ];
    const out: AxeViolation[] = [];
    for (const r of rules) {
      const bad = this.els.filter((e) => r.applies(e) && e.name === '');
      if (bad.length > 0) {
        out.push({ id: r.id, impact: 'critical', help: r.help, targets: bad.map((e) => `${e.tag}[data-key="${e.key}"]`) });
      }
    }
    return out;
  }

  onEvent(cb: (e: PageEvent) => void): Unsubscribe {
    this.listeners.add(cb);
    return () => {
      this.listeners.delete(cb);
    };
  }

  pointer(x: number, y: number): void {
    this.lastPointer = { x, y };
  }

  async currentPath(): Promise<string> {
    return this.path;
  }

  sessionToken(): string {
    return this.token;
  }

  // ── Possession ────────────────────────────────────────────────────────────────────────────────
  private faultsFor(opts: PossessOptions): FaultName[] {
    if ('clean' in opts) return [];
    if ('demo' in opts) return [...DEMO_FAULTS];
    if ('cloneOf' in opts) {
      if (!this.shop.has(opts.cloneOf)) throw new Error('FakeDriver: cloneOf token is unknown');
      return [...this.shop.faults(opts.cloneOf)];
    }
    if ('mutantIds' in opts) {
      return opts.mutantIds.map((id) => {
        if (!isFault(id)) throw new Error(`FakeDriver: unknown fault id ${id}`);
        return id;
      });
    }
    const pool = [...FAULT_NAMES];
    const picked: FaultName[] = [];
    for (let i = 0; i < opts.count && pool.length > 0; i++) {
      picked.push(pool.splice(Math.floor(this.shop.random() * pool.length), 1)[0]!);
    }
    return picked;
  }

  // ── Events and API calls ──────────────────────────────────────────────────────────────────────
  private emit(kind: PageEventKind, detail: string): void {
    const e: PageEvent = { kind, detail, at: this.shop.tick() };
    for (const cb of [...this.listeners]) cb(e);
  }

  private call(method: string, path: string, body?: unknown, ui = false): ApiResult {
    const r = this.shop.handle(this.token, method, path, body === undefined ? undefined : structuredClone(body));
    if (r.status >= 500) {
      this.emit('http5xx', `${r.status} ${method.toUpperCase()} ${path}`);
      if (ui) this.emit('errorBoundary', `${method.toUpperCase()} ${path}`);
    } else if (r.status === 429) {
      this.emit('http429', `${method.toUpperCase()} ${path}`);
    }
    return r;
  }

  private errorCode(r: ApiResult): string {
    const j = r.json as { error?: { code?: string } };
    return j.error?.code ?? `error ${r.status}`;
  }

  // ── Pages ─────────────────────────────────────────────────────────────────────────────────────
  private load(path: string): void {
    this.path = path;
    this.dialogOpen = false;
    this.intentId = null;
    this.form.clear();
    this.status = '';
    this.focusKey = null;
    this.order = null;
    const m = /^\/orders\/([^/?]+)/.exec(path);
    if (m) {
      const r = this.call('GET', `/api/orders/${m[1]}`, undefined, true);
      if (r.status === 200) this.order = (r.json as { order: OrderRow }).order;
    }
    this.rerender();
  }

  private rerender(): void {
    this.els = this.buildPage();
    if (!this.els.some((e) => e.key === this.focusKey)) this.focusKey = null;
  }

  /** Renders user text. With `renderHtml` it is parsed as HTML: tags vanish and handlers run. */
  private renderText(raw: string): string {
    if (!this.shop.faults(this.token).has('renderHtml')) return raw;
    const m = /__poltergeistBeacon\(\s*['"]?([\w-]+)/.exec(raw);
    if (m && /<script|\son(error|load)\s*=/i.test(raw) && !this.beaconsSeen.has(m[1]!)) {
      this.beaconsSeen.add(m[1]!);
      this.emit('beacon', m[1]!);
    }
    return raw.replace(/<[^>]*>/g, '');
  }

  private buildPage(): El[] {
    const faults = this.shop.faults(this.token);
    const out: El[] = [];
    const add = (e: Partial<El> & Pick<El, 'key' | 'tag' | 'role'>) =>
      out.push({ name: '', text: '', focusable: false, dialog: false, ...e });
    const link = (key: string, name: string) => add({ key, tag: 'a', role: 'link', name, text: name, focusable: true });
    const img = (key: string, alt: string) => add({ key, tag: 'img', role: 'img', name: faults.has('dropAlt') ? '' : alt });
    const input = (key: string, role: string, tag: string, name: string) =>
      add({ key, tag, role, name, text: this.form.get(key) ?? '', focusable: true });
    const button = (key: string, name: string, dialog = false) =>
      add({ key, tag: 'button', role: 'button', name, text: name, focusable: true, dialog });

    link('nav-home', 'Home');
    link('nav-cart', 'Cart');

    const product = /^\/product\/([^/?]+)/.exec(this.path);
    const orderPage = /^\/orders\/([^/?]+)/.exec(this.path);
    if (this.path === '/' || this.path.startsWith('/?')) {
      for (const p of PRODUCTS) {
        link(`open:${p.id}`, p.name);
        img(`img:${p.id}`, p.altText);
      }
    } else if (product) {
      const p = PRODUCTS.find((x) => x.id === product[1]);
      if (!p) {
        add({ key: 'h1', tag: 'h1', role: 'heading', name: 'Not found', text: 'Not found' });
      } else {
        add({ key: 'h1', tag: 'h1', role: 'heading', name: p.name, text: p.name });
        img(`img:${p.id}`, p.altText);
        input('qty', 'spinbutton', 'input', 'Quantity');
        button('add', 'Add to cart');
        input('review', 'textbox', 'textarea', 'Review');
        button('post-review', 'Post review');
        this.shop.reviews(this.token, p.id).forEach((body, i) => {
          const text = this.renderText(body);
          add({ key: `review-${i}`, tag: 'li', role: 'listitem', name: text, text, testId: `review-${i}` });
        });
      }
    } else if (this.path === '/cart' || this.path.startsWith('/cart?')) {
      add({ key: 'h1', tag: 'h1', role: 'heading', name: 'Cart', text: 'Cart' });
      const cart = this.shop.cartSummary(this.token);
      cart.lines.forEach((l, i) => {
        const text = `${PRODUCTS.find((p) => p.id === l.productId)?.name ?? l.productId} × ${l.qty}`;
        add({ key: `line-${i}`, tag: 'li', role: 'listitem', name: text, text, testId: `line-${i}` });
      });
      input('coupon', 'textbox', 'input', 'Coupon code');
      button('apply-coupon', 'Apply coupon');
      button('checkout', 'Checkout');
      if (this.dialogOpen) {
        add({ key: 'dialog', tag: 'div', role: 'dialog', name: 'Checkout', dialog: true });
        out.push({ key: 'd-name', tag: 'input', role: 'textbox', name: 'Name', text: this.form.get('d-name') ?? '', focusable: true, dialog: true });
        out.push({ key: 'd-address', tag: 'input', role: 'textbox', name: 'Address', text: this.form.get('d-address') ?? '', focusable: true, dialog: true });
        button('pay', 'Pay', true);
        button('close', 'Close', true);
      }
    } else if (orderPage) {
      if (this.order) {
        const o = this.order;
        add({ key: 'h1', tag: 'h1', role: 'heading', name: 'Order confirmed', text: 'Order confirmed' });
        add({ key: 'order-id', tag: 'p', role: 'paragraph', text: o.id, testId: 'order-id' });
        const name = this.renderText(o.name);
        const address = this.renderText(o.address);
        add({ key: 'order-name', tag: 'p', role: 'paragraph', name, text: name, testId: 'order-name' });
        add({ key: 'order-address', tag: 'p', role: 'paragraph', name: address, text: address, testId: 'order-address' });
        const total = `$${(o.total_cents / 100).toFixed(2)}`;
        add({ key: 'order-total', tag: 'p', role: 'paragraph', text: total, testId: 'order-total' });
      } else {
        add({ key: 'h1', tag: 'h1', role: 'heading', name: 'Order not found', text: 'Order not found' });
      }
    } else {
      add({ key: 'h1', tag: 'h1', role: 'heading', name: 'Not found', text: 'Not found' });
    }
    if (this.status) add({ key: 'status', tag: 'p', role: 'status', name: this.status, text: this.status, testId: 'status' });
    return out;
  }

  private info(e: El, i: number): ElementInfo {
    const info: ElementInfo = {
      role: e.role,
      name: e.name,
      text: e.text,
      box: { x: 0, y: i * 40, width: 160, height: 30 },
      focusable: e.focusable,
    };
    if (e.testId !== undefined) info.testId = e.testId;
    return info;
  }

  private find(t: Locator): El | undefined {
    const css = t.css === undefined ? null : parseSelector(t.css);
    return this.els.find(
      (e) =>
        (t.role === undefined || e.role === t.role) &&
        (t.name === undefined || e.name === t.name) &&
        (t.testId === undefined || e.testId === t.testId) &&
        (css === null || css(e)),
    );
  }

  // ── Actions ───────────────────────────────────────────────────────────────────────────────────
  private activate(el: El): void {
    this.focusKey = el.key;
    const productId = /^\/product\/([^/?]+)/.exec(this.path)?.[1];
    switch (el.key) {
      case 'nav-home':
        void this.goto('/');
        return;
      case 'nav-cart':
        void this.goto('/cart');
        return;
      case 'add': {
        const raw = this.form.get('qty') ?? '1';
        const r = this.call('POST', '/api/cart', { productId, qty: Number(raw) }, true);
        this.status = r.status < 300 ? 'Added to cart' : this.errorCode(r);
        break;
      }
      case 'post-review': {
        const r = this.call('POST', '/api/reviews', { productId, body: this.form.get('review') ?? '' }, true);
        this.status = r.status < 300 ? 'Review posted' : this.errorCode(r);
        if (r.status < 300) this.form.delete('review');
        break;
      }
      case 'apply-coupon': {
        const r = this.call('POST', '/api/cart', { couponCode: this.form.get('coupon') ?? '' }, true);
        this.status = r.status < 300 ? 'Coupon applied' : this.errorCode(r);
        break;
      }
      case 'checkout': {
        const r = this.call('POST', '/api/checkout/open', undefined, true);
        if (r.status < 300) {
          this.intentId = (r.json as { intentId: string }).intentId;
          this.dialogOpen = true;
          this.status = '';
          this.rerender();
          this.focusKey = 'd-name';
          return;
        }
        this.status = this.errorCode(r);
        break;
      }
      case 'pay': {
        const r = this.call(
          'POST',
          '/api/checkout',
          { intentId: this.intentId, name: this.form.get('d-name') ?? '', address: this.form.get('d-address') ?? '' },
          true,
        );
        if (r.status < 300) {
          const order = (r.json as { order: OrderRow }).order;
          if (this.shop.faults(this.token).has('skipClaim')) {
            // Without the claim the Pay button stays live, so a second click pays again.
            this.status = 'Paid';
            break;
          }
          this.history = [...this.history.slice(0, this.index + 1), `/orders/${order.id}`];
          this.index = this.history.length - 1;
          this.load(`/orders/${order.id}`);
          return;
        }
        this.status = this.errorCode(r);
        break;
      }
      case 'close':
        this.closeDialog();
        return;
      default:
        if (el.key.startsWith('open:')) {
          void this.goto(`/product/${el.key.slice(5)}`);
          return;
        }
    }
    this.rerender();
  }

  private closeDialog(): void {
    this.dialogOpen = false;
    this.rerender();
    this.focusKey = this.shop.faults(this.token).has('noFocusReturn') ? null : 'checkout';
  }
}

// ── Selectors ─────────────────────────────────────────────────────────────────────────────────────
/** A small selector subset: `*`, `tag`, `[role=x]`, `[data-testid=x]`, combined, comma-separated. */
function parseSelector(selector: string): (e: El) => boolean {
  const parts = selector.split(',').map((s) => s.trim());
  const matchers = parts.map((part) => {
    const m = /^([a-z0-9]+|\*)?((?:\[(?:role|data-testid)=(?:"[^"]*"|'[^']*'|[\w-]+)\])*)$/i.exec(part);
    if (!m || part === '') throw new Error(`FakeDriver: unsupported selector "${selector}"`);
    const tag = m[1] && m[1] !== '*' ? m[1].toLowerCase() : null;
    const attrs = [...(m[2] ?? '').matchAll(/\[(role|data-testid)=("[^"]*"|'[^']*'|[\w-]+)\]/gi)].map((a) => ({
      attr: a[1]!.toLowerCase(),
      value: a[2]!.replace(/^["']|["']$/g, ''),
    }));
    return (e: El) =>
      (tag === null || e.tag === tag) &&
      attrs.every((a) => (a.attr === 'role' ? e.role === a.value : e.testId === a.value));
  });
  return (e) => matchers.some((fn) => fn(e));
}
