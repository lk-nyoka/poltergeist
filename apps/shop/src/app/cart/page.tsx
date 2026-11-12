import type { Metadata } from "next";
import Link from "next/link";
import { CheckoutLauncher } from "@/components/CheckoutLauncher";
import { CouponForm } from "@/components/CouponForm";
import { CartLineSeam, CheckoutDialogSeam, PayButtonSeam, ProductImageSeam } from "@/components/render-seams";
import * as cart from "@/domain/cart";
import { findProduct } from "@/domain/catalogue";
import { formatCents } from "@/lib/format";
import { shopUrlServer } from "@/lib/shop-url.server";
import { withPage } from "@/seams/context";

export const metadata: Metadata = { title: "Your cart" };

export default async function CartPage() {
  const homeHref = await shopUrlServer("/");

  return withPage(async (ctx) => {
    const view = await cart.view(ctx.sid);
    const Line = CartLineSeam.resolve();
    const ImageComponent = ProductImageSeam.resolve();
    const Dialog = CheckoutDialogSeam.resolve();
    const Pay = PayButtonSeam.resolve();

    if (view.lines.length === 0) {
      return (
        <>
          <h1 className="text-2xl font-semibold text-zinc-900">Your cart</h1>
          <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed border-zinc-300 bg-white px-6 py-14 text-center">
            <svg role="img" aria-label="A friendly ghost shrugging" viewBox="0 0 24 24" className="h-14 w-14 text-zinc-400" fill="currentColor">
              <path d="M12 2a8 8 0 0 0-8 8v11l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V10a8 8 0 0 0-8-8zm-3 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
            </svg>
            <p className="text-zinc-700">Your cart is empty.</p>
            <Link href={homeHref} className="font-medium text-indigo-700 underline hover:text-indigo-900">
              Continue shopping
            </Link>
          </div>
        </>
      );
    }

    const lines = await Promise.all(
      view.lines.map(async (l) => {
        const product = findProduct(l.productId)!;
        const [href, src] = await Promise.all([
          shopUrlServer(`/products/${l.productId}`),
          shopUrlServer(`/products/${l.productId}.svg`),
        ]);
        return { l, product, href, src };
      }),
    );

    return (
      <>
        <h1 className="text-2xl font-semibold text-zinc-900">Your cart</h1>
        <div className="mt-6 grid gap-8 lg:grid-cols-3">
          <section aria-label="Items in your cart" className="lg:col-span-2">
            <ul role="list" className="divide-y divide-zinc-200 rounded-lg border border-zinc-200 bg-white px-4">
              {lines.map(({ l, product, href, src }) => (
                <Line
                  key={l.productId}
                  productId={l.productId}
                  name={l.name}
                  qty={l.qty}
                  unitCents={l.unitCents}
                  lineCents={l.lineCents}
                  href={href}
                  image={<ImageComponent product={product} src={src} />}
                />
              ))}
            </ul>
          </section>
          <aside aria-label="Order summary" className="h-fit space-y-6 rounded-lg border border-zinc-200 bg-white p-5">
            <dl className="space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-zinc-700">Subtotal</dt>
                <dd>{formatCents(view.subtotalCents)}</dd>
              </div>
              {view.discountCents > 0 ? (
                <div className="flex justify-between">
                  <dt className="text-zinc-700">Coupon {view.couponCode}</dt>
                  <dd>−{formatCents(view.discountCents)}</dd>
                </div>
              ) : null}
              <div className="flex justify-between border-t border-zinc-200 pt-2 text-base font-semibold">
                <dt>Total</dt>
                <dd data-testid="cart-total">{formatCents(view.totalCents)}</dd>
              </div>
            </dl>
            {view.couponCode === null ? (
              <CouponForm />
            ) : (
              <p className="text-sm text-zinc-700">Coupon {view.couponCode} applied.</p>
            )}
            <CheckoutLauncher>
              <Dialog>
                <Pay />
              </Dialog>
            </CheckoutLauncher>
          </aside>
        </div>
      </>
    );
  });
}
