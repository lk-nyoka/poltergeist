/** Test-only helpers for jsdom component tests. Never import from application code. */
import axe from 'axe-core';
import { vi } from 'vitest';
import type { CheckoutApi } from '@/components/checkout-context';

export function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
}

/** Installs a fetch mock and returns it. `respond` gets the URL and init of each call. */
export function mockFetch(respond: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const fn = vi.fn(async (url: string | URL | Request, init?: RequestInit) => respond(String(url), init ?? {}));
  vi.stubGlobal('fetch', fn);
  return fn;
}

export function bodyOf(call: unknown[]): unknown {
  return JSON.parse(String((call[1] as RequestInit).body));
}

export function makeCheckoutApi(over: Partial<CheckoutApi> = {}): CheckoutApi {
  return {
    intent: { intentId: 'cart-1:1', total: 2400, lines: [{ productId: 'mug', qty: 2 }] },
    paying: false,
    error: null,
    openerRef: { current: null },
    close: vi.fn(),
    pay: vi.fn(async () => {}),
    ...over,
  };
}

/** The nine axe rules that define C8 / the A11yViolation oracle (brief §7.1). */
export const C8_RULES = [
  'button-name',
  'image-alt',
  'svg-img-alt',
  'input-image-alt',
  'label',
  'select-name',
  'link-name',
  'aria-command-name',
  'aria-input-field-name',
] as const;

/** Runs only the C8 rules; returns "rule-id" for every violation found. */
export async function c8Violations(root: Element): Promise<string[]> {
  const result = await axe.run(root, { runOnly: { type: 'rule', values: [...C8_RULES] } });
  return result.violations.map((v) => v.id);
}
