'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import type { CartLineProps } from '@/components/CartLine';
import { postJson } from '@/lib/api-client';
import { formatCents } from '@/lib/format';

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);

// The Remove link became a trash-can icon; nobody gave the icon button a name.
export function CartLineB40d8({ productId, name, qty, unitCents, lineCents, href, image }: CartLineProps) {
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
            className="rounded p-1 text-zinc-500 hover:text-red-700"
          >
            <svg aria-hidden="true" viewBox="0 0 24 24" className="h-4 w-4" fill="currentColor">
              <path d="M9 3h6l1 2h4v2H4V5h4l1-2zm-3 6h12l-1 12H7L6 9z" />
            </svg>
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
