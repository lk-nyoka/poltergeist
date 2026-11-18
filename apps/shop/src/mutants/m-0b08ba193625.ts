import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';
import type { Cart } from '@/store/types';

type AddLine = (sid: string, productId: string, qty: number) => Promise<Cart>;

export const override: MutantOverride = {
  id: '0b08ba193625',
  seam: 'cart/addLine',
  public: false,
  // Only the increment is validated; the running total on the line may pass 10.
  impl: async (original: AddLine, sid: string, productId: string, qty: number) => {
    const store = getStore();
    const cart = await store.getCart(sid);
    const existing = cart.lines.find((l) => l.productId === productId);
    if (existing && Number.isInteger(qty) && qty >= 1 && qty <= 10 && existing.qty + qty > 10) {
      const saved: Cart = {
        ...cart,
        version: cart.version + 1,
        lines: cart.lines.map((l) => (l.productId === productId ? { ...l, qty: l.qty + qty } : l)),
      };
      await store.saveCart(saved);
      return saved;
    }
    return original(sid, productId, qty);
  },
};
