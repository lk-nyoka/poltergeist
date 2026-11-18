import type { MutantOverride } from '@poltergeist/protocol';
import { DialogNoRestore } from './m-d1a65de84115.client';

export const override: MutantOverride = {
  id: '87b9050bb542',
  seam: 'render/CheckoutDialog',
  public: false,
  impl: () => DialogNoRestore,
};
