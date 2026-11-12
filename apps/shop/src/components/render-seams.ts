import { seamComponent } from '@/seams/registry';
import { CartLine } from './CartLine';
import { CheckoutDialog } from './CheckoutDialog';
import { PayButton } from './PayButton';
import { ProductImage } from './ProductImage';

/**
 * Render seams (brief §6.1). Server-only: the registry uses AsyncLocalStorage, so this file must never
 * be imported from a 'use client' module. Pages call `.resolve()` INSIDE withPage() and pass the
 * resolved component (or an element built from it) down as a slot. ReviewBody registers itself.
 */
export const ProductImageSeam = seamComponent('render/ProductImage', ProductImage);
export const CartLineSeam = seamComponent('render/CartLine', CartLine);
export const PayButtonSeam = seamComponent('render/PayButton', PayButton);
export const CheckoutDialogSeam = seamComponent('render/CheckoutDialog', CheckoutDialog);
