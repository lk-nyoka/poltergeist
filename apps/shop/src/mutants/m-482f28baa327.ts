import type { MutantOverride } from '@poltergeist/protocol';
import type { Order } from '@/store/types';

export const override: MutantOverride = {
  id: '482f28baa327',
  seam: 'orders/getForSession',
  public: false,
  // The order id is assumed to be "<part>-<part>…" and its second part is read without checking it exists.
  impl: (original: (sid: string, id: string) => Promise<Order | null>, sid: string, id: string) => {
    void id.split('-')[1]!.length;
    return original(sid, id);
  },
};
