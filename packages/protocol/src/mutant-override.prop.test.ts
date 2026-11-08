import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { isWellFormedOverride, type MutantOverride } from './index.js';

const hex = fc.string({
  unit: fc.constantFrom(...('0123456789abcdef' as unknown as string[])),
  minLength: 8,
  maxLength: 64,
});
const seam = fc.stringMatching(/^[a-z][a-z0-9-]{0,15}\/[A-Za-z][A-Za-z0-9]{0,15}$/);
const override: fc.Arbitrary<MutantOverride> = fc.record({
  id: hex,
  seam,
  impl: fc.constant(() => undefined),
  public: fc.boolean(),
});

describe('MutantOverride', () => {
  it('accepts every override with a hex id and a <module>/<export> seam', () => {
    fc.assert(fc.property(override, (o) => isWellFormedOverride(o)));
  });

  it('rejects any id containing a non-hex character', () => {
    const badId = fc
      .tuple(hex, fc.constantFrom(...('ghijklmnopqrstuvwxyz-_ G' as unknown as string[])))
      .map(([h, c]) => h + c);
    fc.assert(
      fc.property(override, badId, (o, id) => {
        expect(isWellFormedOverride({ ...o, id })).toBe(false);
      }),
    );
  });
});
