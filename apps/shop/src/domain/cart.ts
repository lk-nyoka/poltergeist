import { seam } from '@/seams/registry';
import { ApiError } from '@/lib/http';
import { getStore } from '@/store';
import type { Cart } from '@/store/types';
import { COUPONS, findProduct } from './catalogue';
import { subtotal, total } from './pricing';

/** C3: whole numbers 1–10 only. Checked here, in the seam, so a weakened check is a detectable mutant. */
function assertQty(qty: unknown): asserts qty is number {
  if (typeof qty !== 'number' || !Number.isInteger(qty) || qty < 1 || qty > 10) {
    throw new ApiError(400, 'bad_quantity');
  }
}

/** Every change increments the cart version by exactly 1 (REQ-1.3). */
const changed = (c: Cart, patch: Partial<Cart>): Cart => ({ ...c, ...patch, version: c.version + 1 });

export type CartViewLine = {
  productId: string;
  name: string;
  qty: number;
  unitCents: number;
  lineCents: number;
};

export type CartView = {
  version: number;
  couponCode: string | null;
  lines: CartViewLine[];
  subtotalCents: number;
  discountCents: number;
  totalCents: number;
};

export const get = seam('cart/get', async (sid: string): Promise<Cart> => getStore().getCart(sid));

export const addLine = seam('cart/addLine', async (sid: string, productId: string, qty: number): Promise<Cart> => {
  if (!findProduct(productId)) throw new ApiError(404, 'no_product');
  assertQty(qty);
  const store = getStore();
  const cart = await store.getCart(sid);
  const existing = cart.lines.find((l) => l.productId === productId);
  const next = (existing?.qty ?? 0) + qty;
  assertQty(next);
  const lines = existing
    ? cart.lines.map((l) => (l.productId === productId ? { ...l, qty: next } : l))
    : [...cart.lines, { productId, qty: next }];
  const saved = changed(cart, { lines });
  await store.saveCart(saved);
  return saved;
});

export const setQty = seam('cart/setQty', async (sid: string, productId: string, qty: number): Promise<Cart> => {
  if (!findProduct(productId)) throw new ApiError(404, 'no_product');
  assertQty(qty);
  const store = getStore();
  const cart = await store.getCart(sid);
  if (!cart.lines.some((l) => l.productId === productId)) throw new ApiError(404, 'no_line');
  const saved = changed(cart, { lines: cart.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)) });
  await store.saveCart(saved);
  return saved;
});

export const removeLine = seam('cart/removeLine', async (sid: string, productId: string): Promise<Cart> => {
  const store = getStore();
  const cart = await store.getCart(sid);
  if (!cart.lines.some((l) => l.productId === productId)) throw new ApiError(404, 'no_line');
  const saved = changed(cart, { lines: cart.lines.filter((l) => l.productId !== productId) });
  await store.saveCart(saved);
  return saved;
});

/** C4: at most one coupon per cart; a second is rejected with 409 and the first stays. */
export const applyCoupon = seam('cart/applyCoupon', async (sid: string, code: string): Promise<Cart> => {
  if (typeof code !== 'string' || !Object.hasOwn(COUPONS, code)) throw new ApiError(400, 'bad_coupon');
  const store = getStore();
  const cart = await store.getCart(sid);
  if (cart.couponCode !== null) throw new ApiError(409, 'coupon_already_applied');
  const saved = changed(cart, { couponCode: code });
  await store.saveCart(saved);
  return saved;
});

/** The cart as the client sees it, with every amount computed on the server (C5). */
export const view = seam('cart/view', async (sid: string): Promise<CartView> => {
  const cart = await get(sid);
  const sub = subtotal(cart.lines);
  const tot = total(cart.lines, cart.couponCode);
  return {
    version: cart.version,
    couponCode: cart.couponCode,
    lines: cart.lines.map((l) => {
      const p = findProduct(l.productId)!;
      return { productId: l.productId, name: p.name, qty: l.qty, unitCents: p.price, lineCents: p.price * l.qty };
    }),
    subtotalCents: sub,
    discountCents: sub - tot,
    totalCents: tot,
  };
});
