import type { MutantOverride } from '@poltergeist/protocol';
import { findProduct } from '@/domain/catalogue';
import type { Cart } from '@/store/types';

type AddLine = (sid: string, productId: string, qty: number) => Promise<Cart>;

export const override: MutantOverride = {
  id: '2ea6a0b98363',
  seam: 'cart/addLine',
  public: false,
  // The product is looked up and used without checking it exists: an unknown id throws a TypeError.
  impl: (original: AddLine, sid: string, productId: string, qty: number) => {
    const p = findProduct(productId) as { price: number } | undefined;
    void p!.price;
    return original(sid, productId, qty);
  },
};
