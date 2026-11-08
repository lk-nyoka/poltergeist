import type { Store } from './types';
import { getMemoryStore } from './memory';

let _store: Store | null = null;

export function getStore(): Store {
  if (_store) return _store;

  if (process.env['BENCH_MODE'] === '1') {
    _store = getMemoryStore();
    return _store;
  }

  const url = process.env['SUPABASE_URL'];
  const key = process.env['SUPABASE_SECRET_KEY'];
  if (url && key) {
    // Lazy import so the Supabase client is never loaded in MemoryStore mode
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { getSupabaseStore } = require('./supabase') as { getSupabaseStore: () => Store };
    _store = getSupabaseStore();
    return _store;
  }

  _store = getMemoryStore();
  return _store;
}

/** Reset store singleton — for tests only. */
export function _resetStoreForTest(): void {
  _store = null;
}
