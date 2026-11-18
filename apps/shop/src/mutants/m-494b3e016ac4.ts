import type { MutantOverride } from '@poltergeist/protocol';
import { findProduct } from '@/domain/catalogue';
import type { Cart } from '@/store/types';

type Remove = (sid: string, productId: string) => Promise<Cart>;

export const override: MutantOverride = {
  id: '494b3e016ac4',
  seam: 'cart/removeLine',
  public: false,
  // The product is looked up before the "is it in the cart" check; an unknown id throws a TypeError.
  impl: (original: Remove, sid: string, productId: string) => {
    void findProduct(productId)!.id;
    return original(sid, productId);
  },
};
