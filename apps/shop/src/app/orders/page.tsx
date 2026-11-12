import type { Metadata } from "next";
import Link from "next/link";
import * as orders from "@/domain/orders";
import { formatCents } from "@/lib/format";
import { shopUrlServer } from "@/lib/shop-url.server";
import { withPage } from "@/seams/context";

export const metadata: Metadata = { title: "Your orders" };

export default async function OrdersPage() {
  const homeHref = await shopUrlServer("/");

  return withPage(async (ctx) => {
    const mine = [...(await orders.listForSession(ctx.sid))].sort((a, b) => b.createdAt - a.createdAt);
    const rows = await Promise.all(
      mine.map(async (o) => ({ o, href: await shopUrlServer(`/orders/${encodeURIComponent(o.id)}`) })),
    );
    return (
      <>
        <h1 className="text-2xl font-semibold text-zinc-900">Your orders</h1>
        {rows.length === 0 ? (
          <p className="mt-4 text-zinc-700">
            You have not placed an order yet.{" "}
            <Link href={homeHref} className="font-medium text-indigo-700 underline">
              Start shopping
            </Link>
          </p>
        ) : (
          <ul role="list" className="mt-6 max-w-2xl divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white">
            {rows.map(({ o, href }) => (
              <li key={o.id} className="flex items-center justify-between px-4 py-3 text-sm">
                <Link href={href} className="font-medium text-indigo-700 underline">
                  Order {o.id.slice(0, 8)}
                </Link>
                <span className="font-semibold">{formatCents(o.totalCents)}</span>
              </li>
            ))}
          </ul>
        )}
      </>
    );
  });
}
