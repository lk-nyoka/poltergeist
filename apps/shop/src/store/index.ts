import type { Store } from './types';
import { getMemoryStore } from './memory';

// Only the Supabase store is cached here. The memory store is already a singleton that
// _resetMemoryStoreForTest() replaces, so it must be looked up on every call or test resets go stale.
let _supabase: Store | null = null;

export function getStore(): Store {
  if (process.env['BENCH_MODE'] === '1') return getMemoryStore();

  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SECRET_KEY'];
  if (url && key) {
    if (_supabase) return _supabase;
    // Lazy import so the Supabase client is never loaded in MemoryStore mode
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSupabaseStore } = require('./supabase') as { getSupabaseStore: () => Store };
    _supabase = getSupabaseStore();
    return _supabase;
  }

  return getMemoryStore();
}

/** Reset store singleton — for tests only. */
export function _resetStoreForTest(): void {
  _supabase = null;
}
