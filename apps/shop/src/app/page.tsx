import { ProductCard } from "@/components/ProductCard";
import { ProductImageSeam } from "@/components/render-seams";
import { PRODUCTS } from "@/domain/catalogue";
import { shopUrlServer } from "@/lib/shop-url.server";
import { withPage } from "@/seams/context";

export default async function HomePage() {
  return withPage(async () => {
    const ImageComponent = ProductImageSeam.resolve();
    const items = await Promise.all(
      PRODUCTS.map(async (product) => ({
        product,
        href: await shopUrlServer(`/products/${product.id}`),
        imageSrc: await shopUrlServer(`/products/${product.id}.svg`),
      })),
    );
    return (
      <>
        <h1 className="text-2xl font-semibold text-zinc-900">Haunted household goods</h1>
        <p className="mt-1 max-w-2xl text-zinc-600">
          Eight small things for a home that is not entirely empty. Free returns, but they tend to come back on their
          own.
        </p>
        <ul role="list" className="mt-8 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(({ product, href, imageSrc }) => (
            <ProductCard
              key={product.id}
              product={product}
              href={href}
              imageSrc={imageSrc}
              ImageComponent={ImageComponent}
            />
          ))}
        </ul>
      </>
    );
  });
}
