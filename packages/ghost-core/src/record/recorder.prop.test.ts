import { describe, it, expect } from 'vitest';
import fc from 'fast-check';
import { resolvePlaceholders, substitutePlaceholders } from './recorder';

const id = fc.stringMatching(/^[a-z0-9_:]{1,12}$/);
// Text with no braces, so it can never contain a literal placeholder.
const text = fc.string({ unit: fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz0123456789_:/ '.split('')), maxLength: 40 });
const value: fc.Arbitrary<unknown> = fc.oneof(
  text,
  fc.array(text, { maxLength: 4 }),
  fc.dictionary(fc.constantFrom('a', 'b', 'c'), fc.oneof(text, fc.integer(), fc.boolean(), fc.constant(null))),
);

describe('placeholder substitution', () => {
  it('resolve(substitute(x)) gives x back', () => {
    fc.assert(
      fc.property(value, id, id, (v, intentId, orderId) => {
        fc.pre(intentId !== orderId);
        const known = { intentId, orderId };
        const sub = substitutePlaceholders(v, known);
        expect(resolvePlaceholders(sub, known)).toEqual(v);
      }),
    );
  });
});
