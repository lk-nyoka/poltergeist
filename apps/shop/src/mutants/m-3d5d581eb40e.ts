import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';
import type { Order } from '@/store/types';

type Pay = (sid: string, intentId: string, name: unknown, address: unknown) => Promise<Order>;

export const override: MutantOverride = {
  id: '3d5d581eb40e',
  seam: 'checkout/pay',
  public: true,
  impl: async (original: Pay, sid: string, intentId: string, name: unknown, address: unknown) => {
    const store = getStore();
    const prior = await store.getOrderByIntent(intentId);
    const order = await original(sid, intentId, name, address);
    if (!prior) {
      await store.addLedger({
        sid,
        ledger: 'customer',
        amountCents: -order.totalCents,
        memo: `Bank: $${(order.totalCents / 100).toFixed(2)} debited`,
        intentId,
      });
    }
    return order;
  },
};
