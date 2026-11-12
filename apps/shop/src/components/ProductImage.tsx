import type { Product } from '@/domain/catalogue';

export type ProductImageProps = {
  product: Product;
  /** Already passed through shopUrl() by the page. */
  src: string;
  className?: string;
};

/** C8: every product image has meaningful alt text (from the catalogue). */
export function ProductImage({ product, src, className }: ProductImageProps) {
  return (
    // Static SVGs served from /public: next/image adds nothing here and would need its own shopUrl handling.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={product.altText} width={240} height={240} className={className ?? 'h-auto w-full'} />
  );
}
