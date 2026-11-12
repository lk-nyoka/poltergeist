// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { AddToCartButton } from '@/components/AddToCartButton';
import { CheckoutContext } from '@/components/checkout-context';
import { CouponForm } from '@/components/CouponForm';
import { ProductCard } from '@/components/ProductCard';
import { ReviewBodySeam } from '@/components/ReviewBody';
import { ReviewForm } from '@/components/ReviewForm';
import { SiteHeader } from '@/components/SiteHeader';
import { CartLineSeam, CheckoutDialogSeam, PayButtonSeam, ProductImageSeam } from '@/components/render-seams';
import { PRODUCTS } from '@/domain/catalogue';
import { c8Violations, makeCheckoutApi } from '@/test/dom';
import { contractSession, resetContractWorld } from './helpers';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

beforeEach(resetContractWorld);
afterEach(cleanup);

const mug = PRODUCTS.find((p) => p.id === 'mug')!;

/**
 * C8: every interactive control has an accessible name and every product image has alt text.
 * The nine rules are the A11yViolation oracle's (brief §7.1). Components come from the render seams for
 * THIS session, so a render-seam mutant is what gets checked.
 */
describe('C8: accessible names and alt text', () => {
  it('[C8] every product image has meaningful alt text', async () => {
    const s = await contractSession();
    const ImageComponent = s.resolve(ProductImageSeam);
    const { container } = render(
      <ul>
        {PRODUCTS.map((p) => (
          <li key={p.id}>
            <ImageComponent product={p} src={`/products/${p.id}.svg`} />
          </li>
        ))}
      </ul>,
    );
    const images = [...container.querySelectorAll('img')];
    expect(images).toHaveLength(PRODUCTS.length);
    for (const [i, img] of images.entries()) {
      expect(img.getAttribute('alt'), PRODUCTS[i]!.id).toBe(PRODUCTS[i]!.altText);
    }
    expect(await c8Violations(container)).toEqual([]);
  });

  it('[C8] the storefront (header, product cards and their add-to-cart buttons) has no accessible-name violations', async () => {
    const s = await contractSession();
    const ImageComponent = s.resolve(ProductImageSeam);
    const { container, getByRole } = render(
      <div>
        <SiteHeader cartCount={2} homeHref="/" ordersHref="/orders" cartHref="/cart" />
        <ul>
          {PRODUCTS.map((p) => (
            <ProductCard key={p.id} product={p} href={`/products/${p.id}`} imageSrc={`/products/${p.id}.svg`} ImageComponent={ImageComponent} />
          ))}
        </ul>
      </div>,
    );
    expect(await c8Violations(container)).toEqual([]);
    expect(getByRole('link', { name: 'Cart 2 items' })).toBeTruthy();
  });

  it('[C8] the cart line (quantity picker and Remove button) has accessible names', async () => {
    const s = await contractSession();
    const Line = s.resolve(CartLineSeam);
    const ImageComponent = s.resolve(ProductImageSeam);
    const { container, getByLabelText, getByRole } = render(
      <ul>
        <Line
          productId="mug"
          name="Cursed Mug"
          qty={2}
          unitCents={1200}
          lineCents={2400}
          href="/products/mug"
          image={<ImageComponent product={mug} src="/products/mug.svg" />}
        />
      </ul>,
    );
    expect(await c8Violations(container)).toEqual([]);
    expect(getByLabelText('Quantity')).toBeTruthy();
    expect(getByRole('button', { name: 'Remove Cursed Mug from cart' })).toBeTruthy();
  });

  it('[C8] the checkout dialog, its fields and the Pay button have accessible names in every state', async () => {
    const s = await contractSession();
    const Dialog = s.resolve(CheckoutDialogSeam);
    const Pay = s.resolve(PayButtonSeam);
    for (const state of [{}, { paying: true }, { error: 'Text must be 1–100 characters.' }]) {
      const { container, unmount } = render(
        <CheckoutContext.Provider value={makeCheckoutApi(state)}>
          <Dialog>
            <Pay />
          </Dialog>
        </CheckoutContext.Provider>,
      );
      expect(await c8Violations(container), JSON.stringify(state)).toEqual([]);
      unmount();
    }
  });

  it('[C8] the Pay button and the dialog fields are named for what they do', async () => {
    const s = await contractSession();
    const Dialog = s.resolve(CheckoutDialogSeam);
    const Pay = s.resolve(PayButtonSeam);
    const { getByRole, getByLabelText } = render(
      <CheckoutContext.Provider value={makeCheckoutApi()}>
        <Dialog>
          <Pay />
        </Dialog>
      </CheckoutContext.Provider>,
    );
    expect(getByRole('button', { name: 'Pay $24.00' })).toBeTruthy();
    expect(getByRole('button', { name: 'Close checkout' })).toBeTruthy();
    expect(getByLabelText('Full name')).toBeTruthy();
    expect(getByLabelText('Delivery address')).toBeTruthy();
  });

  it('[C8] the product page controls (quantity picker, review form, review text) have accessible names', async () => {
    const s = await contractSession();
    const ImageComponent = s.resolve(ProductImageSeam);
    const ReviewBody = s.resolve(ReviewBodySeam);
    const { container } = render(
      <div>
        <ImageComponent product={mug} src="/products/mug.svg" />
        <AddToCartButton productId="mug" name="Cursed Mug" withQuantity />
        <ReviewBody body="Lovely, if haunted." />
        <ReviewForm productId="mug" />
      </div>,
    );
    expect(await c8Violations(container)).toEqual([]);
  });

  it('[C8] the coupon form has an accessible name for its field and its button', async () => {
    const { container, getByLabelText } = render(<CouponForm />);
    expect(await c8Violations(container)).toEqual([]);
    expect(getByLabelText('Coupon code')).toBeTruthy();
  });
});
