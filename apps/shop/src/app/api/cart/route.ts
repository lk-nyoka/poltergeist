import { z } from 'zod';
import { handle, parseBody } from '@/lib/http';
import { withRequest } from '@/seams/context';
import * as cart from '@/domain/cart';

/**
 * Strict bodies reject any client-sent price, total or discount (C5).
 * Quantity RANGE and integer-ness are deliberately NOT checked here: that rule (C3) lives in the cart seam.
 */
const Body = z.discriminatedUnion('op', [
  z.object({ op: z.literal('add'), productId: z.string(), qty: z.number() }).strict(),
  z.object({ op: z.literal('set'), productId: z.string(), qty: z.number() }).strict(),
  z.object({ op: z.literal('remove'), productId: z.string() }).strict(),
  z.object({ op: z.literal('coupon'), code: z.string() }).strict(),
]);

export const GET = handle(async (req) =>
  withRequest(req, async (ctx) => Response.json({ cart: await cart.view(ctx.sid) })));

export const POST = handle(async (req) =>
  withRequest(req, async (ctx) => {
    const body = await parseBody(req, Body);
    switch (body.op) {
      case 'add':
        await cart.addLine(ctx.sid, body.productId, body.qty);
        break;
      case 'set':
        await cart.setQty(ctx.sid, body.productId, body.qty);
        break;
      case 'remove':
        await cart.removeLine(ctx.sid, body.productId);
        break;
      case 'coupon':
        await cart.applyCoupon(ctx.sid, body.code);
        break;
    }
    return Response.json({ cart: await cart.view(ctx.sid) });
  }));
