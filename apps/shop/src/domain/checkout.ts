import { seam } from '@/seams/registry';
import { ApiError } from '@/lib/http';
import { validateText } from '@/lib/text';
import { getStore } from '@/store';
import type { CartLine, Order } from '@/store/types';
import { get as getCart } from './cart';
import { total } from './pricing';

export type CheckoutOpen = { intentId: string; total: number; lines: CartLine[] };

/** Opens (or re-opens) checkout. The server mints the intent id: `cart_id:version` (REQ-3.1). */
export const open = seam('checkout/open', async (sid: string): Promise<CheckoutOpen> => {
  const cart = await getCart(sid);
  if (cart.lines.length === 0) throw new ApiError(400, 'empty_cart');
  const intentId = `${cart.id}:${cart.version}`;
  await getStore().upsertIntent({ id: intentId, sid });
  return { intentId, total: total(cart.lines, cart.couponCode), lines: cart.lines };
});

/** Atomic claim of an intent (C1). Exactly one caller gets `true`. */
export const claim = seam('checkout/claim', async (intentId: string): Promise<boolean> =>
  getStore().claimIntent(intentId));

const sleep = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

/** Another request holds the claim: wait briefly for its order (REQ-3.3). */
async function waitForOrder(intentId: string): Promise<Order> {
  const store = getStore();
  for (let i = 0; i < 200; i++) {
    const o = await store.getOrderByIntent(intentId);
    if (o) return o;
    await sleep(10);
  }
  throw new ApiError(409, 'payment_in_progress');
}

const dollars = (cents: number) => `$${(cents / 100).toFixed(2)}`;

export const pay = seam('checkout/pay', async (sid: string, intentId: string, name: unknown, address: unknown): Promise<Order> => {
  const store = getStore();

  // 1. The intent must exist and belong to this session.
  const intent = await store.getIntent(intentId);
  if (!intent || intent.sid !== sid) throw new ApiError(409, 'stale_intent');

  // 2. C10: validate the customer text.
  const customerName = validateText(name);
  const customerAddress = validateText(address);

  // 3. A paid intent returns its existing order and never charges again (REQ-3.4, C2).
  const existing = await store.getOrderByIntent(intentId);
  if (existing) return existing;

  // 4. An unpaid intent must still match the cart's current id and version.
  const cart = await getCart(sid);
  if (`${cart.id}:${cart.version}` !== intentId) throw new ApiError(409, 'stale_intent');
  if (cart.lines.length === 0) throw new ApiError(400, 'empty_cart');

  // 5. Exactly one caller wins the claim; everyone else waits for that order (C1).
  if (!(await claim(intentId))) return waitForOrder(intentId);

  // 6. Charge once: customer debit, till credit, order (REQ-3.5).
  const amount = total(cart.lines, cart.couponCode);
  await store.addLedger({ sid, ledger: 'customer', amountCents: -amount, memo: `Bank: ${dollars(amount)} debited`, intentId });
  await store.addLedger({ sid, ledger: 'till', amountCents: amount, memo: 'Sale', intentId });
  const orderId = crypto.randomUUID();
  await store.insertOrder({
    id: orderId,
    sid,
    intentId,
    items: cart.lines,
    couponCodes: cart.couponCode ? [cart.couponCode] : [],
    totalCents: amount,
    name: customerName,
    address: customerAddress,
  });

  // 7. Start a new empty cart.
  await store.saveCart({ id: crypto.randomUUID(), sid, version: 0, lines: [], couponCode: null });

  return (await store.getOrder(orderId))!;
});
