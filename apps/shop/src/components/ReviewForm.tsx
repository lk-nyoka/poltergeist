'use client';

import { useRouter } from 'next/navigation';
import { useId, useState, type FormEvent } from 'react';
import { postJson } from '@/lib/api-client';

export function ReviewForm({ productId }: { productId: string }) {
  const router = useRouter();
  const fieldId = useId();
  const hintId = `${fieldId}-hint`;
  const [body, setBody] = useState('');
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const res = await postJson('/api/reviews', { productId, body });
    if (!res.ok) {
      setSaved(false);
      setError(res.message);
      return;
    }
    setError(null);
    setSaved(true);
    setBody(''); // the review was stored exactly as typed
    router.refresh();
  }

  return (
    <form noValidate onSubmit={(e) => void onSubmit(e)} className="space-y-3">
      <div>
        <label htmlFor={fieldId} className="block text-sm font-medium text-zinc-800">
          Write a review
        </label>
        <textarea
          id={fieldId}
          rows={3}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          aria-describedby={hintId}
          className="mt-1 w-full rounded-md border border-zinc-400 px-3 py-2 text-sm"
        />
        <p id={hintId} className="mt-1 text-xs text-zinc-600">
          Up to 100 characters.
        </p>
      </div>
      <button
        type="submit"
        className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800"
      >
        Post review
      </button>
      <p role="status" className="min-h-5 text-sm text-emerald-800">
        {saved ? 'Thanks, your review was posted.' : null}
      </p>
      {error ? (
        <p role="alert" className="text-sm text-red-700">
          {error}
        </p>
      ) : null}
    </form>
  );
}
