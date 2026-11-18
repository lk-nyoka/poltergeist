import type { AxeViolation, PageEvent } from '../driver';
import type { ShopObserver } from '../observer';
import type { FocusTrace, Observation, TextCheck } from './types';

export type ObserveContext = {
  events: PageEvent[];
  axe?: AxeViolation[];
  focus?: FocusTrace[];
  texts?: TextCheck[];
  /** True when a reload or back step happened in the window; enables the StateLoss check. */
  refreshed?: boolean;
};

export type ObserveOptions = {
  /** How long to keep re-reading while a debit has no order yet. Default 2000 ms (brief §7.1). */
  timeoutMs?: number;
  intervalMs?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
};

async function read(observer: ShopObserver, token: string, ctx: ObserveContext): Promise<Observation> {
  const [ledgers, orders, intents, clean] = await Promise.all([
    observer.ledgers(token),
    observer.orders(token, { reads: true }),
    observer.intents(token),
    observer.cleanProducts(),
  ]);
  const debited = [...new Set(ledgers.customer.entries.filter((e) => e.amount_cents < 0 && e.intent_id).map((e) => e.intent_id!))];
  return {
    ledgers: {
      customer: ledgers.customer.entries,
      till: ledgers.till.entries,
      customerStart: ledgers.customer.start,
      tillStart: ledgers.till.start,
    },
    orders: orders.orders,
    reads: orders.reads,
    intents,
    clean,
    events: ctx.events,
    axe: ctx.axe ?? [],
    focus: ctx.focus ?? [],
    texts: ctx.texts ?? [],
    refreshChecks: ctx.refreshed
      ? debited.map((intentId) => ({ intentId, orderVisible: orders.orders.some((o) => o.intent_id === intentId) }))
      : [],
  };
}

/**
 * Reads the shop's ledgers, orders, reads, intents and clean prices into an Observation.
 * Writes can lag, so while any debited intent still has no order the reads repeat, for up to
 * `timeoutMs`. An order that is still missing after that is real, and StateLoss may fire on it.
 */
export async function observe(
  observer: ShopObserver,
  token: string,
  ctx: ObserveContext,
  opts: ObserveOptions = {},
): Promise<Observation> {
  const timeoutMs = opts.timeoutMs ?? 2000;
  const intervalMs = opts.intervalMs ?? 100;
  const now = opts.now ?? Date.now;
  const sleep = opts.sleep ?? ((ms: number) => new Promise<void>((r) => setTimeout(r, ms)));
  const start = now();
  for (;;) {
    const obs = await read(observer, token, ctx);
    const debited = new Set(obs.ledgers.customer.filter((e) => e.amount_cents < 0 && e.intent_id).map((e) => e.intent_id!));
    const missing = [...debited].some((id) => !obs.orders.some((o) => o.intent_id === id));
    if (!missing || now() - start >= timeoutMs) return obs;
    await sleep(intervalMs);
  }
}
