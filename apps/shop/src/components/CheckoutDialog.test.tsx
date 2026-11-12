// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { CheckoutContext, type CheckoutApi } from './checkout-context';
import { CheckoutDialog } from './CheckoutDialog';
import { PayButton } from './PayButton';
import { makeCheckoutApi } from '@/test/dom';

afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

function setup(over: Partial<CheckoutApi> = {}) {
  document.body.innerHTML = '<div id="shop-root"><button id="opener" type="button">Checkout</button></div>';
  const opener = document.getElementById('opener') as HTMLButtonElement;
  opener.focus();
  const api = makeCheckoutApi({ openerRef: { current: opener }, ...over });
  const utils = render(
    <CheckoutContext.Provider value={api}>
      <CheckoutDialog>
        <PayButton />
      </CheckoutDialog>
    </CheckoutContext.Provider>,
  );
  return {
    api,
    opener,
    dialog: screen.getByRole('dialog'),
    close: screen.getByRole('button', { name: 'Close checkout' }),
    name: screen.getByLabelText('Full name') as HTMLInputElement,
    address: screen.getByLabelText('Delivery address') as HTMLInputElement,
    pay: screen.getByRole('button', { name: /^Pay / }) as HTMLButtonElement,
    ...utils,
  };
}

/** fireEvent returns false when the handler called preventDefault(). */
const pressTab = (el: Element, shiftKey = false) => !fireEvent.keyDown(el, { key: 'Tab', shiftKey });

describe('CheckoutDialog', () => {
  it('is a custom div[role=dialog][aria-modal=true] labelled by its title, never <dialog>', () => {
    const { dialog } = setup();
    expect(dialog.tagName).toBe('DIV');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(screen.getByRole('dialog', { name: 'Checkout' })).toBe(dialog);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('moves focus inside on open and makes the page behind inert, then restores it', () => {
    const { name, unmount } = setup();
    expect(document.activeElement).toBe(name);
    expect(document.getElementById('shop-root')!.hasAttribute('inert')).toBe(true);
    unmount();
    expect(document.getElementById('shop-root')!.hasAttribute('inert')).toBe(false);
  });

  it('traps Tab: from the last control it wraps to the first', () => {
    const { pay, close } = setup();
    pay.focus();
    expect(pressTab(pay)).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it('traps Shift+Tab: from the first control it wraps to the last', () => {
    const { pay, close } = setup();
    close.focus();
    expect(pressTab(close, true)).toBe(true);
    expect(document.activeElement).toBe(pay);
  });

  it('leaves Tab alone in the middle, so the browser moves focus normally', () => {
    const { name, address } = setup();
    name.focus();
    expect(pressTab(name)).toBe(false);
    address.focus();
    expect(pressTab(address)).toBe(false);
  });

  it('wraps around the last ENABLED control when Pay is disabled', () => {
    const { address, close } = setup({ paying: true });
    address.focus();
    expect(pressTab(address)).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it('pulls focus back in when a Tab reaches the dialog while focus has escaped to the background', () => {
    const { opener, close } = setup();
    opener.focus(); // focus escaped
    expect(pressTab(close)).toBe(true);
    expect(document.activeElement).toBe(close);
  });

  it('has a close control that is reachable by keyboard and closes the dialog', () => {
    const { api, close } = setup();
    expect(close.tabIndex).toBe(0);
    expect(close.hasAttribute('disabled')).toBe(false);
    fireEvent.click(close);
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it("closes on Escape through the dialog's own keydown handler", () => {
    const { api, name, pay } = setup();
    fireEvent.keyDown(name, { key: 'Escape' });
    fireEvent.keyDown(pay, { key: 'Escape' });
    expect(api.close).toHaveBeenCalledTimes(2);
  });

  it('does not close on other keys', () => {
    const { api, name } = setup();
    fireEvent.keyDown(name, { key: 'Enter' });
    fireEvent.keyDown(name, { key: 'a' });
    expect(api.close).not.toHaveBeenCalled();
  });

  it('returns focus to the element that opened it', () => {
    const { opener, unmount } = setup();
    expect(document.activeElement).not.toBe(opener);
    unmount();
    expect(document.activeElement).toBe(opener);
  });

  it('falls back to whatever was focused before when there is no opener ref', () => {
    document.body.innerHTML = '<div id="shop-root"><button id="before" type="button">Before</button></div>';
    const before = document.getElementById('before') as HTMLButtonElement;
    before.focus();
    const { unmount } = render(
      <CheckoutContext.Provider value={makeCheckoutApi({ openerRef: { current: null } })}>
        <CheckoutDialog>
          <PayButton />
        </CheckoutDialog>
      </CheckoutContext.Provider>,
    );
    unmount();
    expect(document.activeElement).toBe(before);
  });

  it('submits the name and address exactly as typed: no trimming, no normalising', () => {
    const { api, name, address, pay } = setup();
    fireEvent.change(name, { target: { value: '  Zoë  ' } });
    fireEvent.change(address, { target: { value: '\u0065\u0301 Street ' } });
    fireEvent.click(pay);
    expect(api.pay).toHaveBeenCalledTimes(1);
    expect(api.pay).toHaveBeenCalledWith('  Zoë  ', '\u0065\u0301 Street ');
  });

  it('submits on Enter inside a field', () => {
    const { api, name } = setup();
    fireEvent.submit(name.closest('form')!);
    expect(api.pay).toHaveBeenCalledTimes(1);
  });

  it('shows the total on the Pay button and disables it while paying (courtesy only)', () => {
    expect(setup().pay.textContent).toBe('Pay $24.00');
    cleanup();
    expect(setup({ paying: true }).pay.disabled).toBe(true);
  });

  it('shows a server error as an alert', () => {
    setup({ error: 'Text must be 1–100 characters with no control characters.' });
    expect(screen.getByRole('alert').textContent).toContain('1–100 characters');
  });
});
