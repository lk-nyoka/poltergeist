import type { MutantOverride } from '@poltergeist/protocol';
import { COUPONS } from '@/domain/catalogue';
import { ApiError } from '@/lib/http';
import { getStore } from '@/store';
import type { Cart } from '@/store/types';

export const override: MutantOverride = {
  id: 'ddff4d3e0d9c',
  seam: 'cart/applyCoupon',
  public: false,
  // No "already has a coupon" check: the new code silently replaces the first.
  impl: async (_original: unknown, sid: string, code: string) => {
    if (typeof code !== 'string' || !Object.hasOwn(COUPONS, code)) throw new ApiError(400, 'bad_coupon');
    const store = getStore();
    const cart = await store.getCart(sid);
    const saved: Cart = { ...cart, couponCode: code, version: cart.version + 1 };
    await store.saveCart(saved);
    return saved;
  },
};
