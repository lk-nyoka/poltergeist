// ─── Domain types ─────────────────────────────────────────────────────────────

export type CartLine = {
  productId: string;
  qty: number;
};

export type Cart = {
  id: string;
  sid: string;
  version: number;
  lines: CartLine[];
  couponCode: string | null;
};

export type Intent = {
  id: string;
  sid: string;
  createdAt: number;
};

export type Order = {
  id: string;
  sid: string;
  intentId: string;
  items: CartLine[];
  couponCodes: string[];
  totalCents: number;
  createdAt: number;
};

export type LedgerEntry = {
  id: string | number;
  sid: string;
  ledger: 'customer' | 'till';
  amountCents: number;
  memo: string;
  intentId?: string | null;
  createdAt: number;
};

export type Review = {
  id: string | number;
  sid: string;
  productId: string;
  body: string;
  createdAt: number;
};

export type OrderRead = {
  sid: string;
  orderId: string;
  at: number;
};

// ─── Store interface ──────────────────────────────────────────────────────────

export interface Store {
  ensureSession(sid: string): Promise<void>;
  getCart(sid: string): Promise<Cart>;
  saveCart(cart: Cart): Promise<void>;
  upsertIntent(i: { id: string; sid: string }): Promise<void>;
  getIntent(id: string): Promise<Intent | null>;
  /** Atomic claim: returns true the first time, false on every subsequent call. */
  claimIntent(id: string): Promise<boolean>;
  addLedger(e: Omit<LedgerEntry, 'id' | 'createdAt'>): Promise<void>;
  listLedger(sid: string, ledger: 'customer' | 'till'): Promise<LedgerEntry[]>;
  insertOrder(o: Omit<Order, 'createdAt'>): Promise<void>;
  getOrder(id: string): Promise<Order | null>;
  getOrderByIntent(intentId: string): Promise<Order | null>;
  listOrders(sid: string): Promise<Order[]>;
  addReview(r: Omit<Review, 'id' | 'createdAt'>): Promise<void>;
  listReviews(sid: string, productId: string): Promise<Review[]>;
  /** Called by routes AFTER a seam returns an order row. */
  recordOrderRead(sid: string, orderId: string): Promise<void>;
  listOrderReads(sid: string): Promise<OrderRead[]>;
  listIntents(sid: string): Promise<Intent[]>;
  health(): Promise<boolean>;
}

// Balances computed as start + Σ entries
export const CUSTOMER_START_CENTS = 50_000; // $500
export const TILL_START_CENTS = 100_000;    // $1,000
