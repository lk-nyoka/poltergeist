/**
 * RecordingDriver: wraps any Driver and records every action as a session-independent Step
 * (REQ-4.1, REQ-4.2). Reads (`query`, `focused`, `axe`, ...) are forwarded and not recorded.
 */
import { Step } from '@poltergeist/protocol';
import type { AxeViolation, Driver, ElementInfo, Locator, PageEvent, PossessOptions, Unsubscribe } from '../driver';
import type { ShopObserver } from '../observer';

/** Values read from the observer that the recorder replaces with placeholders. */
export type KnownValues = { intentId?: string; orderId?: string };

const PLACEHOLDERS = { intentId: '{{intentId}}', orderId: '{{orderId}}' } as const;

function mapStrings(value: unknown, fn: (s: string) => string): unknown {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (typeof value === 'object' && value !== null) {
    return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapStrings(v, fn)]));
  }
  return value;
}

/** Replaces known intent and order ids inside any string field with `{{intentId}}` / `{{orderId}}`. */
export function substitutePlaceholders<T>(value: T, known: KnownValues): T {
  const pairs = (Object.keys(PLACEHOLDERS) as (keyof KnownValues)[])
    .flatMap((k) => (known[k] ? [[known[k]!, PLACEHOLDERS[k]] as const] : []))
    .sort((a, b) => b[0].length - a[0].length); // longest id first, so one id inside another is safe
  if (pairs.length === 0) return value;
  // One pass over the string, so an id can never match inside a placeholder inserted a moment ago.
  const byId = new Map(pairs);
  const re = new RegExp(pairs.map(([id]) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'g');
  return mapStrings(value, (s) => s.replace(re, (m) => byId.get(m) ?? m)) as T;
}

/** The replay-side inverse: fills placeholders from the replay session's own latest ids. */
export function resolvePlaceholders<T>(value: T, known: KnownValues): T {
  return mapStrings(value, (s) =>
    s.replace(/\{\{(intentId|orderId)\}\}/g, (m, k: keyof KnownValues) => known[k] ?? m),
  ) as T;
}

export type RecorderOptions = {
  /** The haunting seed, carried into findings. */
  seed: number;
  /** When given, the latest intent and order ids are read before each step and recorded as placeholders. */
  observer?: ShopObserver;
  /** Millisecond clock for gaps. Defaults to `performance.now`. */
  now?: () => number;
};

const compact = (o: Record<string, unknown>): Record<string, unknown> =>
  Object.fromEntries(Object.entries(o).filter(([, v]) => v !== undefined));

export class RecordingDriver implements Driver {
  readonly seed: number;
  private readonly log: Step[] = [];
  private known: KnownValues = {};
  private lastAt: number | null = null;
  private readonly now: () => number;

  constructor(
    private readonly inner: Driver,
    private readonly opts: RecorderOptions,
  ) {
    this.seed = opts.seed;
    this.now = opts.now ?? (() => performance.now());
  }

  /** Every recorded step, oldest first. */
  steps(): Step[] {
    return this.log.map((s) => structuredClone(s));
  }

  /** Tell the recorder about ids it should turn into placeholders (when no observer is wired in). */
  setKnown(known: KnownValues): void {
    this.known = { ...this.known, ...known };
  }

  /**
   * The recipe for a finding: the steps from the last `freshSession` up to (not including) `upTo`.
   * A haunting that never called `freshSession` started in the possessed session, so the result then
   * begins with an explicit `freshSession` step, which keeps every recipe replayable from scratch.
   */
  stepsSinceFreshSession(upTo: number = this.log.length): Step[] {
    const prefix = this.log.slice(0, upTo);
    let from = -1;
    prefix.forEach((s, i) => {
      if (s.kind === 'freshSession') from = i;
    });
    const tail = prefix.slice(Math.max(from, 0)).map((s) => structuredClone(s));
    return from >= 0 ? tail : [{ kind: 'freshSession', gapMs: 0, timingSensitive: false }, ...tail];
  }

  private async refreshKnown(): Promise<void> {
    const observer = this.opts.observer;
    if (!observer) return;
    const token = this.inner.sessionToken();
    const intents = await observer.intents(token);
    const orders = await observer.orders(token, { reads: false });
    const intentId = intents[intents.length - 1]?.id;
    const orderId = orders.orders[orders.orders.length - 1]?.id;
    this.known = { ...(intentId ? { intentId } : {}), ...(orderId ? { orderId } : {}) };
  }

  private async record<T>(raw: Record<string, unknown>, run: () => Promise<T>, timingSensitive = false): Promise<T> {
    await this.refreshKnown();
    const start = Math.round(this.now());
    const gapMs = this.lastAt === null ? 0 : Math.max(0, start - this.lastAt);
    // Fail before acting if the step could not be replayed (for example `count` above 3).
    const step = Step.parse(substitutePlaceholders(compact({ ...raw, gapMs, timingSensitive }), this.known));
    try {
      const result = await run();
      this.log.push(step);
      return result;
    } finally {
      this.lastAt = Math.round(this.now());
    }
  }

  // ── Recorded actions ──────────────────────────────────────────────────────────────────────────
  goto(path: string): Promise<void> {
    return this.record({ kind: 'goto', path }, () => this.inner.goto(path));
  }

  click(target: Locator, opts?: { count?: number; delayMs?: number }): Promise<void> {
    return this.record(
      { kind: 'click', target, count: opts?.count, delayMs: opts?.delayMs },
      () => this.inner.click(target, opts),
      (opts?.count ?? 1) > 1,
    );
  }

  type(target: Locator, text: string): Promise<void> {
    return this.record({ kind: 'type', target, text }, () => this.inner.type(target, text));
  }

  press(key: 'Tab' | 'Shift+Tab' | 'Enter' | 'Escape'): Promise<void> {
    return this.record({ kind: 'press', key }, () => this.inner.press(key));
  }

  back(): Promise<void> {
    return this.record({ kind: 'back' }, () => this.inner.back());
  }

  reload(): Promise<void> {
    return this.record({ kind: 'reload' }, () => this.inner.reload());
  }

  /** Recorded with no options: replay chooses its own base session (REQ-4.2). */
  async freshSession(opts: PossessOptions): Promise<void> {
    await this.record({ kind: 'freshSession' }, () => this.inner.freshSession(opts));
    this.known = {};
  }

  request(
    method: string,
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; json: unknown }> {
    return this.record({ kind: 'request', method, path, body, headers }, () =>
      this.inner.request(method, path, body, headers),
    );
  }

  // ── Forwarded reads ───────────────────────────────────────────────────────────────────────────
  query(selector: string): Promise<ElementInfo[]> {
    return this.inner.query(selector);
  }
  focused(): Promise<ElementInfo | null> {
    return this.inner.focused();
  }
  axe(): Promise<AxeViolation[]> {
    return this.inner.axe();
  }
  onEvent(cb: (e: PageEvent) => void): Unsubscribe {
    return this.inner.onEvent(cb);
  }
  pointer(x: number, y: number): void {
    this.inner.pointer(x, y);
  }
  currentPath(): Promise<string> {
    return this.inner.currentPath();
  }
  sessionToken(): string {
    return this.inner.sessionToken();
  }
}
