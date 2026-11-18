import type { MutantOverride } from '@poltergeist/protocol';
import { COUPONS, priceOf } from '@/domain/catalogue';
import type { CartLine } from '@/store/types';

export const override: MutantOverride = {
  id: 'c7e30ae5b9f9',
  seam: 'pricing/total',
  public: false,
  // Truncates to cents instead of rounding half-up.
  impl: (_original: unknown, lines: CartLine[], code: string | null) => {
    const sub = lines.reduce((s, l) => s + priceOf(l.productId) * l.qty, 0);
    const c = code ? COUPONS[code] : undefined;
    const raw = !c ? 0 : c.kind === 'fixed' ? c.cents : (sub * c.percent) / 100;
    return Math.floor(sub - Math.min(raw, sub));
  },
};
