import type { MutantOverride } from '@poltergeist/protocol';
import { getStore } from '@/store';

export const override: MutantOverride = {
  id: '80c7d62b2e81',
  seam: 'checkout/claim',
  public: false,
  // Check-then-act instead of the atomic claim: two overlapping requests both see "no order yet".
  impl: async (_original: (id: string) => Promise<boolean>, intentId: string) => {
    const existing = await getStore().getOrderByIntent(intentId);
    return !existing;
  },
};
