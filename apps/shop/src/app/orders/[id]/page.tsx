import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { findProduct } from "@/domain/catalogue";
import * as orders from "@/domain/orders";
import { formatCents } from "@/lib/format";
import { shopUrlServer } from "@/lib/shop-url.server";
import { withPage } from "@/seams/context";
import { getStore } from "@/store";

export const metadata: Metadata = { title: "Order confirmation" };

export default async function OrderPage(props: PageProps<"/orders/[id]">) {
  const { id } = await props.params;
  const [homeHref, ordersHref] = await Promise.all([shopUrlServer("/"), shopUrlServer("/orders")]);

  const order = await withPage(async (ctx) => {
    const found = await orders.getForSession(ctx.sid, id);
    if (!found) return null;
    // REQ-4.2: recorded AFTER the seam returns, outside any seam, and only when an order row is actually shown.
    await getStore().recordOrderRead(ctx.sid, found.id);
    return found;
  });
  if (!order) notFound();

  return (
    <article className="max-w-2xl">
      <h1 className="text-2xl font-semibold text-zinc-900">Thank you for your order</h1>
      <p className="mt-1 text-sm text-zinc-600">
        Order <span data-testid="order-id">{order.id}</span>
      </p>

      <section aria-labelledby="receipt-heading" className="mt-6 rounded-lg border border-zinc-200 bg-white p-5">
        <h2 id="receipt-heading" className="text-lg font-semibold text-zinc-900">
          Receipt
        </h2>
        <ul role="list" className="mt-3 divide-y divide-zinc-200 text-sm">
          {order.items.map((item) => (
            <li key={item.productId} className="flex justify-between py-2">
              <span>
                {findProduct(item.productId)?.name ?? item.productId} × {item.qty}
              </span>
            </li>
          ))}
        </ul>
        {order.couponCodes.length > 0 ? (
          <p className="mt-3 text-sm text-zinc-700">Coupon used: {order.couponCodes.join(", ")}</p>
        ) : null}
        <p className="mt-3 flex justify-between border-t border-zinc-200 pt-3 text-base font-semibold">
          <span>Total paid</span>
          <span data-testid="order-total">{formatCents(order.totalCents)}</span>
        </p>
        <dl className="mt-5 grid gap-3 text-sm sm:grid-cols-2">
          <div>
            <dt className="font-medium text-zinc-700">Name</dt>
            {/* C7 / C10: shown as text, exactly as submitted. */}
            <dd data-testid="order-name" className="mt-0.5 whitespace-pre-wrap break-words text-zinc-900">
              {order.name}
            </dd>
          </div>
          <div>
            <dt className="font-medium text-zinc-700">Delivery address</dt>
            <dd data-testid="order-address" className="mt-0.5 whitespace-pre-wrap break-words text-zinc-900">
              {order.address}
            </dd>
          </div>
        </dl>
      </section>

      <p className="mt-6 flex gap-4 text-sm">
        <Link href={ordersHref} className="font-medium text-indigo-700 underline">
          All orders
        </Link>
        <Link href={homeHref} className="font-medium text-indigo-700 underline">
          Continue shopping
        </Link>
      </p>
    </article>
  );
}
