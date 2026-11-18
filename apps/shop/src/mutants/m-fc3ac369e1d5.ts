import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';
import type { Order } from '@/store/types';

export const override: MutantOverride = {
  id: 'fc3ac369e1d5',
  seam: 'orders/getForSession',
  public: false,
  // The owner check is gone: any order id resolves for any session.
  impl: async (_original: unknown, _sid: string, id: string): Promise<Order | null> => getStore().getOrder(id),
};
