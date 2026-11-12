import type { Metadata } from "next";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import * as cart from "@/domain/cart";
import { shopUrlServer } from "@/lib/shop-url.server";
import { withPage } from "@/seams/context";

export const metadata: Metadata = {
  title: { default: "Haunted Shop", template: "%s · Haunted Shop" },
  description: "A small online store of haunted household goods. Demo only: nothing is sold.",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const [homeHref, ordersHref, cartHref] = await Promise.all([
    shopUrlServer("/"),
    shopUrlServer("/orders"),
    shopUrlServer("/cart"),
  ]);
  const cartCount = await withPage(async (ctx) => {
    const view = await cart.view(ctx.sid);
    return view.lines.reduce((n, l) => n + l.qty, 0);
  });

  return (
    <html lang="en">
      <body className="min-h-screen bg-zinc-50 text-zinc-900 antialiased">
        {/* #shop-root is what the checkout dialog makes inert while it is open. */}
        <div id="shop-root" className="flex min-h-screen flex-col">
          <a
            href="#main"
            className="sr-only focus:not-sr-only focus:absolute focus:left-2 focus:top-2 focus:z-50 focus:rounded focus:bg-white focus:px-3 focus:py-2 focus:text-indigo-800"
          >
            Skip to main content
          </a>
          <SiteHeader cartCount={cartCount} homeHref={homeHref} ordersHref={ordersHref} cartHref={cartHref} />
          <main id="main" tabIndex={-1} className="mx-auto w-full max-w-6xl flex-1 px-4 py-8">
            {children}
          </main>
          <footer className="border-t border-zinc-200 bg-white">
            <p className="mx-auto max-w-6xl px-4 py-4 text-xs text-zinc-600">
              Demo store: nothing is sold and no payment is taken. All names, addresses and orders are synthetic and
              deleted after 24 hours.
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
