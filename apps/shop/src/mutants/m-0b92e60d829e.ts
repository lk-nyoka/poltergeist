import type { MutantOverride } from '@poltergeist/protocol';

export const override: MutantOverride = {
  id: '0b92e60d829e',
  seam: 'checkout/claim',
  public: false,
  // Claim keyed per attempt instead of per intent.
  impl: (original: (id: string) => Promise<boolean>, intentId: string) =>
    original(`${intentId}#${crypto.randomUUID()}`),
};
