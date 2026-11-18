import type { MutantOverride } from '@poltergeist/protocol';
import type { CartLine } from '@/store/types';

// Launch prices copied into the pricing module and never synced with the catalogue.
const LAUNCH: Readonly<Record<string, number>> = {
  kettle: 1900, lantern: 1850, mug: 1200, broom: 3500, candle: 1499, plant: 2100, cauldron: 2999, clock: 4200,
};

export const override: MutantOverride = {
  id: 'c3c5351b4418',
  seam: 'pricing/subtotal',
  public: false,
  impl: (original: (lines: CartLine[]) => number, lines: CartLine[]) => {
    if (lines.some((l) => !(l.productId in LAUNCH))) return original(lines);
    return lines.reduce((s, l) => s + LAUNCH[l.productId]! * l.qty, 0);
  },
};
