import type { MutantOverride } from '@poltergeist/protocol';
import { ApiError } from '@/lib/http';

export const override: MutantOverride = {
  id: '8031c756f2f3',
  seam: 'text/validateText',
  public: false,
  // Only some control characters are rejected: tab, newline and the rest of the range pass.
  impl: (original: (s: unknown) => string, s: unknown) => {
    if (typeof s === 'string' && s.isWellFormed()) {
      const n = [...s].length;
      if (n < 1 || n > 100) throw new ApiError(400, 'bad_text');
      if (/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/.test(s)) throw new ApiError(400, 'bad_text');
      return s;
    }
    return original(s);
  },
};
