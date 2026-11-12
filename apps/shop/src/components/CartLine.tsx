'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type ReactNode } from 'react';
import { postJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';

export type CartLineProps = {
  productId: string;
  name: string;
  qty: number;
  unitCents: number;
  lineCents: number;
  /** Already passed through shopUrl() by the page. */
  href: string;
  /** The product image, resolved on the server (render/ProductImage seam). */
  image: ReactNode;
};

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);

/** One row of the cart: quantity picker and remove button. Every control has an accessible name (C8). */
export function CartLine({ productId, name, qty, unitCents, lineCents, href, image }: CartLineProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const selectId = `qty-${productId}`;

  async function send(body: unknown): Promise<boolean> {
    const res = await postJson('/api/cart', body);
    if (!res.ok) {
      setError(res.message);
      return false;
    }
    setError(null);
    router.refresh();
    return true;
  }

  return (
    <li className="flex gap-4 py-5">
      <div className="h-24 w-24 shrink-0 overflow-hidden rounded-md bg-zinc-100">{image}</div>
      <div className="min-w-0 flex-1">
        <Link href={href} className="font-medium text-zinc-900 hover:underline">
          {name}
        </Link>
        <p className="mt-0.5 text-sm text-zinc-600">{formatCents(unitCents)} each</p>
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <label htmlFor={selectId} className="text-sm text-zinc-700">
            Quantity
          </label>
          <select
            // Remounts with the server's value after a refresh, so a rejected change snaps back.
            key={qty}
            id={selectId}
            defaultValue={qty}
            onChange={async (e) => {
              const el = e.currentTarget;
              const ok = await send({ op: 'set', productId, qty: Number(el.value) });
              if (!ok) el.value = String(qty);
            }}
            className="rounded-md border border-zinc-400 bg-white px-2 py-1 text-sm"
          >
            {QUANTITIES.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
          <button
            type="button"
            onClick={() => void send({ op: 'remove', productId })}
            className="text-sm text-indigo-700 underline hover:text-indigo-900"
          >
            {/* The space sits OUTSIDE the hidden span so the accessible name is right with or without CSS. */}
            Remove{' '}
            <span className="sr-only">{name} from cart</span>
          </button>
        </div>
        {error ? (
          <p role="alert" className="mt-2 text-sm text-red-700">
            {error}
          </p>
        ) : null}
      </div>
      <p className="text-sm font-semibold text-zinc-900">{formatCents(lineCents)}</p>
    </li>
  );
}
