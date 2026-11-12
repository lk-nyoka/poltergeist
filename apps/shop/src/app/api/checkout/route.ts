import { z } from 'zod';
import { ApiError, handle, parseBody } from '@/lib/http';
import { checkLimit } from '@/lib/rate-limit';
import { toOrderDto } from '@/lib/dto';
import { withRequest } from '@/seams/context';
import * as checkout from '@/domain/checkout';

/** name/address are validated by the text/validateText seam (C10), not here. */
const Body = z.object({ name: z.unknown(), address: z.unknown() }).strict();

export const POST = handle(async (req) => {
  checkLimit('checkout', req);
  return withRequest(req, async (ctx) => {
    const key = req.headers.get('idempotency-key');
    if (!key) throw new ApiError(400, 'missing_key');
    const body = await parseBody(req, Body);
    const order = await checkout.pay(ctx.sid, key, body.name, body.address);
    return Response.json({ order: toOrderDto(order) }); // 200 for new and repeated payments (REQ-3.4)
  });
});
