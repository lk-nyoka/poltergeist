import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutLauncher } from "@/components/CheckoutLauncher";
import { CheckoutDialogSeam, PayButtonSeam } from "@/components/render-seams";
import * as cart from "@/domain/cart";
import * as orders from "@/domain/orders";
import { formatCents } from "@/lib/format";
import { shopUrlServer } from "@/lib/shop-url.server";
import { withPage } from "@/seams/context";

export const metadata: Metadata = { title: "Checkout" };

export default async function CheckoutPage() {
  const [homeHref, cartHref] = await Promise.all([shopUrlServer("/"), shopUrlServer("/cart")]);

  return withPage(async (ctx) => {
    const view = await cart.view(ctx.sid);

    // C2: after paying, the cart is empty. A refresh or "back" must show the existing order, never offer Pay again.
    if (view.lines.length === 0) {
      const mine = await orders.listForSession(ctx.sid);
      const latest = [...mine].sort((a, b) => b.createdAt - a.createdAt)[0];
      if (latest) {
        const orderHref = await shopUrlServer(`/orders/${encodeURIComponent(latest.id)}`);
        return (
          <>
            <h1 className="text-2xl font-semibold text-zinc-900">Checkout</h1>
            <div className="mt-6 max-w-xl rounded-lg border border-emerald-200 bg-emerald-50 p-5">
              <p className="font-medium text-emerald-900">Your order has been placed.</p>
              <p className="mt-1 text-sm text-emerald-900">Nothing is waiting to be paid for.</p>
              <Link href={orderHref} className="mt-3 inline-block font-medium text-indigo-800 underline">
                View your order
              </Link>
            </div>
          </>
        );
      }
      return (
        <>
          <h1 className="text-2xl font-semibold text-zinc-900">Checkout</h1>
          <p className="mt-4 text-zinc-700">Your cart is empty.</p>
          <Link href={homeHref} className="mt-2 inline-block font-medium text-indigo-700 underline">
            Continue shopping
          </Link>
        </>
      );
    }

    const Dialog = CheckoutDialogSeam.resolve();
    const Pay = PayButtonSeam.resolve();
    return (
      <>
        <h1 className="text-2xl font-semibold text-zinc-900">Checkout</h1>
        <section aria-label="Order summary" className="mt-6 max-w-xl space-y-4 rounded-lg border border-zinc-200 bg-white p-5">
          <ul role="list" className="divide-y divide-zinc-200 text-sm">
            {view.lines.map((l) => (
              <li key={l.productId} className="flex justify-between py-2">
                <span>
                  {l.name} × {l.qty}
                </span>
                <span>{formatCents(l.lineCents)}</span>
              </li>
            ))}
          </ul>
          <p className="flex justify-between text-base font-semibold">
            <span>Total</span>
            <span>{formatCents(view.totalCents)}</span>
          </p>
          <CheckoutLauncher autoOpen label="Review and pay">
            <Dialog>
              <Pay />
            </Dialog>
          </CheckoutLauncher>
          <Link href={cartHref} className="inline-block text-sm text-indigo-700 underline">
            Back to cart
          </Link>
        </section>
      </>
    );
  });
}
