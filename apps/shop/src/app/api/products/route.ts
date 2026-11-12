import { handle } from '@/lib/http';
import { withRequest } from '@/seams/context';
import { PRODUCTS, listCoupons } from '@/domain/catalogue';

export const GET = handle(async (req) =>
  withRequest(req, async () => Response.json({ products: PRODUCTS, coupons: listCoupons() })));
