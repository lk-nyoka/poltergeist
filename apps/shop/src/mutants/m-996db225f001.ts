import type { MutantOverride } from '@poltergeist/protocol';
import { ApiError } from '@/lib/http';
import { getStore } from '@/store';
import type { Cart } from '@/store/types';

type Apply = (sid: string, code: string) => Promise<Cart>;

export const override: MutantOverride = {
  id: '996db225f001',
  seam: 'cart/applyCoupon',
  public: false,
  // The second coupon is rejected, but the rejection path also clears the first one.
  impl: async (original: Apply, sid: string, code: string) => {
    try {
      return await original(sid, code);
    } catch (e) {
      if (e instanceof ApiError && e.status === 409) {
        const store = getStore();
        const cart = await store.getCart(sid);
        await store.saveCart({ ...cart, couponCode: null, version: cart.version + 1 });
      }
      throw e;
    }
  },
};
