import type { MutantOverride } from '@poltergeist/protocol';
import { COUPONS } from '@/domain/catalogue';

type View = { subtotalCents: number; couponCode: string | null; discountCents: number; totalCents: number };

export const override: MutantOverride = {
  id: 'dad499d1d20a',
  seam: 'cart/view',
  public: false,
  // The summary recomputes the total with its own rounding (round the discount first), so it can
  // differ by a cent from what checkout charges.
  impl: async (original: (sid: string) => Promise<View>, sid: string) => {
    const v = await original(sid);
    const c = v.couponCode ? COUPONS[v.couponCode] : undefined;
    if (!c || c.kind !== 'percent') return v;
    const d = Math.round((v.subtotalCents * c.percent) / 100);
    return { ...v, discountCents: d, totalCents: v.subtotalCents - d };
  },
};
