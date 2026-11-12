'use client';

import { formatCents } from '@/lib/format';
import { useCheckout } from './checkout-context';

/**
 * Submits the checkout form (it lives outside the <form>, linked by the `form` attribute).
 * It disables itself after the first click as a courtesy only: correctness never relies on it (C1).
 */
export function PayButton() {
  const { intent, paying } = useCheckout();
  return (
    <button
      type="submit"
      form="checkout-form"
      disabled={paying}
      className="rounded-md bg-indigo-700 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800 disabled:cursor-not-allowed disabled:opacity-60"
    >
      Pay {formatCents(intent.total)}
    </button>
  );
}
