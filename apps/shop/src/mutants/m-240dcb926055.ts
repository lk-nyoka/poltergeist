import type { MutantOverride } from '@poltergeist/protocol';
import { priceOf } from '@/domain/catalogue';
import type { CartLine } from '@/store/types';

export const override: MutantOverride = {
  id: '240dcb926055',
  seam: 'pricing/subtotal',
  public: false,
  // Unit price looked up once, from the first line, and reused for every line.
  impl: (original: (lines: CartLine[]) => number, lines: CartLine[]) => {
    const first = lines[0];
    if (!first) return original(lines);
    const unit = priceOf(first.productId);
    for (const l of lines) priceOf(l.productId); // still 404s unknown ids
    return lines.reduce((s, l) => s + unit * l.qty, 0);
  },
};
