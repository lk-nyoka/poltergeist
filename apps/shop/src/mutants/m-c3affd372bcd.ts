import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';
import type { Order } from '@/store/types';

export const override: MutantOverride = {
  id: 'c3affd372bcd',
  seam: 'orders/listForSession',
  public: false,
  // The list query was widened to "orders for this shop" and the per-session filter dropped.
  impl: async (original: (sid: string) => Promise<Order[]>, sid: string): Promise<Order[]> => {
    const mine = await original(sid);
    const store = getStore();
    const others = await store.listOrders('stranger');
    return [...mine, ...others];
  },
};
