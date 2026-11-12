import { ApiError, handle } from '@/lib/http';
import { toOrderDto } from '@/lib/dto';
import { withRequest } from '@/seams/context';
import { getStore } from '@/store';
import * as orders from '@/domain/orders';

export const GET = handle<{ params: Promise<{ id: string }> }>(async (req, { params }) =>
  withRequest(req, async (ctx) => {
    const { id } = await params;
    const order = await orders.getForSession(ctx.sid, id);
    if (!order) throw new ApiError(404, 'not_found');
    // REQ-4.2: recorded AFTER the seam returns, outside any seam, and only when an order row is actually sent.
    await getStore().recordOrderRead(ctx.sid, order.id);
    return Response.json({ order: toOrderDto(order) });
  }));
