'use client';

import { useCheckout } from '@/components/checkout-context';

// Icon-only Pay button: the lock icon replaced the text label, with no aria-label added.
export function PayButtonA2893() {
  const { paying } = useCheckout();
  return (
    <button
      type="submit"
      form="checkout-form"
      disabled={paying}
      className="rounded-md bg-indigo-700 px-5 py-2.5 text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      <svg aria-hidden="true" viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
        <path d="M12 2a5 5 0 0 0-5 5v3H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8a2 2 0 0 0-2-2h-1V7a5 5 0 0 0-5-5zm-3 8V7a3 3 0 1 1 6 0v3H9z" />
      </svg>
    </button>
  );
}
