import type { MutantOverride } from '@poltergeist/protocol';
import { ApiError } from '@/lib/http';

export const override: MutantOverride = {
  id: '960b324404d2',
  seam: 'text/validateText',
  public: false,
  // Length is measured in UTF-16 units, so a valid 100-code-point text of astral characters is refused.
  impl: (original: (s: unknown) => string, s: unknown) => {
    const out = original(s);
    if (out.length > 100) throw new ApiError(400, 'bad_text');
    return out;
  },
};
