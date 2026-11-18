import type { MutantOverride } from '@poltergeist/protocol';
import { DialogNoTrap } from './m-d1a65de84115.client';

export const override: MutantOverride = {
  id: 'd54ee7c1c218',
  seam: 'render/CheckoutDialog',
  public: false,
  impl: () => DialogNoTrap,
};
