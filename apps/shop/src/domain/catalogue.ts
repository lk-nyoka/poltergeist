import { ApiError } from '@/lib/http';

export type Product = {
  id: string;
  name: string;
  /** Integer USD cents */
  price: number;
  description: string;
  altText: string;
};

/** Plain data, not a seam (design §6.1). The cheapest product (1200) costs more than every fixed coupon (REQ-1.2). */
export const PRODUCTS: readonly Product[] = [
  { id: 'kettle', name: 'Haunted Kettle', price: 2400, description: 'Whistles on its own at 3 a.m. Holds one litre.', altText: 'A black kettle with steam shaped like a ghost' },
  { id: 'lantern', name: 'Ghost Lantern', price: 1850, description: 'A paper lantern that glows pale green without a flame.', altText: 'A paper lantern glowing pale green' },
  { id: 'mug', name: 'Cursed Mug', price: 1200, description: 'Dishwasher safe. Coffee stays warm for suspiciously long.', altText: 'A chipped white mug with a crack shaped like a face' },
  { id: 'broom', name: "Witch's Broom", price: 3500, description: 'Hand-bound straw with a twisted ash handle. For sweeping only.', altText: 'A straw broom with a twisted handle' },
  { id: 'candle', name: 'Skull Candle', price: 1499, description: 'Unscented. Burns for twenty hours and never drips on the left.', altText: 'A white candle carved into a skull' },
  { id: 'plant', name: 'Never-Dying Fern', price: 2100, description: 'A convincing fern that needs no water, light or hope.', altText: 'A fake fern in a cracked pot' },
  { id: 'cauldron', name: 'Cauldron Bowl', price: 2999, description: 'A small iron cauldron, seasoned and ready for soup.', altText: 'A small iron cauldron used as a bowl' },
  { id: 'clock', name: 'Raven Clock', price: 4200, description: 'Keeps good time. The raven keeps its own counsel.', altText: 'A wall clock with a raven perched on top' },
];

export type Coupon =
  | { code: string; kind: 'fixed'; cents: number }
  | { code: string; kind: 'percent'; percent: number };

export const COUPONS: Readonly<Record<string, Coupon>> = {
  SPOOKY5: { code: 'SPOOKY5', kind: 'fixed', cents: 500 },
  HAUNT15: { code: 'HAUNT15', kind: 'percent', percent: 15 },
};

export const listCoupons = (): Coupon[] => Object.values(COUPONS);

export function findProduct(productId: string): Product | undefined {
  return PRODUCTS.find((p) => p.id === productId);
}

/** Canonical server price in cents. Unknown ids are a 404, never a crash (C12). */
export function priceOf(productId: string): number {
  const p = findProduct(productId);
  if (!p) throw new ApiError(404, 'no_product');
  return p.price;
}
