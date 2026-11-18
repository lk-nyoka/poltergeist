import type { MutantOverride } from '@poltergeist/protocol';

type View = { subtotalCents: number; couponCode: string | null; discountCents: number; totalCents: number };

export const override: MutantOverride = {
  id: '1612feeff687',
  seam: 'cart/view',
  public: false,
  // The summary reports the discount as the amount added to the subtotal (sign flipped),
  // so a coupon shows as a negative discount.
  impl: async (original: (sid: string) => Promise<View>, sid: string) => {
    const v = await original(sid);
    if (!v.couponCode) return v;
    return { ...v, discountCents: v.totalCents - v.subtotalCents };
  },
};
