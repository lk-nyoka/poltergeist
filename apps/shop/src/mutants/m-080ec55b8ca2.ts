import type { MutantOverride } from '@poltergeist/protocol';
import { CartLine080ec } from './m-080ec55b8ca2.client';

export const override: MutantOverride = {
  id: '080ec55b8ca2',
  seam: 'render/CartLine',
  public: false,
  impl: () => CartLine080ec,
};
