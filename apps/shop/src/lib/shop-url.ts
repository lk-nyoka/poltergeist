'use client';

// ─── Server helper ────────────────────────────────────────────────────────────
// Import via dynamic import or a dedicated server file so the `next/headers`
// import is never bundled on the client. See shopUrlServer() below.

// ─── Client helpers ───────────────────────────────────────────────────────────

/**
 * Prepends the current /s/<token> prefix to `path` so in-shop navigation
 * always stays within the same sealed session.
 * Safe to call from any client component or hook.
 */
export function shopUrlClient(path: string): string {
  if (typeof window === 'undefined') return path;
  const prefix = extractPrefix(window.location.pathname);
  return prefix + path;
}

function extractPrefix(pathname: string): string {
  const m = pathname.match(/^(\/s\/[^/]+)/);
  return m ? m[1]! : '';
}

/** React hook version — re-computes on every render. */
export function useShopUrl() {
  return (path: string) => shopUrlClient(path);
}
