import Link from 'next/link';
import type { ComponentType } from 'react';
import type { Product } from '@/domain/catalogue';
import { formatCents } from '@/lib/format';
import { AddToCartButton } from './AddToCartButton';
import type { ProductImageProps } from './ProductImage';

/**
 * A product in the grid. `ImageComponent` is the render/ProductImage seam, resolved by the page
 * inside withPage(); `href` and `imageSrc` have already been through shopUrl().
 */
export function ProductCard({
  product,
  href,
  imageSrc,
  ImageComponent,
}: {
  product: Product;
  href: string;
  imageSrc: string;
  ImageComponent: ComponentType<ProductImageProps>;
}) {
  return (
    <li className="flex flex-col overflow-hidden rounded-lg border border-zinc-200 bg-white shadow-sm">
      <Link href={href} className="block bg-zinc-100">
        <ImageComponent product={product} src={imageSrc} />
      </Link>
      <div className="flex flex-1 flex-col gap-3 p-4">
        <div className="flex-1">
          <h3 className="font-medium text-zinc-900">
            <Link href={href} className="hover:underline">
              {product.name}
            </Link>
          </h3>
          <p className="mt-1 text-sm text-zinc-600">{product.description}</p>
        </div>
        <p className="text-lg font-semibold text-zinc-900">{formatCents(product.price)}</p>
        <AddToCartButton productId={product.id} name={product.name} />
      </div>
    </li>
  );
}
