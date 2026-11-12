'use client';

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { useRouter } from 'next/navigation';
import { postJson, type ApiResult } from '@/lib/api-client';
import { shopUrlClient } from '@/lib/shop-url';
import { CheckoutContext, type CheckoutApi, type CheckoutIntent } from './checkout-context';

/**
 * Owns the checkout flow: opens the intent on the server, shows the dialog, pays.
 * `children` is the server-resolved dialog (with its Pay button inside), rendered in a portal on <body>
 * only while open, so the page behind it can be made inert.
 */
export function CheckoutLauncher({
  children,
  label = 'Checkout',
  autoOpen = false,
}: {
  children: ReactNode;
  label?: string;
  autoOpen?: boolean;
}) {
  const router = useRouter();
  const openerRef = useRef<HTMLButtonElement>(null);
  const [intent, setIntent] = useState<CheckoutIntent | null>(null);
  const [open, setOpen] = useState(false);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const applyOpen = useCallback((res: ApiResult<CheckoutIntent>) => {
    if (!res.ok) {
      setNotice(res.message);
      return;
    }
    setNotice(null);
    setError(null);
    setPaying(false);
    setIntent(res.data);
    setOpen(true);
  }, []);

  const begin = useCallback(async () => applyOpen(await postJson<CheckoutIntent>('/api/checkout/open')), [applyOpen]);

  // /checkout opens the dialog on arrival. State is set in the .then callback (never synchronously in the
  // effect), and the cancel guard means a StrictMode remount cannot open it twice.
  useEffect(() => {
    if (!autoOpen) return;
    let cancelled = false;
    void postJson<CheckoutIntent>('/api/checkout/open').then((res) => {
      if (!cancelled) applyOpen(res);
    });
    return () => {
      cancelled = true;
    };
  }, [autoOpen, applyOpen]);

  const close = useCallback(() => setOpen(false), []);

  const pay = useCallback(
    async (name: string, address: string) => {
      if (!intent) return;
      setPaying(true);
      setError(null);
      const res = await postJson<{ order: { id: string } }>(
        '/api/checkout',
        { name, address },
        { 'Idempotency-Key': intent.intentId },
      );
      if (!res.ok) {
        setError(res.message);
        setPaying(false);
        return;
      }
      // Keep `paying` true while we navigate. Refresh afterwards so the cart count in the header updates.
      router.push(shopUrlClient(`/orders/${encodeURIComponent(res.data.order.id)}`));
      router.refresh();
    },
    [intent, router],
  );

  const api = useMemo<CheckoutApi | null>(
    () => (intent ? { intent, paying, error, openerRef, close, pay } : null),
    [intent, paying, error, close, pay],
  );

  return (
    <>
      <button
        ref={openerRef}
        type="button"
        onClick={() => void begin()}
        className="w-full rounded-md bg-indigo-700 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-800"
      >
        {label}
      </button>
      {notice ? (
        <p role="alert" className="mt-2 text-sm text-red-700">
          {notice}
        </p>
      ) : null}
      {open && api ? (
        <CheckoutContext.Provider value={api}>{createPortal(children, document.body)}</CheckoutContext.Provider>
      ) : null}
    </>
  );
}
