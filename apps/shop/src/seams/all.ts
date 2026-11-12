/**
 * Barrel that imports every seam-defining module so listSeamKeys() is complete.
 * Updated as domain files are added. Import this in registry tests and mutant-check.
 */
import '@/lib/text';
import '@/domain/pricing';
import '@/domain/cart';
import '@/domain/checkout';
import '@/domain/orders';
import '@/domain/reviews';
import '@/components/ReviewBody';
// Task 9 adds the remaining render seams (ProductImage, PayButton, CheckoutDialog, CartLine).
