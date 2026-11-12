import { handle } from '@/lib/http';
import { withRequest } from '@/seams/context';
import * as checkout from '@/domain/checkout';

/** Mints or returns the checkout intent for the cart's current version (REQ-3.1). */
export const POST = handle(async (req) =>
  withRequest(req, async (ctx) => Response.json(await checkout.open(ctx.sid))));
