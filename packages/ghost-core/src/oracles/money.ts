/** Money oracles: DoubleCharge, StateLoss, TillLoss, QuantityBreach. They read ledgers and orders only. */
import type { Oracle, OracleHit } from './types';
import { referenceTotal } from './reference';

const dollars = (cents: number) => `$${(Math.abs(cents) / 100).toFixed(2)}`;

/** More than one customer debit shares one `intent_id`. */
export const DoubleCharge: Oracle = (obs) => {
  const groups = new Map<string, { id: string | number; amount: number }[]>();
  for (const e of obs.ledgers.customer) {
    if (e.amount_cents >= 0 || !e.intent_id) continue;
    const g = groups.get(e.intent_id) ?? [];
    g.push({ id: e.id, amount: e.amount_cents });
    groups.set(e.intent_id, g);
  }
  const hits: OracleHit[] = [];
  for (const [intentId, g] of groups) {
    if (g.length < 2) continue;
    hits.push({
      oracle: 'DoubleCharge',
      rule: 'C1',
      title: 'One purchase was charged more than once',
      harm: `The customer's bank shows ${g.length} debits of ${dollars(g[0]!.amount)} for a single purchase.`,
      evidence: { intentId, debits: g.length, amountsCents: g.map((x) => x.amount), entryIds: g.map((x) => x.id) },
    });
  }
  return hits;
};

/** A customer debit exists for an intent, but its order is gone after a refresh or back step. */
export const StateLoss: Oracle = (obs) => {
  const debited = new Set(obs.ledgers.customer.filter((e) => e.amount_cents < 0 && e.intent_id).map((e) => e.intent_id!));
  return obs.refreshChecks
    .filter((c) => !c.orderVisible && debited.has(c.intentId))
    .map((c) => ({
      oracle: 'StateLoss' as const,
      rule: 'C2' as const,
      title: 'A paid order vanished after a refresh',
      harm: 'The customer was charged, but the shop no longer shows their order.',
      evidence: { intentId: c.intentId },
    }));
};

/** The till goes down, an order total is below zero, or a total differs from the reference total. */
export const TillLoss: Oracle = (obs) => {
  const hits: OracleHit[] = [];
  const tillBalance = obs.ledgers.tillStart + obs.ledgers.till.reduce((a, e) => a + e.amount_cents, 0);
  if (tillBalance < obs.ledgers.tillStart) {
    hits.push({
      oracle: 'TillLoss',
      rule: 'C6',
      title: 'The till lost money on sales',
      harm: `The shop's till is down ${dollars(obs.ledgers.tillStart - tillBalance)}; there is no refund feature, so this was a pricing bug.`,
      evidence: { reason: 'till-below-start', start: obs.ledgers.tillStart, balance: tillBalance },
    });
  }
  for (const o of obs.orders) {
    const expected = referenceTotal(o, obs.clean);
    const negative = o.total_cents < 0;
    const mismatch = expected !== null && o.total_cents !== expected;
    if (!negative && !mismatch) continue;
    const badQty = o.items.some((l) => !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 10);
    hits.push({
      oracle: 'TillLoss',
      rule: badQty
        ? 'C3'
        : o.coupon_codes.length > 1
          ? 'C4'
          : negative || !Number.isInteger(o.total_cents)
            ? 'C6'
            : 'C5',
      title: negative ? 'An order total went below zero' : 'An order was priced wrongly',
      harm:
        expected !== null && o.total_cents < expected
          ? `The shop charged ${dollars(o.total_cents)} for an order worth ${dollars(expected)}.`
          : `The customer was billed ${dollars(o.total_cents)} instead of the correct amount.`,
      evidence: {
        reason: negative ? 'negative-total' : 'total-mismatch',
        orderId: o.id,
        actualCents: o.total_cents,
        expectedCents: expected,
        couponCodes: o.coupon_codes,
      },
    });
  }
  return hits;
};

/** An accepted order line has a non-whole quantity, or one outside 1–10. */
export const QuantityBreach: Oracle = (obs) =>
  obs.orders.flatMap((o) =>
    o.items
      .filter((l) => !Number.isInteger(l.qty) || l.qty < 1 || l.qty > 10)
      .map((l) => ({
        oracle: 'QuantityBreach' as const,
        rule: 'C3' as const,
        title: 'The shop accepted an impossible quantity',
        harm: `The warehouse was told to pack ${l.qty} of one product, which no real order can contain.`,
        evidence: { orderId: o.id, productId: l.productId, qty: l.qty },
      })),
  );
