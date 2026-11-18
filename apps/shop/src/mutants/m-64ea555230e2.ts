import type { MutantOverride } from '@poltergeist/protocol';

export const override: MutantOverride = {
  id: '64ea555230e2',
  seam: 'text/validateText',
  public: false,
  // Over-long text is cut to 100 code points and accepted instead of being refused.
  impl: (original: (s: unknown) => string, s: unknown) => {
    if (typeof s === 'string' && s.isWellFormed() && !/[\u0000-\u001F]/.test(s)) {
      const cps = [...s];
      if (cps.length > 100) return original(cps.slice(0, 100).join(''));
    }
    return original(s);
  },
};
