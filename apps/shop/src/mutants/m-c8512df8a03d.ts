import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';
import type { Order } from '@/store/types';

type Pay = (sid: string, intentId: string, name: unknown, address: unknown) => Promise<Order>;

export const override: MutantOverride = {
  id: 'c8512df8a03d',
  seam: 'checkout/pay',
  public: false,
  // The cart survives a successful payment, so back navigation can pay for it again.
  impl: async (original: Pay, sid: string, intentId: string, name: unknown, address: unknown) => {
    const store = getStore();
    const before = await store.getCart(sid);
    const prior = await store.getOrderByIntent(intentId);
    const order = await original(sid, intentId, name, address);
    if (!prior) await store.saveCart({ ...before, version: before.version + 1 });
    return order;
  },
};
