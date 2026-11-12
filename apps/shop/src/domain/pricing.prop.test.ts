// @vitest-environment node
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { PRODUCTS, priceOf } from './catalogue';
import { subtotal, discount, total } from './pricing';

const lines = fc
  .uniqueArray(fc.constantFrom(...PRODUCTS.map((p) => p.id)), { minLength: 1, maxLength: 8 })
  .chain((ids) => fc.tuple(...ids.map((productId) => fc.integer({ min: 1, max: 10 }).map((qty) => ({ productId, qty })))));
const coupon = fc.constantFrom<string | null>(null, 'SPOOKY5', 'HAUNT15');

/** Independent integer-only reference: no floats, rounded half-up once. */
function reference(ls: { productId: string; qty: number }[], code: string | null): number {
  const sub = ls.reduce((s, l) => s + priceOf(l.productId) * l.qty, 0);
  if (code === 'SPOOKY5') return sub - Math.min(500, sub);
  if (code === 'HAUNT15') return Math.floor((sub * 85 + 50) / 100);
  return sub;
}

describe('pricing', () => {
  it('total equals the independent reference, is a non-negative integer, and never exceeds the subtotal', () => {
    fc.assert(
      fc.property(lines, coupon, (ls, code) => {
        const t = total(ls, code);
        expect(t).toBe(reference(ls, code));
        expect(Number.isInteger(t)).toBe(true);
        expect(t).toBeGreaterThanOrEqual(0);
        expect(t).toBeLessThanOrEqual(subtotal(ls));
      }),
    );
  });

  it('the discount never exceeds the subtotal', () => {
    fc.assert(
      fc.property(fc.integer({ min: 0, max: 1_000_000 }), coupon, (sub, code) => {
        expect(discount(sub, code)).toBeLessThanOrEqual(sub);
      }),
    );
  });

  it('rounds exact halves up, once, at the end', () => {
    // 1850 × 0.85 = 1572.5 → 1573
    expect(total([{ productId: 'lantern', qty: 1 }], 'HAUNT15')).toBe(1573);
    // 1499 × 0.85 = 1274.15 → 1274
    expect(total([{ productId: 'candle', qty: 1 }], 'HAUNT15')).toBe(1274);
  });

  it('the cheapest product costs more than every fixed coupon (REQ-1.2)', () => {
    expect(Math.min(...PRODUCTS.map((p) => p.price))).toBeGreaterThan(500);
  });
});
