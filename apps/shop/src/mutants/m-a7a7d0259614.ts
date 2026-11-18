import type { MutantOverride } from '@poltergeist/protocol';

export const override: MutantOverride = {
  id: 'a7a7d0259614',
  seam: 'text/validateText',
  public: false,
  // Cleans up "stray spaces" before validating and returns the cleaned text.
  impl: (original: (s: unknown) => string, s: unknown) => original(typeof s === 'string' ? s.trim() : s),
};
