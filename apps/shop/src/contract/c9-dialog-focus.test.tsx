// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, fireEvent, render } from '@testing-library/react';
import { CheckoutContext, type CheckoutApi } from '@/components/checkout-context';
import { CheckoutDialogSeam, PayButtonSeam } from '@/components/render-seams';
import { makeCheckoutApi } from '@/test/dom';
import { contractSession, resetContractWorld } from './helpers';

beforeEach(resetContractWorld);
afterEach(() => {
  cleanup();
  document.body.innerHTML = '';
});

/**
 * C9: the dialog keeps focus inside, has a reachable close control, closes on Escape through its own
 * key handler, and returns focus to the opener. The dialog is the render/CheckoutDialog seam for THIS session.
 *
 * Controls are found by STRUCTURE (role, element type, order), never by accessible name or label, so a
 * C8 mutant that strips a name cannot make a C9 test fail.
 */
async function openDialog(over: Partial<CheckoutApi> = {}) {
  document.body.innerHTML = '<div id="shop-root"><button id="opener" type="button">Checkout</button></div>';
  const opener = document.getElementById('opener') as HTMLButtonElement;
  opener.focus();
  const s = await contractSession();
  const Dialog = s.resolve(CheckoutDialogSeam);
  const Pay = s.resolve(PayButtonSeam);
  const api = makeCheckoutApi({ openerRef: { current: opener }, ...over });
  const utils = render(
    <CheckoutContext.Provider value={api}>
      <Dialog>
        <Pay />
      </Dialog>
    </CheckoutContext.Provider>,
  );
  const dialog = document.querySelector<HTMLElement>('[role="dialog"]')!;
  /** Everything Tab can reach inside the dialog, in DOM order. */
  const controls = () =>
    [...dialog.querySelectorAll<HTMLElement>('a[href], button, input, select, textarea, [tabindex]')].filter(
      (el) => !el.hasAttribute('disabled') && el.tabIndex >= 0,
    );
  const closeControl = () => controls().find((el) => el.tagName === 'BUTTON' && el.getAttribute('type') === 'button');
  return { api, opener, dialog, controls, closeControl, ...utils };
}

/** fireEvent returns false when the handler called preventDefault(). */
const pressTab = (el: Element, shiftKey = false) => !fireEvent.keyDown(el, { key: 'Tab', shiftKey });

describe('C9: dialog focus behaviour', () => {
  it('[C9] the dialog is a custom div with role=dialog and aria-modal=true, never a native <dialog>', async () => {
    const { dialog } = await openDialog();
    expect(dialog).toBeTruthy();
    expect(dialog.tagName).toBe('DIV');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('[C9] opening moves focus inside the dialog and makes the page behind it inert; closing lifts that', async () => {
    const { dialog, unmount } = await openDialog();
    expect(dialog.contains(document.activeElement)).toBe(true);
    expect(document.getElementById('shop-root')!.hasAttribute('inert')).toBe(true);
    unmount();
    expect(document.getElementById('shop-root')!.hasAttribute('inert')).toBe(false);
  });

  it('[C9] Tab from the last control wraps to the first, so focus never leaves', async () => {
    const { controls } = await openDialog();
    const all = controls();
    const last = all[all.length - 1]!;
    last.focus();
    expect(pressTab(last)).toBe(true); // the dialog handled it
    expect(document.activeElement).toBe(all[0]);
  });

  it('[C9] Shift+Tab from the first control wraps to the last', async () => {
    const { controls } = await openDialog();
    const all = controls();
    all[0]!.focus();
    expect(pressTab(all[0]!, true)).toBe(true);
    expect(document.activeElement).toBe(all[all.length - 1]);
  });

  it('[C9] a Tab that arrives while focus has escaped to the page behind pulls it back in', async () => {
    const { opener, controls } = await openDialog();
    opener.focus(); // focus escaped
    expect(pressTab(controls()[0]!)).toBe(true);
    expect(controls()).toContain(document.activeElement);
  });

  it('[C9] tabbing all the way round, forwards and backwards, never leaves the dialog', async () => {
    const { dialog, controls } = await openDialog();
    // Model the browser: if the dialog did not take over Tab, focus moves on in DOM order, and past the
    // last control it leaves the page (the active element becomes <body>).
    const browserTab = (backwards: boolean) => {
      const active = document.activeElement as HTMLElement;
      const handled = pressTab(active, backwards);
      if (handled) return;
      const all = controls();
      const target = all[all.indexOf(active) + (backwards ? -1 : 1)];
      if (target) target.focus();
      else active.blur(); // there is nothing further in the dialog: focus leaves the page, so it falls to <body>
    };
    for (const backwards of [false, true]) {
      for (let i = 0; i < controls().length * 2 + 2; i++) {
        browserTab(backwards);
        expect(dialog.contains(document.activeElement), `${backwards ? 'Shift+' : ''}Tab #${i + 1}`).toBe(true);
      }
    }
  });

  it('[C9] a close control is reachable by keyboard and closes the dialog', async () => {
    const { api, closeControl } = await openDialog();
    const close = closeControl();
    expect(close, 'a focusable button (not the submit button) must exist').toBeTruthy();
    expect(close!.tabIndex).toBeGreaterThanOrEqual(0);
    fireEvent.click(close!);
    expect(api.close).toHaveBeenCalledTimes(1);
  });

  it("[C9] Escape closes the dialog through the dialog's own key handler", async () => {
    const { api, controls } = await openDialog();
    const all = controls();
    fireEvent.keyDown(all[1] ?? all[0]!, { key: 'Escape' });
    fireEvent.keyDown(all[all.length - 1]!, { key: 'Escape' });
    expect(api.close).toHaveBeenCalledTimes(2);
  });

  it('[C9] other keys do not close the dialog', async () => {
    const { api, controls } = await openDialog();
    fireEvent.keyDown(controls()[0]!, { key: 'Enter' });
    fireEvent.keyDown(controls()[0]!, { key: 'a' });
    expect(api.close).not.toHaveBeenCalled();
  });

  it('[C9] closing returns focus to the element that opened the dialog', async () => {
    const { opener, dialog, unmount } = await openDialog();
    expect(document.activeElement).not.toBe(opener);
    expect(dialog.contains(document.activeElement)).toBe(true);
    unmount();
    expect(document.activeElement).toBe(opener);
  });
});
