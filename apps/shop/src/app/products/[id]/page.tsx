import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { AddToCartButton } from "@/components/AddToCartButton";
import { ReviewForm } from "@/components/ReviewForm";
import { ReviewBodySeam } from "@/components/ReviewBody";
import { ProductImageSeam } from "@/components/render-seams";
import { findProduct } from "@/domain/catalogue";
import * as reviews from "@/domain/reviews";
import { formatCents } from "@/lib/format";
import { shopUrlServer } from "@/lib/shop-url.server";
import { withPage } from "@/seams/context";

export async function generateMetadata(props: PageProps<"/products/[id]">): Promise<Metadata> {
  const { id } = await props.params;
  return { title: findProduct(id)?.name ?? "Product" };
}

export default async function ProductPage(props: PageProps<"/products/[id]">) {
  const { id } = await props.params;
  const product = findProduct(id);
  if (!product) notFound();
  const imageSrc = await shopUrlServer(`/products/${product.id}.svg`);

  return withPage(async (ctx) => {
    const ImageComponent = ProductImageSeam.resolve();
    const ReviewBody = ReviewBodySeam.resolve();
    const mine = await reviews.list(ctx.sid, product.id);
    return (
      <article>
        <div className="grid gap-8 md:grid-cols-2">
          <div className="overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100">
            <ImageComponent product={product} src={imageSrc} />
          </div>
          <div>
            <h1 className="text-2xl font-semibold text-zinc-900">{product.name}</h1>
            <p className="mt-2 text-2xl font-semibold text-zinc-900">{formatCents(product.price)}</p>
            <p className="mt-4 text-zinc-700">{product.description}</p>
            <div className="mt-6">
              <AddToCartButton productId={product.id} name={product.name} withQuantity />
            </div>
          </div>
        </div>

        <section aria-labelledby="reviews-heading" className="mt-12 max-w-2xl">
          <h2 id="reviews-heading" className="text-lg font-semibold text-zinc-900">
            Reviews
          </h2>
          <p className="mt-1 text-sm text-zinc-600">In this demo, reviews are only visible to the visitor who wrote them.</p>
          {mine.length === 0 ? (
            <p className="mt-4 text-sm text-zinc-700">No reviews yet.</p>
          ) : (
            <ul role="list" className="mt-4 divide-y divide-zinc-200 rounded-md border border-zinc-200 bg-white">
              {mine.map((r) => (
                <li key={r.id} className="px-4 py-3">
                  <ReviewBody body={r.body} />
                </li>
              ))}
            </ul>
          )}
          <div className="mt-6">
            <ReviewForm productId={product.id} />
          </div>
        </section>
      </article>
    );
  });
}
