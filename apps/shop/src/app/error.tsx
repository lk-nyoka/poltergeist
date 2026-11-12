"use client";

import { shopUrlClient } from "@/lib/shop-url";

/** Error boundary. The data attribute lets the Crash oracle recognise it (brief §7.1). */
export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div role="alert" data-error-boundary="true">
      <h1 className="text-2xl font-semibold text-zinc-900">Something went wrong</h1>
      <p className="mt-2 text-zinc-700">We could not show this page. You can try again or head back to the shop.</p>
      <div className="mt-4 flex gap-3">
        <button
          type="button"
          onClick={() => reset()}
          className="rounded-md bg-indigo-700 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-800"
        >
          Try again
        </button>
        <button
          type="button"
          onClick={() => window.location.assign(shopUrlClient("/"))}
          className="rounded-md border border-zinc-400 bg-white px-4 py-2 text-sm font-medium text-zinc-900 hover:bg-zinc-100"
        >
          Back to the shop
        </button>
      </div>
    </div>
  );
}
