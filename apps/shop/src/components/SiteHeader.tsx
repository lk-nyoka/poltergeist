import Link from 'next/link';

/** All hrefs have already been through shopUrl() (the page/layout passes them in). */
export function SiteHeader({
  cartCount,
  homeHref,
  ordersHref,
  cartHref,
}: {
  cartCount: number;
  homeHref: string;
  ordersHref: string;
  cartHref: string;
}) {
  return (
    <header className="border-b border-zinc-200 bg-white">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
        <Link href={homeHref} className="flex items-center gap-2 text-lg font-semibold text-zinc-900">
          <svg aria-hidden="true" viewBox="0 0 24 24" className="h-6 w-6 text-indigo-700" fill="currentColor">
            <path d="M12 2a8 8 0 0 0-8 8v11l3-2 2.5 2 2.5-2 2.5 2 2.5-2 3 2V10a8 8 0 0 0-8-8zm-3 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm6 0a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z" />
          </svg>
          Haunted Shop
        </Link>
        <nav aria-label="Main">
          <ul role="list" className="flex items-center gap-6 text-sm font-medium text-zinc-800">
            <li>
              <Link href={homeHref} className="hover:underline">
                Shop
              </Link>
            </li>
            <li>
              <Link href={ordersHref} className="hover:underline">
                Orders
              </Link>
            </li>
            <li>
              <Link href={cartHref} className="inline-flex items-center gap-1.5 hover:underline">
                Cart{' '}
                <span
                  data-testid="cart-count"
                  className="inline-flex min-w-6 justify-center rounded-full bg-indigo-700 px-1.5 text-xs font-semibold text-white"
                >
                  {cartCount}
                </span>{' '}
                <span className="sr-only">{cartCount === 1 ? 'item' : 'items'}</span>
              </Link>
            </li>
          </ul>
        </nav>
      </div>
    </header>
  );
}
