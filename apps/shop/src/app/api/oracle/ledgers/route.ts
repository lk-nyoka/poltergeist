import { handle, observedSession, requireSecret } from '@/lib/http';
import { toLedgerRow } from '@/lib/oracle-dto';
import { getStore } from '@/store';
import { CUSTOMER_START_CENTS, TILL_START_CENTS } from '@/store/types';

/**
 * Oracle read (design §10.2). Reads the store directly, never through a seam, so mutants cannot
 * hide what happened. The session is the one named by x-pg-observe, never the caller's cookie.
 */
export const GET = handle(async (req) => {
  requireSecret(req);
  const { sid } = await observedSession(req);
  const store = getStore();
  const [customer, till] = await Promise.all([store.listLedger(sid, 'customer'), store.listLedger(sid, 'till')]);
  return Response.json({
    customer: { start: CUSTOMER_START_CENTS, entries: customer.map(toLedgerRow) },
    till: { start: TILL_START_CENTS, entries: till.map(toLedgerRow) },
  });
});
