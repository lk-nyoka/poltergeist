import { z } from 'zod';
import { ApiError, handle, parseBody } from '@/lib/http';
import { checkLimit } from '@/lib/rate-limit';
import { withRequest } from '@/seams/context';
import * as reviews from '@/domain/reviews';

/** The review body is validated by the text/validateText seam (C10), not here. */
const Body = z.object({ productId: z.string(), body: z.unknown() }).strict();

export const GET = handle(async (req) =>
  withRequest(req, async (ctx) => {
    const productId = new URL(req.url).searchParams.get('productId');
    if (!productId) throw new ApiError(400, 'bad_request');
    const list = await reviews.list(ctx.sid, productId);
    return Response.json({ reviews: list.map((r) => ({ productId: r.productId, body: r.body, createdAt: r.createdAt })) });
  }));

export const POST = handle(async (req) => {
  checkLimit('reviews', req);
  return withRequest(req, async (ctx) => {
    const { productId, body } = await parseBody(req, Body);
    const review = await reviews.add(ctx.sid, productId, body);
    return Response.json({ review });
  });
});
