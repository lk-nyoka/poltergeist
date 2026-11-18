import type { MutantOverride } from '@poltergeist/protocol';

export const override: MutantOverride = {
  id: '61fead2fb131',
  seam: 'pricing/discount',
  public: false,
  // The discount is rounded to cents on its own, then the total is rounded again: two roundings.
  impl: (original: (sub: number, code: string | null) => number, sub: number, code: string | null) =>
    Math.round(original(sub, code)),
};
