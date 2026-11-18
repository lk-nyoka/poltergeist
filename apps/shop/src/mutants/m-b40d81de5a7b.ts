import type { MutantOverride } from '@poltergeist/protocol';
import { CartLineB40d8 } from './m-b40d81de5a7b.client';

export const override: MutantOverride = {
  id: 'b40d81de5a7b',
  seam: 'render/CartLine',
  public: false,
  impl: () => CartLineB40d8,
};
