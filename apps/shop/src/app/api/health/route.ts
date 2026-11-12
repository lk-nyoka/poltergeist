import { errorResponse, handle } from '@/lib/http';
import { getStore } from '@/store';

/** One real store read, for the keep-alive job (REQ-11.5). */
export const GET = handle(async () => {
  const ok = await getStore().health().catch(() => false);
  return ok ? Response.json({ ok: true }) : errorResponse(503, 'unhealthy');
});
