import type { MutantOverride } from '@poltergeist/protocol';
import type { Order } from '@/store/types';

const served = new Set<string>();

export const override: MutantOverride = {
  id: 'e8ebd2aee321',
  seam: 'orders/getForSession',
  public: false,
  // The order is served once; a refresh of the receipt finds nothing.
  impl: async (original: (sid: string, id: string) => Promise<Order | null>, sid: string, id: string) => {
    const o = await original(sid, id);
    if (!o) return o;
    const key = `${sid}:${id}`;
    if (served.has(key)) return null;
    served.add(key);
    return o;
  },
};
