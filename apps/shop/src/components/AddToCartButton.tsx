'use client';

import { useRouter } from 'next/navigation';
import { useId, useState } from 'react';
import { postJson } from '@/lib/api-client';

const QUANTITIES = Array.from({ length: 10 }, (_, i) => i + 1);

export function AddToCartButton({
  productId,
  name,
  withQuantity = false,
}: {
  productId: string;
  name: string;
  withQuantity?: boolean;
}) {
  const router = useRouter();
  const selectId = useId();
  const [qty, setQty] = useState(1);
  const [added, setAdded] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function add() {
    const res = await postJson('/api/cart', { op: 'add', productId, qty });
    if (!res.ok) {
      setAdded(null);
      setError(res.message);
      return;
    }
    setError(null);
    setAdded(`Added ${name} to your cart.`);
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        {withQuantity ? (
          <>
            <label htmlFor={selectId} className="text-sm text-zinc-700">
              Quantity
            </label>
            <select
              id={selectId}
              value={qty}
              onChange={(e) => setQty(Number(e.target.value))}
              className="rounded-md border border-zinc-400 bg-white px-2 py-1.5 text-sm"
            >
              {QUANTITIES.map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </>
        ) : null}
        <button
          type="button"
          onClick={() => void add()}
          className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800"
        >
          Add to cart<span className="sr-only">: {name}</span>
        </button>
      </div>
      <p role="status" className="mt-2 min-h-5 text-sm text-emerald-800">
        {added}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </div>
  );
}
