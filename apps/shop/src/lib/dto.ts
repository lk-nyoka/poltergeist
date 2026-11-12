import type { Order } from '@/store/types';

/** The order as clients see it. The internal session id is never sent. */
export function toOrderDto(o: Order) {
  return {
    id: o.id,
    intentId: o.intentId,
    items: o.items,
    couponCodes: o.couponCodes,
    totalCents: o.totalCents,
    name: o.name ?? null,
    address: o.address ?? null,
    createdAt: o.createdAt,
  };
}
