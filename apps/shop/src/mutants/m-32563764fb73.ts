import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';
import type { Cart } from '@/store/types';

type SetQty = (sid: string, productId: string, qty: number) => Promise<Cart>;

export const override: MutantOverride = {
  id: '32563764fb73',
  seam: 'cart/setQty',
  public: false,
  // Upper bound raised to 99.
  impl: async (original: SetQty, sid: string, productId: string, qty: number) => {
    if (Number.isInteger(qty) && qty > 10 && qty <= 99) {
      const store = getStore();
      const cart = await store.getCart(sid);
      if (cart.lines.some((l) => l.productId === productId)) {
        const saved: Cart = {
          ...cart,
          version: cart.version + 1,
          lines: cart.lines.map((l) => (l.productId === productId ? { ...l, qty } : l)),
        };
        await store.saveCart(saved);
        return saved;
      }
    }
    return original(sid, productId, qty);
  },
};
