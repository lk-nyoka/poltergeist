import { shopUrlClient } from '@/lib/shop-url';

export type ApiResult<T = unknown> =
  | { ok: true; status: number; data: T }
  | { ok: false; status: number; code: string; message: string };

/**
 * Client-side POST to the shop API. The path always goes through shopUrlClient so the
 * /s/<token> prefix is kept (brief §6). Never throws: failures come back as { ok: false }.
 */
export async function postJson<T = unknown>(
  path: string,
  body?: unknown,
  headers: Record<string, string> = {},
): Promise<ApiResult<T>> {
  try {
    const res = await fetch(shopUrlClient(path), {
      method: 'POST',
      headers: { ...(body === undefined ? {} : { 'content-type': 'application/json' }), ...headers },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const data: unknown = await res.json().catch(() => null);
    if (res.ok) return { ok: true, status: res.status, data: data as T };
    const err = (data as { error?: { code?: string; message?: string } } | null)?.error;
    return {
      ok: false,
      status: res.status,
      code: err?.code ?? 'error',
      message: err?.message ?? 'Something went wrong. Please try again.',
    };
  } catch {
    return { ok: false, status: 0, code: 'network', message: 'Network problem. Please try again.' };
  }
}
