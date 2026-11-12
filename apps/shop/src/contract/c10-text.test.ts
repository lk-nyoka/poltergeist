// @vitest-environment node
import { beforeEach, describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { PROP, codePoints, contractSession, ok, resetContractWorld, validTextArb, type ContractSession } from './helpers';

beforeEach(resetContractWorld);

const fromCodePoints = (cps: number[]) => String.fromCodePoint(...cps);
const scalar = fc.integer({ min: 0x20, max: 0x10ffff }).filter((cp) => cp < 0xd800 || cp > 0xdfff);
/** Valid text of at most 50 code points, so adding one bad character never also makes it too long. */
const shortValidArb = fc.array(scalar, { minLength: 0, maxLength: 50 }).map(fromCodePoints);

/** Text the contract forbids (C10): 101-500 code points, a control character, a lone surrogate, or nothing at all. */
const invalidTextArb = fc.oneof(
  fc.array(scalar, { minLength: 101, maxLength: 500 }).map(fromCodePoints),
  fc.tuple(shortValidArb, fc.integer({ min: 0x00, max: 0x1f }), fc.nat()).map(([t, cc, at]) => insertAt(t, String.fromCharCode(cc), at)),
  fc.tuple(shortValidArb, fc.integer({ min: 0xd800, max: 0xdfff }), fc.nat()).map(([t, cu, at]) => insertAt(t, String.fromCharCode(cu), at)),
  fc.constant(''),
);

function insertAt(text: string, ch: string, at: number): string {
  const cps = [...text];
  cps.splice(at % (cps.length + 1), 0, ch);
  return cps.join('');
}

/** A ready-to-pay session; returns the intent id. Benign scene: one mug. */
async function readyToPay(s: ContractSession) {
  await s.addToCart('mug', 1);
  return ok(await s.openCheckout()).intentId;
}

describe('C10: text of up to 100 code points, stored and shown exactly as submitted', () => {
  it('[C10] property (P5): any contract-valid review round-trips exactly', async () => {
    await fc.assert(
      fc.asyncProperty(validTextArb, async (text) => {
        const s = await contractSession();
        expect((await s.postReview('mug', text)).status).toBe(200);
        expect(ok(await s.reviews('mug')).reviews.map((r) => r.body)).toEqual([text]);
      }),
      PROP,
    );
  });

  it('[C10] property (P5): any contract-valid name and address round-trip exactly through checkout', async () => {
    await fc.assert(
      fc.asyncProperty(validTextArb, validTextArb, async (name, address) => {
        const s = await contractSession();
        const key = await readyToPay(s);
        const { order } = ok(await s.pay(key, name, address));
        expect(order.name).toBe(name);
        expect(order.address).toBe(address);
        const stored = ok(await s.order(order.id)).order;
        expect(stored.name).toBe(name);
        expect(stored.address).toBe(address);
      }),
      PROP,
    );
  });

  it('[C10] property (P5): invalid text gets a friendly 4xx and nothing is stored', async () => {
    await fc.assert(
      fc.asyncProperty(invalidTextArb, async (text) => {
        const s = await contractSession();
        const review = await s.postReview('mug', text);
        expect(review.status, JSON.stringify(text)).toBe(400);
        expect(ok(await s.reviews('mug')).reviews).toEqual([]);

        const key = await readyToPay(s);
        const asName = await s.pay(key, text, 'Plain Address');
        const asAddress = await s.pay(key, 'Plain Name', text);
        expect(asName.status).toBe(400);
        expect(asAddress.status).toBe(400);
        expect(await s.storedOrders()).toEqual([]);
      }),
      PROP,
    );
  });

  it('[C10] the limit is exactly 100 code points: 100 astral characters (200 UTF-16 units) pass, 101 are refused', async () => {
    const hundred = '👻'.repeat(100);
    const hundredAndOne = '👻'.repeat(101);
    expect(codePoints(hundred)).toBe(100);

    const s = await contractSession();
    expect((await s.postReview('mug', hundred)).status).toBe(200);
    expect((await s.postReview('mug', hundredAndOne)).status).toBe(400);
    expect(ok(await s.reviews('mug')).reviews.map((r) => r.body)).toEqual([hundred]);

    const key = await readyToPay(s);
    expect((await s.pay(key, hundredAndOne, 'x')).status).toBe(400);
    expect(ok(await s.pay(key, hundred, hundred)).order.name).toBe(hundred);
  });

  it('[C10] text is stored with no trimming, no normalising and no truncation', async () => {
    const tricky = [
      '  padded  ',
      '\u0065\u0301', // e + combining acute (NFD)
      '\u00e9', // precomposed (NFC)
      '\u00a0nbsp\u00a0',
      'zero\u200bwidth\u200djoiner',
      '   ',
      'a'.repeat(100),
    ];
    for (const text of tricky) {
      const s = await contractSession();
      expect((await s.postReview('mug', text)).status, JSON.stringify(text)).toBe(200);
      expect(ok(await s.reviews('mug')).reviews[0]?.body, JSON.stringify(text)).toBe(text);
      const key = await readyToPay(s);
      expect(ok(await s.pay(key, text, text)).order.name, JSON.stringify(text)).toBe(text);
    }
  });

  it('[C10] control characters U+0000 to U+001F are each refused, including tab and newline', async () => {
    const s = await contractSession();
    for (let cc = 0; cc <= 0x1f; cc++) {
      const text = `a${String.fromCharCode(cc)}b`;
      expect((await s.postReview('mug', text)).status, `U+${cc.toString(16).padStart(4, '0')}`).toBe(400);
    }
    expect(ok(await s.reviews('mug')).reviews).toEqual([]);
  });
});
