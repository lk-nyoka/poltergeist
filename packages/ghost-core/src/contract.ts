/** Longest accepted name, address or review, in Unicode code points (contract C10). */
export const MAX_TEXT_CODE_POINTS = 100;

// A lone high surrogate, or a low surrogate with no high surrogate before it.
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/;
// eslint-disable-next-line no-control-regex
const CONTROL_CHARS = /[\u0000-\u001F]/;

/**
 * True when `s` is valid under contract C10: at most 100 code points (`[...s].length`), well-formed,
 * and free of U+0000–U+001F. Anything else must get a friendly 4xx.
 */
export function isContractText(s: string): boolean {
  if (LONE_SURROGATE.test(s)) return false;
  if (CONTROL_CHARS.test(s)) return false;
  return [...s].length <= MAX_TEXT_CODE_POINTS;
}
