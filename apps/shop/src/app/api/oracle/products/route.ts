import { handle, requireSecret } from '@/lib/http';
import { cleanContext } from '@/seams/context';
import { PRODUCTS, listCoupons } from '@/domain/catalogue';

/** Canonical prices and coupon values, computed with NO mutants active (REQ-10.5). */
export const GET = handle(async (req) => {
  requireSecret(req);
  return cleanContext(async () =>
    Response.json({
      products: PRODUCTS.map((p) => ({ id: p.id, name: p.name, price: p.price, description: p.description, altText: p.altText })),
      coupons: listCoupons(),
    }));
});
