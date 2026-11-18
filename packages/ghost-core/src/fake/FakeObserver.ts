import type { ShopObserver } from '../observer';
import type { FakeShop } from './FakeShop';

/** ShopObserver over a FakeShop. It reads shop state, never page content. */
export function fakeObserver(shop: FakeShop): ShopObserver {
  return {
    async ledgers(token) {
      return shop.ledgers(token);
    },
    async orders(token, opts) {
      const r = shop.orders(token);
      return { orders: r.orders, reads: opts.reads ? r.reads : [] };
    },
    async intents(token) {
      return shop.intents(token);
    },
    async cleanProducts() {
      return shop.cleanProducts();
    },
  };
}
