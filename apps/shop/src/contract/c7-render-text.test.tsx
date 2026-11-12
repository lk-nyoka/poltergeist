// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import { cleanup, render } from '@testing-library/react';
import { ReviewBodySeam } from '@/components/ReviewBody';
import { PROP, contractSession, resetContractWorld } from './helpers';

beforeEach(resetContractWorld);
afterEach(() => {
  cleanup();
  delete (window as unknown as Record<string, unknown>)['__poltergeistBeacon'];
});

/** Beacon-only payloads in every form the Fraudster uses (brief §7.2). They only ever call the beacon. */
const PAYLOADS = [
  "<img src=x onerror=window.__poltergeistBeacon('t1')>",
  "<svg onload=window.__poltergeistBeacon('t2')></svg>",
  "<script>window.__poltergeistBeacon('t3')</script>",
  "<b>bold</b> & <i onclick=window.__poltergeistBeacon('t4')>italic</i>",
  '&lt;already-escaped&gt; &amp; "quotes" \'single\'',
];

/** Renders a review the way the product page does: through the render/ReviewBody seam, for this session. */
async function renderReview(body: string) {
  const s = await contractSession();
  const ReviewBody = s.resolve(ReviewBodySeam);
  return render(<ReviewBody body={body} />);
}

describe('user text is rendered as text', () => {
  it('[C7] markup in a review becomes text, never HTML elements', async () => {
    for (const payload of PAYLOADS) {
      const { container, unmount } = await renderReview(payload);
      // Exactly one element (the wrapper). A raw-HTML render would add <img>, <svg>, <script>, <b>, <i> ...
      expect(container.querySelectorAll('*'), payload).toHaveLength(1);
      expect(container.textContent, payload).toBe(payload);
      unmount();
    }
  });

  it('[C7] no element rendered from user text carries an event-handler attribute', async () => {
    for (const payload of PAYLOADS) {
      const { container, unmount } = await renderReview(payload);
      for (const el of container.querySelectorAll('*')) {
        const handlers = [...el.attributes].filter((a) => a.name.toLowerCase().startsWith('on'));
        expect(handlers, payload).toEqual([]);
      }
      unmount();
    }
  });

  it('[C7] the injected beacon never fires', async () => {
    const beacon = vi.fn();
    (window as unknown as Record<string, unknown>)['__poltergeistBeacon'] = beacon;
    for (const payload of PAYLOADS) {
      const { unmount } = await renderReview(payload);
      unmount();
    }
    expect(beacon).not.toHaveBeenCalled();
  });

  it('[C7] property: any text full of markup characters renders as exactly that text', async () => {
    const markupy = fc.string({
      unit: fc.constantFrom('<', '>', '&', '"', "'", '/', '=', '!', ' ', 'a', 'x', 'o', 'n', 's', 'c', 'r', 'i', 'p', 't', 'm', 'g', ';', '#', '-'),
      minLength: 1,
      maxLength: 60,
    });
    await fc.assert(
      fc.asyncProperty(markupy, async (body) => {
        const { container, unmount } = await renderReview(body);
        try {
          expect(container.querySelectorAll('*')).toHaveLength(1);
          expect(container.textContent).toBe(body);
        } finally {
          unmount();
        }
      }),
      PROP,
    );
  });
});
