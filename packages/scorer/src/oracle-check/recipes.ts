/**
 * The contract tests' actions, expressed as Step lists (R4). One recipe per rule: the smallest
 * replayable run in which a mutant breaking that rule shows up to a MAPPED oracle (ORACLE_RULES).
 *
 * A recipe holds plain Steps plus, for the oracles that need evidence only a ghost can gather (text read
 * back from the page, a dialog focus trace), a `collect` spec the runner turns into replay's `collect` hook.
 * Recipes use API requests for set-up and structural selectors (never accessible names) on pages, as the
 * contract tests do, so a C8 mutant that strips a name cannot disturb another rule's recipe.
 *
 * Recipes contain no mutant ids, seams or manifest data.
 */
import type { Rule, Step } from '@poltergeist/protocol';

export type CollectSpec = {
  /** Read each submitted text back from the page and compare (TextCorruption). */
  texts?: { field: 'name' | 'address' | 'review'; submitted: string; selector: string }[];
  /** Walk the checkout dialog by keyboard (FocusFailure). */
  dialogFocus?: { openerName: string };
};

export type Recipe = { steps: Step[]; collect?: CollectSpec };

const t = { timingSensitive: false } as const;
const fresh = (): Step => ({ kind: 'freshSession', gapMs: 0, ...t });
const go = (path: string): Step => ({ kind: 'goto', path, gapMs: 0, ...t });
const reload = (): Step => ({ kind: 'reload', gapMs: 0, ...t });
const req = (method: string, path: string, body?: unknown, headers?: Record<string, string>, gapMs = 0, timing = false): Step => ({
  kind: 'request',
  method,
  path,
  ...(body !== undefined ? { body } : {}),
  ...(headers ? { headers } : {}),
  gapMs,
  timingSensitive: timing,
});
const type = (css: string, text: string): Step => ({ kind: 'type', target: { css }, text, gapMs: 0, ...t });
const click = (css: string): Step => ({ kind: 'click', target: { css }, gapMs: 0, ...t });

const add = (productId: string, qty: unknown) => req('POST', '/api/cart', { op: 'add', productId, qty });
const coupon = (code: string) => req('POST', '/api/cart', { op: 'coupon', code });
const open = () => req('POST', '/api/checkout/open');
const NAME = 'Ada Lovelace';
const ADDRESS = '1 Analytical Way';
const pay = (extra: Record<string, unknown> = {}, gapMs = 0, timing = false) =>
  req('POST', '/api/checkout', { name: NAME, address: ADDRESS, ...extra }, { 'idempotency-key': '{{intentId}}' }, gapMs, timing);

const REVIEW_TEXTAREA = 'section[aria-labelledby="reviews-heading"] textarea, form textarea';
const REVIEW_SUBMIT = 'form button[type="submit"]';
const REVIEW_ITEMS = 'section[aria-labelledby="reviews-heading"] li';

const BEACON = (token: string) => `window.__poltergeistBeacon('${token}')`;

/** A review is typed and submitted from the product page, then the page is reloaded so it renders from storage. */
const postReview = (text: string): Step[] => [go('/products/mug'), type(REVIEW_TEXTAREA, text), click(REVIEW_SUBMIT), reload()];

const TRICKY_TEXT = `  a<b & c>d "q" 'r' \u00e9\u0301 \ud83d\udc7b  `;

export const RECIPES: Readonly<Record<Rule, Recipe>> = Object.freeze({
  // C1: Pay pressed three times, 20 to 150 ms apart, on one intent.
  C1: { steps: [fresh(), add('mug', 2), open(), pay({}, 40, true), pay({}, 80, true), pay({}, 120, true)] },
  // C2: pay, view the order, go back, reload, pay the old intent again.
  C2: {
    steps: [
      fresh(),
      add('mug', 2),
      open(),
      pay(),
      go('/orders/{{orderId}}'),
      { kind: 'back', gapMs: 0, ...t },
      reload(),
      pay(),
    ],
  },
  // C3: quantities the contract refuses, then a checkout so an accepted bad quantity reaches an order.
  C3: {
    steps: [
      fresh(),
      add('mug', 1),
      add('mug', 11),
      add('lantern', 1000000000),
      add('kettle', -3),
      add('candle', 0.5),
      add('broom', 0),
      open(),
      pay(),
    ],
  },
  // C4: two different coupons, then the first again.
  C4: { steps: [fresh(), add('mug', 2), coupon('SPOOKY5'), coupon('HAUNT15'), coupon('SPOOKY5'), open(), pay()] },
  // C5: prices, totals and discounts sent by the client.
  C5: {
    steps: [
      fresh(),
      req('POST', '/api/cart', { op: 'add', productId: 'mug', qty: 1, price: 1, unitCents: 1, discount: 9999 }),
      open(),
      pay({ total: 0, totalCents: 0 }),
    ],
  },
  // C6: a total that lands on exactly half a cent after the percent coupon.
  C6: { steps: [fresh(), add('lantern', 1), coupon('HAUNT15'), open(), pay()] },
  // C7: markup in a review, in script and event-handler forms; the beacon only records a token.
  C7: {
    steps: [
      fresh(),
      ...postReview(`<script>${BEACON('pg-c7-script')}</script>`),
      ...postReview(`<img src=x onerror="${BEACON('pg-c7-img')}">`),
      ...postReview(`<svg onload="${BEACON('pg-c7-svg')}"></svg>`),
    ],
  },
  // C8: every page a customer sees, with items in the cart.
  C8: { steps: [fresh(), go('/'), go('/products/mug'), add('mug', 1), go('/cart')] },
  // C9: the checkout dialog, walked by keyboard from the cart.
  C9: { steps: [fresh(), add('mug', 1), go('/cart')], collect: { dialogFocus: { openerName: 'Checkout' } } },
  // C10: contract-valid text that must come back exactly.
  C10: {
    steps: [fresh(), ...postReview(TRICKY_TEXT)],
    collect: { texts: [{ field: 'review', submitted: TRICKY_TEXT, selector: REVIEW_ITEMS }] },
  },
  // C11: the stranger's order.
  C11: { steps: [fresh(), req('GET', '/api/orders/stranger-order-fixed')] },
  // C12: awkward JSON for every public POST route; none may answer 5xx.
  C12: {
    steps: [
      fresh(),
      ...['/api/cart', '/api/checkout/open', '/api/checkout', '/api/reviews'].flatMap((path) => [
        req('POST', path, null),
        req('POST', path, []),
        req('POST', path, {}),
        req('POST', path, { op: { a: 1 }, productId: [], qty: {}, code: 7, name: null, address: [], body: 5 }),
        req('POST', path, { productId: 'x'.repeat(5000), body: 'y'.repeat(5000), code: 'z'.repeat(5000) }),
        req('POST', path, { op: 'add', productId: '__proto__', qty: 1 }),
        req('POST', path, { productId: 'mug', body: '\u0000\ud800' }),
      ]),
    ],
  },
});

/** Recipes must be valid for the replayer: no steps it refuses. */
export function recipeFor(rule: Rule): Recipe {
  return RECIPES[rule];
}
