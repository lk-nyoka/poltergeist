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

/**
 * Ordinary behaviour of the dialog. The FOCUS rules (trap, Escape, focus return, inert) are the contract
 * rule C9 and are tested, tagged, in src/contract/c9-dialog-focus.test.tsx.
 */
function setup(over: Partial<CheckoutApi> = {}) {
  document.body.innerHTML = '<div id="shop-root"><button id="opener" type="button">Checkout</button></div>';
  const api = makeCheckoutApi(over);
  render(
    <CheckoutContext.Provider value={api}>
      <CheckoutDialog>
        <PayButton />
      </CheckoutDialog>
    </CheckoutContext.Provider>,
  );
  return {
    api,
    name: screen.getByLabelText('Full name') as HTMLInputElement,
    address: screen.getByLabelText('Delivery address') as HTMLInputElement,
    pay: screen.getByRole('button', { name: /^Pay / }) as HTMLButtonElement,
  };
}

describe('CheckoutDialog', () => {
  it('is labelled by its title', () => {
    setup();
    expect(screen.getByRole('dialog', { name: 'Checkout' })).toBeTruthy();
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
