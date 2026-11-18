import type { MutantOverride } from '@poltergeist/protocol';
import type { ProductImageProps } from '@/components/ProductImage';

// The alt attribute was dropped when the image markup was refactored.
function ProductImage({ src, className }: ProductImageProps) {
  return (
    // eslint-disable-next-line @next/next/no-img-element, jsx-a11y/alt-text
    <img src={src} width={240} height={240} className={className ?? 'h-auto w-full'} />
  );
}

export const override: MutantOverride = {
  id: '47c3e6000c10',
  seam: 'render/ProductImage',
  public: true,
  impl: () => ProductImage,
};
