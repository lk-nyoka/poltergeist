// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { bodyOf, jsonResponse, mockFetch } from '@/test/dom';
import { AddToCartButton } from './AddToCartButton';
import { CartLine } from './CartLine';
import { CouponForm } from './CouponForm';
import { ReviewForm } from './ReviewForm';

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn() }));
vi.mock('next/navigation', () => ({ useRouter: () => router }));

beforeEach(() => {
  router.push.mockReset();
  router.refresh.mockReset();
  window.history.pushState({}, '', '/');
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const ok = () => jsonResponse(200, { cart: {} });
const fail = (code: string, message: string) => jsonResponse(400, { error: { code, message } });

describe('AddToCartButton', () => {
  it('adds one, announces it politely and refreshes the page data', async () => {
    const fetchMock = mockFetch(ok);
    render(<AddToCartButton productId="mug" name="Cursed Mug" />);
    fireEvent.click(screen.getByRole('button', { name: 'Add to cart: Cursed Mug' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toBe('Added Cursed Mug to your cart.'));
    expect(bodyOf(fetchMock.mock.calls[0]!)).toEqual({ op: 'add', productId: 'mug', qty: 1 });
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });

  it('sends the chosen quantity', async () => {
    const fetchMock = mockFetch(ok);
    render(<AddToCartButton productId="mug" name="Cursed Mug" withQuantity />);
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '3' } });
    fireEvent.click(screen.getByRole('button', { name: /^Add to cart/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(bodyOf(fetchMock.mock.calls[0]!)).toMatchObject({ qty: 3 });
  });

  it('shows the server error as an alert and does not refresh', async () => {
    mockFetch(() => fail('bad_quantity', 'Quantity must be a whole number from 1 to 10.'));
    render(<AddToCartButton productId="mug" name="Cursed Mug" />);
    fireEvent.click(screen.getByRole('button', { name: /^Add to cart/ }));
    expect((await screen.findByRole('alert')).textContent).toContain('1 to 10');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('keeps the /s/<token> prefix', async () => {
    window.history.pushState({}, '', '/s/tok/');
    const fetchMock = mockFetch(ok);
    render(<AddToCartButton productId="mug" name="Cursed Mug" />);
    fireEvent.click(screen.getByRole('button', { name: /^Add to cart/ }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(fetchMock.mock.calls[0]![0]).toBe('/s/tok/api/cart');
  });
});

describe('CartLine', () => {
  const line = (
    <CartLine
      productId="mug"
      name="Cursed Mug"
      qty={2}
      unitCents={1200}
      lineCents={2400}
      href="/products/mug"
      image={<span>img</span>}
    />
  );
  const inList = () => render(<ul>{line}</ul>);

  it('shows the quantity picker with a label, the prices and a Remove button that names the product', () => {
    inList();
    expect((screen.getByLabelText('Quantity') as HTMLSelectElement).value).toBe('2');
    expect(screen.getByText('$12.00 each')).toBeTruthy();
    expect(screen.getByText('$24.00')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Remove Cursed Mug from cart' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Cursed Mug' }).getAttribute('href')).toBe('/products/mug');
  });

  it('offers exactly 1–10', () => {
    inList();
    const values = [...(screen.getByLabelText('Quantity') as HTMLSelectElement).options].map((o) => o.value);
    expect(values).toEqual(['1', '2', '3', '4', '5', '6', '7', '8', '9', '10']);
  });

  it('changing the quantity posts a set and refreshes', async () => {
    const fetchMock = mockFetch(ok);
    inList();
    fireEvent.change(screen.getByLabelText('Quantity'), { target: { value: '4' } });
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(bodyOf(fetchMock.mock.calls[0]!)).toEqual({ op: 'set', productId: 'mug', qty: 4 });
  });

  it('a rejected change snaps the picker back and shows the error', async () => {
    mockFetch(() => fail('bad_quantity', 'Quantity must be a whole number from 1 to 10.'));
    inList();
    const select = screen.getByLabelText('Quantity') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: '7' } });
    expect((await screen.findByRole('alert')).textContent).toContain('1 to 10');
    expect(select.value).toBe('2');
    expect(router.refresh).not.toHaveBeenCalled();
  });

  it('Remove posts a remove and refreshes', async () => {
    const fetchMock = mockFetch(ok);
    inList();
    fireEvent.click(screen.getByRole('button', { name: /^Remove/ }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(bodyOf(fetchMock.mock.calls[0]!)).toEqual({ op: 'remove', productId: 'mug' });
  });
});

describe('CouponForm', () => {
  it('posts the code as typed and refreshes', async () => {
    const fetchMock = mockFetch(ok);
    render(<CouponForm />);
    fireEvent.change(screen.getByLabelText('Coupon code'), { target: { value: 'SPOOKY5' } });
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    await waitFor(() => expect(router.refresh).toHaveBeenCalled());
    expect(bodyOf(fetchMock.mock.calls[0]!)).toEqual({ op: 'coupon', code: 'SPOOKY5' });
  });

  it('shows a rejected coupon as an alert', async () => {
    mockFetch(() => jsonResponse(409, { error: { code: 'coupon_already_applied', message: 'This cart already has a coupon.' } }));
    render(<CouponForm />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply' }));
    expect((await screen.findByRole('alert')).textContent).toBe('This cart already has a coupon.');
  });
});

describe('ReviewForm', () => {
  it('posts the text exactly as typed (spaces and markup intact) and clears the box', async () => {
    const fetchMock = mockFetch(() => jsonResponse(200, { review: {} }));
    render(<ReviewForm productId="mug" />);
    const box = screen.getByLabelText('Write a review') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: '  <b>hi</b> & bye  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post review' }));
    await waitFor(() => expect(box.value).toBe(''));
    expect(bodyOf(fetchMock.mock.calls[0]!)).toEqual({ productId: 'mug', body: '  <b>hi</b> & bye  ' });
    expect(screen.getByRole('status').textContent).toBe('Thanks, your review was posted.');
  });

  it('shows a rejected review and keeps what was typed', async () => {
    mockFetch(() => fail('bad_text', 'Text must be 1–100 characters with no control characters.'));
    render(<ReviewForm productId="mug" />);
    const box = screen.getByLabelText('Write a review') as HTMLTextAreaElement;
    fireEvent.change(box, { target: { value: 'x' } });
    fireEvent.click(screen.getByRole('button', { name: 'Post review' }));
    expect((await screen.findByRole('alert')).textContent).toContain('1–100');
    expect(box.value).toBe('x');
  });
});
