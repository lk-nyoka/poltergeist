import Link from "next/link";
import { shopUrlServer } from "@/lib/shop-url.server";

export default async function NotFound() {
  const homeHref = await shopUrlServer("/");
  return (
    <>
      <h1 className="text-2xl font-semibold text-zinc-900">We could not find that page</h1>
      <p className="mt-2 text-zinc-700">It may have wandered off. Ghosts do that.</p>
      <Link href={homeHref} className="mt-4 inline-block font-medium text-indigo-700 underline">
        Back to the shop
      </Link>
    </>
  );
}
