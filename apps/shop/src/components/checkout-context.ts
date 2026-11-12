'use client';

import { createContext, useContext, type RefObject } from 'react';

export type CheckoutIntent = {
  /** Minted by the server: `cart_id:version`. Clients never invent this. */
  intentId: string;
  total: number;
  lines: { productId: string; qty: number }[];
};

/**
 * State shared between the launcher and the server-resolved dialog / Pay button slots.
 * The slots are rendered on the server (so render-seam mutants apply) and read this on the client.
 */
export type CheckoutApi = {
  intent: CheckoutIntent;
  paying: boolean;
  error: string | null;
  /** The element that opened the dialog; the dialog returns focus to it when it closes (C9). */
  openerRef: RefObject<HTMLElement | null>;
  close: () => void;
  pay: (name: string, address: string) => Promise<void>;
};

export const CheckoutContext = createContext<CheckoutApi | null>(null);

export function useCheckout(): CheckoutApi {
  const api = useContext(CheckoutContext);
  if (!api) throw new Error('useCheckout must be used inside <CheckoutLauncher>');
  return api;
}
