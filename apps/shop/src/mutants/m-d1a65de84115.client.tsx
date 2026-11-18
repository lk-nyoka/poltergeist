'use client';

import { useEffect, useRef, useState, type FormEvent, type KeyboardEvent, type ReactNode } from 'react';
import { useCheckout } from '@/components/checkout-context';
import { formatCents } from '@/lib/format';

const FOCUSABLE = 'a[href], button, input, select, textarea, [tabindex]';

function focusables(root: HTMLElement | null): HTMLElement[] {
  if (!root) return [];
  return [...root.querySelectorAll<HTMLElement>(FOCUSABLE)].filter(
    (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0,
  );
}

type Flaw = 'no-trap' | 'no-escape' | 'no-restore';

function Dialog({ children, flaw }: { children: ReactNode; flaw: Flaw }) {
  const { intent, error, close, pay, openerRef } = useCheckout();
  const dialogRef = useRef<HTMLDivElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');

  useEffect(() => {
    const previouslyFocused = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const opener = openerRef.current ?? previouslyFocused;
    const background = document.getElementById('shop-root');
    background?.setAttribute('inert', '');
    nameRef.current?.focus();
    return () => {
      background?.removeAttribute('inert');
      if (flaw !== 'no-restore') opener?.focus();
    };
  }, [openerRef, flaw]);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      if (flaw === 'no-escape') return;
      e.stopPropagation();
      close();
      return;
    }
    if (e.key !== 'Tab' || flaw === 'no-trap') return;
    const items = focusables(dialogRef.current);
    const first = items[0];
    const last = items[items.length - 1];
    if (!first || !last) return;
    const active = document.activeElement;
    const inside = active instanceof Node && !!dialogRef.current?.contains(active);
    if (e.shiftKey && (!inside || active === first)) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && (!inside || active === last)) {
      e.preventDefault();
      first.focus();
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    void pay(name, address);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="checkout-title"
        onKeyDown={onKeyDown}
        className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl"
      >
        <div className="flex items-start justify-between gap-4">
          <h2 id="checkout-title" className="text-lg font-semibold text-zinc-900">
            Checkout
          </h2>
          <button
            type="button"
            aria-label="Close checkout"
            onClick={close}
            className="-m-1 rounded p-1 text-2xl leading-none text-zinc-500 hover:text-zinc-900"
          >
            <span aria-hidden="true">×</span>
          </button>
        </div>
        <p className="mt-1 text-sm text-zinc-600">
          Order total <strong className="text-zinc-900">{formatCents(intent.total)}</strong>. This is a demo: nothing is
          charged.
        </p>
        <form id="checkout-form" noValidate onSubmit={onSubmit} className="mt-4 space-y-4">
          <div>
            <label htmlFor="checkout-name" className="block text-sm font-medium text-zinc-800">
              Full name
            </label>
            <input
              ref={nameRef}
              id="checkout-name"
              type="text"
              autoComplete="name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-400 px-3 py-2 text-sm"
            />
          </div>
          <div>
            <label htmlFor="checkout-address" className="block text-sm font-medium text-zinc-800">
              Delivery address
            </label>
            <input
              id="checkout-address"
              type="text"
              autoComplete="street-address"
              value={address}
              onChange={(e) => setAddress(e.target.value)}
              className="mt-1 w-full rounded-md border border-zinc-400 px-3 py-2 text-sm"
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </form>
        <div className="mt-6 flex justify-end">{children}</div>
      </div>
    </div>
  );
}

export function DialogNoTrap({ children }: { children: ReactNode }) {
  return <Dialog flaw="no-trap">{children}</Dialog>;
}
export function DialogNoEscape({ children }: { children: ReactNode }) {
  return <Dialog flaw="no-escape">{children}</Dialog>;
}
export function DialogNoRestore({ children }: { children: ReactNode }) {
  return <Dialog flaw="no-restore">{children}</Dialog>;
}
