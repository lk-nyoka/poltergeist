import type { MutantOverride } from '@poltergeist/protocol';
import { findProduct } from '@/domain/catalogue';

type Add = (sid: string, productId: string, body: unknown) => Promise<{ productId: string; body: string }>;

export const override: MutantOverride = {
  id: 'ea409b1855fc',
  seam: 'reviews/add',
  public: false,
  // The product name is read for the review record without checking the product exists.
  impl: (original: Add, sid: string, productId: string, body: unknown) => {
    void findProduct(productId)!.name;
    return original(sid, productId, body);
  },
};
