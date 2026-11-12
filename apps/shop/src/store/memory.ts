import type { Store, Cart, Intent, Order, LedgerEntry, Review, OrderRead } from './types';

type SessionRow = { sid: string; isStranger: boolean };

class MemoryStoreImpl implements Store {
  private sessions = new Map<string, SessionRow>();
  private carts = new Map<string, Cart>();
  private intents = new Map<string, Intent>();
  private claims = new Set<string>();
  private ledger: LedgerEntry[] = [];
  private orders: Order[] = [];
  private reviews: Review[] = [];
  private orderReads: OrderRead[] = [];
  private ledgerSeq = 0;
  private reviewSeq = 0;

  constructor() {
    this._seed();
  }

  private _seed() {
    // Seed the stranger session and order (REQ-4.3)
    this.sessions.set('stranger', { sid: 'stranger', isStranger: true });
    const strangerCart: Cart = { id: 'stranger-cart', sid: 'stranger', version: 0, lines: [], couponCode: null };
    this.carts.set('stranger', strangerCart);
    this.intents.set('stranger:0', { id: 'stranger:0', sid: 'stranger', createdAt: 0 });
    this.claims.add('stranger:0');
    this.orders.push({
      id: 'stranger-order-fixed',
      sid: 'stranger',
      intentId: 'stranger:0',
      items: [{ productId: 'clock', qty: 1 }],
      couponCodes: [],
      totalCents: 4200,
      createdAt: 0,
    });
  }

  async ensureSession(sid: string): Promise<void> {
    if (!this.sessions.has(sid)) {
      this.sessions.set(sid, { sid, isStranger: false });
    }
  }

  async getCart(sid: string): Promise<Cart> {
    await this.ensureSession(sid);
    if (!this.carts.has(sid)) {
      this.carts.set(sid, { id: crypto.randomUUID(), sid, version: 0, lines: [], couponCode: null });
    }
    return { ...this.carts.get(sid)!, lines: [...this.carts.get(sid)!.lines] };
  }

  async saveCart(cart: Cart): Promise<void> {
    this.carts.set(cart.sid, { ...cart, lines: [...cart.lines] });
  }

  async upsertIntent(i: { id: string; sid: string }): Promise<void> {
    if (!this.intents.has(i.id)) {
      this.intents.set(i.id, { id: i.id, sid: i.sid, createdAt: Date.now() });
    }
  }

  async getIntent(id: string): Promise<Intent | null> {
    return this.intents.get(id) ?? null;
  }

  async claimIntent(id: string): Promise<boolean> {
    // Synchronous check-then-set — no async gap, so it's atomic in-process
    if (this.claims.has(id)) return false;
    this.claims.add(id);
    return true;
  }

  async addLedger(e: Omit<LedgerEntry, 'id' | 'createdAt'>): Promise<void> {
    this.ledger.push({ ...e, id: ++this.ledgerSeq, createdAt: Date.now() });
  }

  async listLedger(sid: string, ledger: 'customer' | 'till'): Promise<LedgerEntry[]> {
    return this.ledger.filter((e) => e.sid === sid && e.ledger === ledger);
  }

  async insertOrder(o: Omit<Order, 'createdAt'>): Promise<void> {
    this.orders.push({ ...o, createdAt: Date.now() });
  }

  async getOrder(id: string): Promise<Order | null> {
    return this.orders.find((o) => o.id === id) ?? null;
  }

  async getOrderByIntent(intentId: string): Promise<Order | null> {
    return this.orders.find((o) => o.intentId === intentId) ?? null;
  }

  async listOrders(sid: string): Promise<Order[]> {
    return this.orders.filter((o) => o.sid === sid);
  }

  async addReview(r: Omit<Review, 'id' | 'createdAt'>): Promise<void> {
    this.reviews.push({ ...r, id: ++this.reviewSeq, createdAt: Date.now() });
  }

  async listReviews(sid: string, productId: string): Promise<Review[]> {
    return this.reviews.filter((r) => r.sid === sid && r.productId === productId);
  }

  async recordOrderRead(sid: string, orderId: string): Promise<void> {
    this.orderReads.push({ sid, orderId, at: Date.now() });
  }

  async listOrderReads(sid: string): Promise<OrderRead[]> {
    return this.orderReads.filter((r) => r.sid === sid);
  }

  async listIntents(sid: string): Promise<Intent[]> {
    return [...this.intents.values()].filter((i) => i.sid === sid);
  }

  async health(): Promise<boolean> {
    return this.sessions.size >= 0;
  }
}

// Process-wide singleton, anchored on globalThis rather than a module-level `let`.
// A Next.js build bundles route handlers and server pages as separate module graphs, so a plain
// module variable would give API routes and pages two different stores (a page would never see the
// cart an API call just changed). The benchmark runs on this store under `next start`, so it must be shared.
const STORE_KEY = Symbol.for('poltergeist.memoryStore');
type StoreHolder = { [STORE_KEY]?: MemoryStoreImpl };
const holder = globalThis as unknown as StoreHolder;

function getInstance(): MemoryStoreImpl {
  return (holder[STORE_KEY] ??= new MemoryStoreImpl());
}

/**
 * Reset the store to a clean state with the stranger session re-seeded.
 * Only *.test.ts files may call this.
 */
export function _resetMemoryStoreForTest(): void {
  holder[STORE_KEY] = new MemoryStoreImpl();
}

export function getMemoryStore(): Store {
  return getInstance();
}
