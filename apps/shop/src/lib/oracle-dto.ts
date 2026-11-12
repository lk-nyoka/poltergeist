import type { Intent, LedgerEntry, Order } from '@/store/types';

/**
 * Oracle rows use the snake_case shapes of the protocol's Oracle*Response schemas
 * (packages/protocol/src/api.ts), so the Séance server, scorer and CLI share one contract.
 */
export const toLedgerRow = (e: LedgerEntry) => ({
  id: e.id,
  sid: e.sid,
  ledger: e.ledger,
  amount_cents: e.amountCents,
  memo: e.memo,
  intent_id: e.intentId ?? null,
  created_at: e.createdAt,
});

export const toOrderRow = (o: Order) => ({
  id: o.id,
  sid: o.sid,
  intent_id: o.intentId,
  items: o.items,
  coupon_codes: o.couponCodes,
  total_cents: o.totalCents,
  created_at: o.createdAt,
});

export const toIntentRow = (i: Intent) => ({ id: i.id, sid: i.sid, created_at: i.createdAt });
