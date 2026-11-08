import { headers } from 'next/headers';

/**
 * Server-side shopUrl: reads the x-pg-prefix header that proxy.ts injects.
 * Use inside server components, route handlers and server actions.
 */
export async function shopUrlServer(path: string): Promise<string> {
  const hdrs = await headers();
  const prefix = hdrs.get('x-pg-prefix') ?? '';
  return prefix + path;
}
