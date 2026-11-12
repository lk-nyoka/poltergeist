import { seam } from '@/seams/registry';
import { ApiError } from '@/lib/http';

/**
 * C10: well-formed Unicode, 1–100 code points, no U+0000–U+001F.
 * Returns the input exactly as submitted: no trim, no normalise.
 */
export const validateText = seam('text/validateText', (s: unknown): string => {
  if (typeof s !== 'string' || !s.isWellFormed()) throw new ApiError(400, 'bad_text');
  const n = [...s].length;
  if (n < 1 || n > 100 || /[\u0000-\u001F]/.test(s)) throw new ApiError(400, 'bad_text');
  return s; // exactly as submitted (C10)
});
