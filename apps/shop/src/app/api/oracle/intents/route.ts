import { handle, observedSession, requireSecret } from '@/lib/http';
import { toIntentRow } from '@/lib/oracle-dto';
import { getStore } from '@/store';

/** Ghosts read the checkout intent id here; they never mint one. */
export const GET = handle(async (req) => {
  requireSecret(req);
  const { sid } = await observedSession(req);
  const intents = await getStore().listIntents(sid);
  return Response.json({ intents: intents.map(toIntentRow) });
});
