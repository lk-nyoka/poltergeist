import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';
import type { Cart } from '@/store/types';

type SetQty = (sid: string, productId: string, qty: number) => Promise<Cart>;

export const override: MutantOverride = {
  id: '0dd88e140f1a',
  seam: 'cart/setQty',
  public: false,
  // Lower bound off by one: zero is accepted.
  impl: async (original: SetQty, sid: string, productId: string, qty: number) => {
    if (qty === 0) {
      const store = getStore();
      const cart = await store.getCart(sid);
      if (cart.lines.some((l) => l.productId === productId)) {
        const saved: Cart = {
          ...cart,
          version: cart.version + 1,
          lines: cart.lines.map((l) => (l.productId === productId ? { ...l, qty: 0 } : l)),
        };
        await store.saveCart(saved);
        return saved;
      }
    }
    return original(sid, productId, qty);
  },
};
