import type { MutantOverride } from '@poltergeist/protocol';
import { ApiError } from '@/lib/http';
import { getStore } from '@/store';
import type { Order } from '@/store/types';

type Pay = (sid: string, intentId: string, name: unknown, address: unknown) => Promise<Order>;

export const override: MutantOverride = {
  id: '889dd6572f57',
  seam: 'checkout/pay',
  public: false,
  impl: async (original: Pay, sid: string, intentId: string, name: unknown, address: unknown) => {
    const prior = await getStore().getOrderByIntent(intentId);
    if (prior) throw new ApiError(409, 'stale_intent');
    return original(sid, intentId, name, address);
  },
};
