import { seam } from '@/seams/registry';
import { getStore } from '@/store';
import type { Order } from '@/store/types';

/**
 * C11: a session sees only its own orders. The session check lives here, in the seam,
 * not in the store query (REQ-9.6). The order_reads row is written by the caller AFTER this returns.
 */
export const getForSession = seam('orders/getForSession', async (sid: string, id: string): Promise<Order | null> => {
  const o = await getStore().getOrder(id);
  return o && o.sid === sid ? o : null;
});

export const listForSession = seam('orders/listForSession', async (sid: string): Promise<Order[]> => {
  const all = await getStore().listOrders(sid);
  return all.filter((o) => o.sid === sid);
});
