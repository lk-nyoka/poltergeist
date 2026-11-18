import type { MutantOverride } from '@poltergeist/protocol';
import { DialogNoEscape } from './m-d1a65de84115.client';

export const override: MutantOverride = {
  id: '245c81c1d8b8',
  seam: 'render/CheckoutDialog',
  public: false,
  impl: () => DialogNoEscape,
};
