'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CartLineProps } from '@/components/CartLine';
import { postJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);

// The select's id was renamed but the label's htmlFor was not, so the picker has no name.
export function CartLine080ec({ productId, name, qty, unitCents, lineCents, href, image }: CartLineProps) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);

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
          <label htmlFor={`qty-${productId}`} className="text-sm text-zinc-700">
            Quantity
          </label>
          <select
            key={qty}
            id={`quantity-${productId}`}
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
