import type { MutantOverride } from '@poltergeist/protocol';

export const override: MutantOverride = {
  id: '5b4434c4eb32',
  seam: 'checkout/claim',
  public: false,
  impl: async () => true,
};
