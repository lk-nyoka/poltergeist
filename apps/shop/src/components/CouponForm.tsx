'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { postJson } from '@/lib/api-client';

export function CouponForm() {
  const router = useRouter();
  const inputId = useId();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await postJson('/api/cart', { op: 'coupon', code });
    if (!res.ok) {
      setError(res.message);
      return;
    }
    setError(null);
    setCode('');
    router.refresh();
  }

  return (
    <form noValidate onSubmit={(e) => void onSubmit(e)}>
      <label htmlFor={inputId} className="block text-sm font-medium text-zinc-800">
        Coupon code
      </label>
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          type="text"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          autoCapitalize="characters"
          autoComplete="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-zinc-400 px-3 py-2 text-sm"
        />
        <button
          type="submit"
          className="rounded-md border border-zinc-400 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
        >
          Apply
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
