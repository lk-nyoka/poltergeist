/**
 * Drives a locally running Haunted Shop with the PlaywrightDriver and prints a short report.
 *   pnpm --filter @poltergeist/driver-playwright smoke:shop
 * Needs the shop running (`next start`, BENCH_MODE=1) and SEANCE_SERVER_SECRET in the environment
 * (the script loads apps/shop/.env.local). Prints no secrets and no session tokens.
 */
import { PlaywrightDriver, assertOwnership, httpPossess, runSiteOracles, siteObservation } from '../src/index';

const baseUrl = process.env['SHOP_URL'] ?? 'http://127.0.0.1:3000';
const secret = process.env['SEANCE_SERVER_SECRET'];
if (!secret) throw new Error('SEANCE_SERVER_SECRET is not set');

const lines: string[] = [];
const ownership = await assertOwnership(baseUrl, '', { log: (l) => console.log(l) });
if (!ownership.allowed) process.exit(2);

const driver = await PlaywrightDriver.launch({
  baseUrl,
  kind: 'shop',
  ownership,
  possess: httpPossess({ baseUrl, serverSecret: secret, ...(process.env['BENCH_SECRET'] ? { benchSecret: process.env['BENCH_SECRET'] } : {}) }),
  log: (l) => console.log(l),
});
try {
  const events: { kind: string }[] = [];
  driver.onEvent((e) => events.push(e));

  await driver.goto('/');
  const links = await driver.query('a');
  lines.push(`home: ${links.length} links, path ${await driver.currentPath()}`);

  const cookie = await driver.sessionCookie();
  lines.push(`session cookie kept (not re-minted): ${cookie !== null && cookie === driver.sessionToken()}`);

  const product = links.find((l) => l.name !== '' && l.role === 'link' && l.text !== '' && !/cart|home|skip|shop|orders/i.test(l.name) && l.box.x >= 0 && l.box.y >= 0 && l.box.width > 0);
  if (product) {
    await driver.click({ role: 'link', name: product.name });
    // The shop navigates client-side; give the route change a moment.
    for (let i = 0; i < 30 && (await driver.currentPath()) === '/'; i++) await new Promise((r) => setTimeout(r, 100));
    lines.push(`opened product page: ${await driver.currentPath()}`);
  }
  const api = await driver.request('GET', '/api/products');
  lines.push(`GET /api/products -> ${api.status}`);

  const axe = await driver.axe();
  lines.push(`axe violations on this page: ${axe.map((v) => v.id).join(', ') || 'none'}`);
  lines.push(`site-oracle hits (clean session): ${runSiteOracles(siteObservation({ events: [], axe })).length}`);

  const before = driver.sessionToken();
  await driver.freshSession({ clean: true });
  lines.push(`fresh session issued a new token: ${driver.sessionToken() !== before}`);
  await driver.goto('/cart');
  lines.push(`fresh session cart path: ${await driver.currentPath()}`);
  lines.push(`5xx/pageerror events: ${events.filter((e) => e.kind === 'http5xx' || e.kind === 'pageerror').length}`);
} finally {
  await driver.close();
}
console.log(lines.join('\n'));
