import { seam } from '@/seams/registry';
import { ApiError } from '@/lib/http';
import { validateText } from '@/lib/text';
import { getStore } from '@/store';
import type { Review } from '@/store/types';
import { findProduct } from './catalogue';

export const add = seam('reviews/add', async (sid: string, productId: string, body: unknown): Promise<{ productId: string; body: string }> => {
  if (!findProduct(productId)) throw new ApiError(404, 'no_product');
  const text = validateText(body); // C10
  await getStore().addReview({ sid, productId, body: text });
  return { productId, body: text };
});

/** REQ-5.5: reviews are visible only to the session that wrote them. */
export const list = seam('reviews/list', async (sid: string, productId: string): Promise<Review[]> => {
  const all = await getStore().listReviews(sid, productId);
  return all.filter((r) => r.sid === sid);
});
