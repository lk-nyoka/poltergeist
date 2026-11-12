import { handle, observedSession, requireSecret } from '@/lib/http';
import { toOrderRow } from '@/lib/oracle-dto';
import { getStore } from '@/store';

/** `?reads=1` adds the session's order_reads (the PrivacyLeak oracle's evidence). */
export const GET = handle(async (req) => {
  requireSecret(req);
  const { sid } = await observedSession(req);
  const store = getStore();
  const orders = (await store.listOrders(sid)).map(toOrderRow);
  if (new URL(req.url).searchParams.get('reads') === '1') {
    return Response.json({ orders, reads: await store.listOrderReads(sid) });
  }
  return Response.json({ orders });
});
