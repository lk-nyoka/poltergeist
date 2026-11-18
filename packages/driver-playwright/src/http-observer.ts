/**
 * ShopObserver over HTTP: reads the shop's server-only /api/oracle/* endpoints with the shared
 * secret. Money and privacy oracles read only through it, never from page content.
 */
import type { CleanProducts, CouponValue, ShopObserver } from '@poltergeist/ghost-core';
import {
  OracleIntentsResponse,
  OracleLedgersResponse,
  OracleOrdersResponse,
  OracleProductsResponse,
} from '@poltergeist/protocol';

export type HttpObserverConfig = {
  baseUrl: string;
  /** SEANCE_SERVER_SECRET. Server-side only. */
  serverSecret: string;
  fetch?: typeof fetch;
};

/** The slice of a zod schema used here, so this package needs no zod dependency of its own. */
type Schema<T> = { safeParse(v: unknown): { success: true; data: T } | { success: false } };

export function httpObserver(cfg: HttpObserverConfig): ShopObserver {
  const doFetch = cfg.fetch ?? fetch;
  let clean: CleanProducts | null = null;

  async function get<T>(path: string, schema: Schema<T>, token?: string): Promise<T> {
    const headers: Record<string, string> = { 'x-poltergeist-secret': cfg.serverSecret };
    if (token) headers['x-pg-observe'] = token;
    const res = await doFetch(new URL(path, cfg.baseUrl), { headers, redirect: 'error' });
    if (!res.ok) throw new Error(`oracle read ${path.split('?')[0]} failed: HTTP ${res.status}`);
    const parsed = schema.safeParse(await res.json());
    if (!parsed.success) throw new Error(`oracle read ${path.split('?')[0]} returned an unexpected shape`);
    return parsed.data;
  }

  const ledger = (v: { start: number; entries: { id: string | number; amount_cents: number; memo: string; intent_id?: string | null | undefined }[] }) => ({
    start: v.start,
    entries: v.entries.map((e) => ({
      id: e.id,
      amount_cents: e.amount_cents,
      memo: e.memo,
      intent_id: e.intent_id ?? null,
    })),
  });

  return {
    async ledgers(token) {
      const r = await get('/api/oracle/ledgers', OracleLedgersResponse, token);
      return { customer: ledger(r.customer), till: ledger(r.till) };
    },
    async orders(token, opts) {
      const r = await get(opts.reads ? '/api/oracle/orders?reads=1' : '/api/oracle/orders', OracleOrdersResponse, token);
      return {
        orders: r.orders.map((o) => ({
          id: o.id,
          intent_id: o.intent_id,
          items: o.items,
          coupon_codes: o.coupon_codes,
          total_cents: o.total_cents,
        })),
        reads: opts.reads ? (r.reads ?? []).map((x) => ({ orderId: x.orderId })) : [],
      };
    },
    async intents(token) {
      const r = await get('/api/oracle/intents', OracleIntentsResponse, token);
      return r.intents.map((i) => ({ id: i.id }));
    },
    async cleanProducts() {
      if (clean) return clean;
      const r = await get('/api/oracle/products', OracleProductsResponse);
      const coupons: Record<string, CouponValue> = {};
      for (const c of r.coupons) {
        coupons[c.code] = {
          code: c.code,
          kind: c.kind,
          ...(c.cents !== undefined ? { cents: c.cents } : {}),
          ...(c.percent !== undefined ? { percent: c.percent } : {}),
        };
      }
      clean = { prices: Object.fromEntries(r.products.map((p) => [p.id, p.price])), coupons };
      return clean;
    },
  };
}

/** True when `baseUrl` is a Haunted Shop: it answers the server-only products read with this secret. */
export async function isHauntedShop(baseUrl: string, serverSecret: string, doFetch: typeof fetch = fetch): Promise<boolean> {
  try {
    const res = await doFetch(new URL('/api/oracle/products', baseUrl), {
      headers: { 'x-poltergeist-secret': serverSecret },
      redirect: 'error',
      signal: AbortSignal.timeout(5000),
    });
    return res.ok && OracleProductsResponse.safeParse(await res.json()).success;
  } catch {
    return false;
  }
}

/** An observer for targets that have no oracle API: every read is empty. */
export const emptyObserver: ShopObserver = {
  async ledgers() {
    return { customer: { start: 0, entries: [] }, till: { start: 0, entries: [] } };
  },
  async orders() {
    return { orders: [], reads: [] };
  },
  async intents() {
    return [];
  },
  async cleanProducts() {
    return { prices: {}, coupons: {} };
  },
};
