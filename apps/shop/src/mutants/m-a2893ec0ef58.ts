import type { MutantOverride } from '@poltergeist/protocol';
import { PayButtonA2893 } from './m-a2893ec0ef58.client';

export const override: MutantOverride = {
  id: 'a2893ec0ef58',
  seam: 'render/PayButton',
  public: false,
  impl: () => PayButtonA2893,
};
