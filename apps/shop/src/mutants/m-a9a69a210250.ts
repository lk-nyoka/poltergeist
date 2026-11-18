import type { MutantOverride } from '@poltergeist/protocol';
import { COUPONS, priceOf } from '@/domain/catalogue';
import { ApiError } from '@/lib/http';
import { getStore } from '@/store';
import type { Cart } from '@/store/types';

const worth = (code: string | null, sub: number) => {
  const c = code ? COUPONS[code] : undefined;
  if (!c) return 0;
  return c.kind === 'fixed' ? Math.min(c.cents, sub) : (sub * c.percent) / 100;
};

export const override: MutantOverride = {
  id: 'a9a69a210250',
  seam: 'cart/applyCoupon',
  public: true,
  // The "already has a coupon" check is gone. A second coupon is accepted and the cart keeps whichever
  // code takes more off, so the shopper ends up with a bigger discount than the first coupon allowed.
  // Each discount is still capped at the subtotal, so the total stays at or above zero.
  impl: async (_original: unknown, sid: string, code: string) => {
    if (typeof code !== 'string' || !Object.hasOwn(COUPONS, code)) throw new ApiError(400, 'bad_coupon');
    const store = getStore();
    const cart = await store.getCart(sid);
    const sub = cart.lines.reduce((s, l) => s + priceOf(l.productId) * l.qty, 0);
    const keep = cart.couponCode !== null && worth(cart.couponCode, sub) >= worth(code, sub) ? cart.couponCode : code;
    const saved: Cart = { ...cart, couponCode: keep, version: cart.version + 1 };
    await store.saveCart(saved);
    return saved;
  },
};
