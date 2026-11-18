import type { MutantOverride } from '@poltergeist/protocol';
import { priceOf } from '@/domain/catalogue';
import type { CartLine } from '@/store/types';

export const override: MutantOverride = {
  id: '32b8dfabc8c5',
  seam: 'pricing/subtotal',
  public: false,
  // Uses the rounded "display" dollar price ($14.99 → $15) instead of the exact catalogue cents.
  impl: (_original: unknown, lines: CartLine[]) =>
    lines.reduce((s, l) => s + Math.round(priceOf(l.productId) / 100) * 100 * l.qty, 0),
};
