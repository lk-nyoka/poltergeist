import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';
import type { Cart } from '@/store/types';
import { findProduct } from '@/domain/catalogue';

type AddLine = (sid: string, productId: string, qty: number) => Promise<Cart>;

export const override: MutantOverride = {
  id: 'f1860946d9e4',
  seam: 'cart/addLine',
  public: false,
  // The whole-number check is gone; fractional quantities within 1–10 are stored as sent.
  impl: async (original: AddLine, sid: string, productId: string, qty: number) => {
    if (typeof qty === 'number' && Number.isFinite(qty) && !Number.isInteger(qty) && qty >= 1 && qty <= 10 && findProduct(productId)) {
      const store = getStore();
      const cart = await store.getCart(sid);
      const existing = cart.lines.find((l) => l.productId === productId);
      const lines = existing
        ? cart.lines.map((l) => (l.productId === productId ? { ...l, qty: l.qty + qty } : l))
        : [...cart.lines, { productId, qty }];
      const saved: Cart = { ...cart, version: cart.version + 1, lines };
      await store.saveCart(saved);
      return saved;
    }
    return original(sid, productId, qty);
  },
};
