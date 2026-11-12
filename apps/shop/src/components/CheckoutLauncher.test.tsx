// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { bodyOf, jsonResponse, mockFetch } from '@/test/dom';
import { CheckoutDialog } from './CheckoutDialog';
import { CheckoutLauncher } from './CheckoutLauncher';
import { PayButton } from './PayButton';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

const INTENT = { intentId: 'cart-1:3', total: 2400, lines: [{ productId: 'mug', qty: 2 }] };

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  window.history.pushState({}, '', '/');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  document.body.innerHTML = '';
});

function mount(props: { autoOpen?: boolean } = {}) {
  return render(
    <div id="shop-root">
      <CheckoutLauncher label="Checkout" {...props}>
        <CheckoutDialog>
          <PayButton />
        </CheckoutDialog>
      </CheckoutLauncher>
    </div>,
  );
}

const openButton = () => screen.getByRole('button', { name: 'Checkout' });

describe('CheckoutLauncher', () => {
  it('opens the intent on the server, then shows the dialog with the server-computed total', async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, INTENT));
    mount();
    fireEvent.click(openButton());
    expect(await screen.findByRole('dialog', { name: 'Checkout' })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0]![0]).toBe('/api/checkout/open');
    expect((fetchMock.mock.calls[0]![1] as RequestInit).method).toBe('POST');
    expect(screen.getByRole('button', { name: 'Pay $24.00' })).toBeTruthy();
  });

  it('keeps the /s/<token> prefix on every request (shopUrl)', async () => {
    window.history.pushState({}, '', '/s/tok123/cart');
    const fetchMock = mockFetch(() => jsonResponse(200, INTENT));
    mount();
    fireEvent.click(openButton());
    await screen.findByRole('dialog');
    expect(fetchMock.mock.calls[0]![0]).toBe('/s/tok123/api/checkout/open');
  });

  it('pays with the server-minted intent id as the Idempotency-Key, then goes to the order page', async () => {
    window.history.pushState({}, '', '/s/tok123/cart');
    const fetchMock = mockFetch((url) =>
      url.endsWith('/api/checkout/open') ? jsonResponse(200, INTENT) : jsonResponse(200, { order: { id: 'ord-9' } }),
    );
    mount();
    fireEvent.click(openButton());
    await screen.findByRole('dialog');
    fireEvent.change(screen.getByLabelText('Full name'), { target: { value: 'Ada Lovelace' } });
    fireEvent.change(screen.getByLabelText('Delivery address'), { target: { value: '1 Analytical Way' } });
    fireEvent.click(screen.getByRole('button', { name: 'Pay $24.00' }));

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/s/tok123/orders/ord-9'));
    const payCall = fetchMock.mock.calls[1]!;
    expect(payCall[0]).toBe('/s/tok123/api/checkout');
    expect(new Headers((payCall[1] as RequestInit).headers).get('idempotency-key')).toBe('cart-1:3');
    expect(bodyOf(payCall)).toEqual({ name: 'Ada Lovelace', address: '1 Analytical Way' });
    expect(router.refresh).toHaveBeenCalled(); // keeps the header cart count honest
  });

  it('shows a server error in the dialog, re-enables Pay and does not navigate', async () => {
    mockFetch((url) =>
      url.endsWith('/api/checkout/open')
        ? jsonResponse(200, INTENT)
        : jsonResponse(400, { error: { code: 'bad_text', message: 'Text must be 1–100 characters.' } }),
    );
    mount();
    fireEvent.click(openButton());
    await screen.findByRole('dialog');
    const pay = screen.getByRole('button', { name: 'Pay $24.00' }) as HTMLButtonElement;
    fireEvent.click(pay);
    expect((await screen.findByRole('alert')).textContent).toContain('1–100 characters');
    await waitFor(() => expect(pay.disabled).toBe(false));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('shows a notice and no dialog when checkout cannot open (empty cart)', async () => {
    mockFetch(() => jsonResponse(400, { error: { code: 'empty_cart', message: 'Your cart is empty.' } }));
    mount();
    fireEvent.click(openButton());
    expect((await screen.findByRole('alert')).textContent).toBe('Your cart is empty.');
    expect(screen.queryByRole('dialog')).toBeNull();
  });

  it('survives a network failure', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Promise.reject(new TypeError('offline'))));
    mount();
    fireEvent.click(openButton());
    expect((await screen.findByRole('alert')).textContent).toMatch(/network/i);
  });

  it('Escape closes the dialog, un-inerts the page and returns focus to the Checkout button', async () => {
    mockFetch(() => jsonResponse(200, INTENT));
    mount();
    const opener = openButton();
    opener.focus();
    fireEvent.click(opener);
    await screen.findByRole('dialog');
    // The dialog's effect (inert + focus) runs just after the element appears, so wait for it.
    await waitFor(() => expect(document.getElementById('shop-root')!.hasAttribute('inert')).toBe(true));
    await waitFor(() => expect(document.activeElement).toBe(screen.getByLabelText('Full name')));

    fireEvent.keyDown(screen.getByLabelText('Full name'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.getElementById('shop-root')!.hasAttribute('inert')).toBe(false);
    expect(document.activeElement).toBe(opener);
  });

  it('reopening after a close mints no new intent id on the client (the server returns the same one)', async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, INTENT));
    mount();
    fireEvent.click(openButton());
    await screen.findByRole('dialog');
    fireEvent.keyDown(screen.getByLabelText('Full name'), { key: 'Escape' });
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    fireEvent.click(openButton());
    await screen.findByRole('dialog');
    expect(fetchMock.mock.calls.map((c) => c[0])).toEqual(['/api/checkout/open', '/api/checkout/open']);
    expect(fetchMock.mock.calls.every((c) => (c[1] as RequestInit).body === undefined)).toBe(true);
  });

  it('autoOpen opens the dialog on mount', async () => {
    mockFetch(() => jsonResponse(200, INTENT));
    mount({ autoOpen: true });
    expect(await screen.findByRole('dialog', { name: 'Checkout' })).toBeTruthy();
  });
});
