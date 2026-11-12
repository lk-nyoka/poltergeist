// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render } from '@testing-library/react';
import { PRODUCTS } from '@/domain/catalogue';
import { c8Violations, makeCheckoutApi } from '@/test/dom';
import { AddToCartButton } from './AddToCartButton';
import { CartLine } from './CartLine';
import { CheckoutContext } from './checkout-context';
import { CheckoutDialog } from './CheckoutDialog';
import { CouponForm } from './CouponForm';
import { PayButton } from './PayButton';
import { ProductCard } from './ProductCard';
import { ProductImage } from './ProductImage';
import { ReviewBody } from './ReviewBody';
import { ReviewForm } from './ReviewForm';
import { SiteHeader } from './SiteHeader';

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));

afterEach(cleanup);

const mug = PRODUCTS.find((p) => p.id === 'mug')!;

/** C8: zero violations of the nine A11yViolation rules on the CLEAN components, so mutants are meaningful. */
describe('accessibility of the clean shop (C8)', () => {
  it('SiteHeader, with a cart link whose name reads "Cart 2 items"', async () => {
    const { container, getByRole } = render(<SiteHeader cartCount={2} homeHref="/" ordersHref="/orders" cartHref="/cart" />);
    expect(await c8Violations(container)).toEqual([]);
    expect(getByRole('link', { name: 'Cart 2 items' })).toBeTruthy();
  });

  it('ProductCard, for every catalogue product', async () => {
    const { container } = render(
      <ul>
        {PRODUCTS.map((p) => (
          <ProductCard key={p.id} product={p} href={`/products/${p.id}`} imageSrc={`/products/${p.id}.svg`} ImageComponent={ProductImage} />
        ))}
      </ul>,
    );
    expect(container.querySelectorAll('img')).toHaveLength(8);
    for (const img of container.querySelectorAll('img')) expect(img.getAttribute('alt')?.length).toBeGreaterThan(5);
    expect(await c8Violations(container)).toEqual([]);
  });

  it('product page controls: quantity picker, add to cart, review form and review text', async () => {
    const { container } = render(
      <div>
        <ProductImage product={mug} src="/products/mug.svg" />
        <AddToCartButton productId="mug" name="Cursed Mug" withQuantity />
        <ReviewBody body="Lovely, if haunted." />
        <ReviewForm productId="mug" />
      </div>,
    );
    expect(await c8Violations(container)).toEqual([]);
  });

  it('CartLine and the coupon form', async () => {
    const { container } = render(
      <div>
        <ul>
          <CartLine
            productId="mug"
            name="Cursed Mug"
            qty={2}
            unitCents={1200}
            lineCents={2400}
            href="/products/mug"
            image={<ProductImage product={mug} src="/products/mug.svg" />}
          />
        </ul>
        <CouponForm />
      </div>,
    );
    expect(await c8Violations(container)).toEqual([]);
  });

  it('CheckoutDialog with its Pay button, in every state', async () => {
    for (const over of [{}, { paying: true }, { error: 'Text must be 1–100 characters.' }]) {
      const { container, unmount } = render(
        <CheckoutContext.Provider value={makeCheckoutApi(over)}>
          <CheckoutDialog>
            <PayButton />
          </CheckoutDialog>
        </CheckoutContext.Provider>,
      );
      expect(await c8Violations(container), JSON.stringify(over)).toEqual([]);
      unmount();
    }
  });
});

/** Proves the harness above can fail, so "zero violations" above means something. */
describe('the axe harness is not vacuous', () => {
  const cases: [string, string, string][] = [
    ['image-alt', '<img src="/x.svg">', 'a product image with no alt'],
    ['button-name', '<button type="button"></button>', 'an icon-only button with no name'],
    ['label', '<input type="text">', 'an input with no label'],
    ['select-name', '<select><option>1</option></select>', 'a select with no label'],
    ['link-name', '<a href="/x"></a>', 'a link with no text'],
    ['svg-img-alt', '<svg role="img"><circle r="1"/></svg>', 'an svg role=img with no name'],
  ];
  for (const [rule, html, what] of cases) {
    it(`catches ${what} as ${rule}`, async () => {
      const host = document.createElement('div');
      host.innerHTML = html;
      document.body.appendChild(host);
      try {
        expect(await c8Violations(host)).toContain(rule);
      } finally {
        host.remove();
      }
    });
  }
});
