import { seam } from '@/seams/registry';
import type { CartLine } from '@/store/types';
import { COUPONS, priceOf } from './catalogue';

export const subtotal = seam('pricing/subtotal', (lines: CartLine[]) =>
  lines.reduce((s, l) => s + priceOf(l.productId) * l.qty, 0));

export const discount = seam('pricing/discount', (sub: number, code: string | null) => {
  const c = code ? COUPONS[code] : undefined;
  if (!c) return 0;
  return c.kind === 'fixed' ? Math.min(c.cents, sub) : (sub * c.percent) / 100; // may be fractional
});

/** Round half-up once, at the end (C6). The 1e-9 guards binary noise when sub − d lands exactly on .5. */
export const total = seam('pricing/total', (lines: CartLine[], code: string | null) => {
  const sub = subtotal(lines);
  const d = Math.min(discount(sub, code), sub);
  return Math.floor(sub - d + 0.5 + 1e-9);
});
