/**
 * ShopObserver: the four oracle reads (REQ-2.1). Money and privacy oracles read only through it,
 * never from page content (REQ-2.2). Implementations live elsewhere: HTTP with the server secret
 * (S05), the Séance proxy (S09). `fake/FakeObserver.ts` serves tests.
 */
export type LedgerEntry = {
  id: string | number;
  /** Customer debits are negative; till credits are positive. */
  amount_cents: number;
  intent_id?: string | null;
  memo?: string;
};

export type LedgerView = { start: number; entries: LedgerEntry[] };

export type OrderRecord = {
  id: string;
  intent_id: string;
  /** `qty` is a plain number on purpose: oracles must be able to see bad quantities. */
  items: { productId: string; qty: number }[];
  coupon_codes: string[];
  total_cents: number;
};

export type CouponValue = { code: string; kind: 'fixed' | 'percent'; cents?: number; percent?: number };

export type CleanProducts = {
  /** Price in cents per product id, computed with no mutants active. */
  prices: Record<string, number>;
  coupons: Record<string, CouponValue>;
};

export interface ShopObserver {
  ledgers(token: string): Promise<{ customer: LedgerView; till: LedgerView }>;
  /** `reads: true` also returns the `order_reads` rows of the session. */
  orders(token: string, opts: { reads: boolean }): Promise<{ orders: OrderRecord[]; reads: { orderId: string }[] }>;
  intents(token: string): Promise<{ id: string }[]>;
  cleanProducts(): Promise<CleanProducts>;
}
