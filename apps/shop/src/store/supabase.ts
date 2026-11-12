import type { Store } from './types';

/**
 * PLACEHOLDER until S02 task 12 replaces this whole file with the real SupabaseStore.
 * It exists only so the static `require('./supabase')` in store/index.ts resolves during `next build`.
 * It fails loudly rather than silently falling back to memory, so a misconfigured deploy cannot hide.
 */
export function getSupabaseStore(): Store {
  throw new Error(
    'SupabaseStore is not implemented yet (S02 task 12). Unset SUPABASE_URL and SUPABASE_SECRET_KEY to use the in-memory store.',
  );
}
