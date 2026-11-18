import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';
import type { Order } from '@/store/types';

type Pay = (sid: string, intentId: string, name: unknown, address: unknown) => Promise<Order>;

export const override: MutantOverride = {
  id: 'b810945e0571',
  seam: 'checkout/pay',
  public: false,
  // The intent's owner is not compared with the caller: the payment runs as whoever owns the intent.
  impl: async (original: Pay, sid: string, intentId: string, name: unknown, address: unknown) => {
    const intent = await getStore().getIntent(intentId);
    return original(intent ? intent.sid : sid, intentId, name, address);
  },
};
