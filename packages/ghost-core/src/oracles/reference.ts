import type { CleanProducts, OrderRecord } from '../observer';

/**
 * The oracle's own reference total (brief §7.1, TillLoss):
 * Σ price × qty − min(discount, subtotal), rounded half-up once, using `coupon_codes[0]` only.
 * Prices and coupon values come from `cleanProducts()`, never from the shop under test.
 * Returns null when a product or coupon is unknown, because then no reference exists.
 */
export function referenceTotal(order: OrderRecord, clean: CleanProducts): number | null {
  let subtotal = 0;
  for (const line of order.items) {
    const price = clean.prices[line.productId];
    if (price === undefined) return null;
    subtotal += price * line.qty;
  }
  const code = order.coupon_codes[0];
  const coupon = code === undefined ? undefined : clean.coupons[code];
  if (code !== undefined && coupon === undefined) return null;
  const discount =
    coupon === undefined ? 0 : coupon.kind === 'fixed' ? (coupon.cents ?? 0) : (subtotal * (coupon.percent ?? 0)) / 100;
  return Math.floor(subtotal - Math.min(discount, subtotal) + 0.5 + 1e-9);
}
