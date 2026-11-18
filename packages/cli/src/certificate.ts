/**
 * Death certificates (Markdown) and generated Playwright regression tests for verified findings.
 * Everything that came from the target (typed text, selectors, evidence) is untrusted: it is
 * rendered inside code fences or spans only, and JSON-quoted in generated code.
 */
import { A11Y_RULE_IDS } from '@poltergeist/ghost-core';
import type { Finding, OracleName, Step } from '@poltergeist/protocol';
import type { Severity } from './severity';

export type VerifiedFinding = {
  finding: Finding;
  severity: Severity;
  reproduction: { fired: number; replays: number; rate: number };
  /** True when the clean replay stayed silent; null when no clean replay applies (not the Haunted Shop). */
  cleanSilent: boolean | null;
};

export type CertificateContext = {
  target: string;
  kind: 'shop' | 'site';
  ghost: string;
  /** Sealed session token of the haunting, used by the generated test to clone the session. Shop only. */
  hauntingToken: string | null;
};

/** A fence longer than any backtick run inside `text`. */
function fenceFor(text: string): string {
  const longest = Math.max(0, ...[...text.matchAll(/`+/g)].map((m) => m[0].length));
  return '`'.repeat(Math.max(3, longest + 1));
}

function fenced(text: string, lang = ''): string {
  const f = fenceFor(text);
  return `${f}${lang}\n${text}\n${f}`;
}

/** Inline code that cannot be broken out of. */
function span(text: string): string {
  const flat = text.replace(/\s+/g, ' ');
  const ticks = '`'.repeat(Math.max(1, ...[...flat.matchAll(/`+/g)].map((m) => m[0].length + 1)));
  return `${ticks} ${flat} ${ticks}`;
}

export function describeStep(s: Step): string {
  const loc = (t: { role?: string | undefined; name?: string | undefined; css?: string | undefined; testId?: string | undefined }) =>
    [t.role && `role=${t.role}`, t.name !== undefined && `name="${t.name}"`, t.css && `css=${t.css}`, t.testId && `testId=${t.testId}`]
      .filter(Boolean)
      .join(', ');
  switch (s.kind) {
    case 'freshSession':
      return 'Open a fresh session';
    case 'goto':
      return `Go to ${span(s.path)}`;
    case 'click':
      return `Click ${span(loc(s.target))}${s.count && s.count > 1 ? ` ${s.count} times (${s.delayMs ?? 0} ms apart)` : ''}`;
    case 'type':
      return `Type ${span(s.text.length > 120 ? `${s.text.slice(0, 120)}…` : s.text)} into ${span(loc(s.target))}`;
    case 'press':
      return `Press ${span(s.key)}`;
    case 'back':
      return 'Go back';
    case 'reload':
      return 'Reload the page';
    case 'request':
      return `Send ${span(`${s.method.toUpperCase()} ${s.path}`)}`;
    case 'mcp':
      return `Tool call ${span(s.tool)}`;
  }
}

export function certificateSlug(index: number, f: Finding): string {
  return `${String(index + 1).padStart(2, '0')}-${f.oracle}-${f.rule}`;
}

export function renderCertificate(v: VerifiedFinding, ctx: CertificateContext, testFile: string): string {
  const f = v.finding;
  const rate = `reproduced ${v.reproduction.fired}/${v.reproduction.replays}`;
  const lines = [
    `# Death certificate: ${f.title}`,
    '',
    `- **Cause of death:** ${f.oracle} (contract rule ${f.rule})`,
    `- **Who gets hurt:** ${f.harm}`,
    `- **Ghost:** ${ctx.ghost}`,
    `- **Severity:** ${v.severity}`,
    `- **Reproduction rate:** ${rate}`,
    ...(v.cleanSilent === null ? [] : [`- **Silent on a clean shop:** ${v.cleanSilent ? 'yes' : 'no'}`]),
    `- **Target:** ${span(ctx.target)} (${ctx.kind === 'shop' ? 'Haunted Shop' : 'other site, DOM/HTTP oracles only'})`,
    `- **Haunting seed:** ${f.seed}`,
    '',
    '## Steps to reproduce',
    '',
    ...f.steps.map((s, i) => `${i + 1}. ${describeStep(s)}`),
    '',
    '## Shrunk failing input',
    '',
    'Not applicable: this finding did not come from a generated input.',
    '',
    '## Evidence',
    '',
    fenced(JSON.stringify(f.evidence.details, null, 2), 'json'),
    '',
    ...(f.evidence.console.length > 0 ? ['Console:', '', fenced(f.evidence.console.join('\n')), ''] : []),
    ...(f.evidence.http5xx.length > 0 ? ['Server errors:', '', fenced(f.evidence.http5xx.join('\n')), ''] : []),
    '## Screenshot',
    '',
    'Not captured in this version.',
    '',
    '## Regression test',
    '',
    `Generated Playwright test: ${span(testFile)}`,
    '',
  ];
  return lines.join('\n');
}

// ── Generated Playwright test ───────────────────────────────────────────────────────────────────
const q = (s: string) => JSON.stringify(s);
const hasPlaceholder = (s: string) => s.includes('{{');
/** A string expression; placeholders are filled from the oracle API at run time. */
const str = (s: string) => (hasPlaceholder(s) ? `await sub(${q(s)})` : q(s));

function stepCode(s: Step): string[] {
  const wait = s.gapMs > 0 ? [`await page.waitForTimeout(${Math.min(s.gapMs, 1000)});`] : [];
  const body = ((): string[] => {
    switch (s.kind) {
      case 'freshSession':
        return ['await freshSession();'];
      case 'goto':
        return [`await page.goto(new URL(${str(s.path)}, BASE_URL).href);`];
      case 'click': {
        const count = s.count ?? 1;
        const target = hasPlaceholder(JSON.stringify(s.target)) ? `JSON.parse(await sub(${q(JSON.stringify(s.target))}))` : JSON.stringify(s.target);
        if (count === 1) return [`await L(${target}).click();`];
        return [
          `for (let i = 0; i < ${count}; i++) {`,
          `  if (i > 0) await page.waitForTimeout(${s.delayMs ?? 0});`,
          `  await L(${target}).click(i === 0 ? {} : { timeout: 1000 }).catch((e) => { if (i === 0) throw e; });`,
          '}',
        ];
      }
      case 'type':
        return [`await L(${JSON.stringify(s.target)}).fill(${str(s.text)});`];
      case 'press':
        return [`await page.keyboard.press(${q(s.key)});`];
      case 'back':
        return ['await page.goBack();'];
      case 'reload':
        return ['await page.reload();'];
      case 'request': {
        const data = s.body === undefined ? '' : `, data: JSON.parse(${str(JSON.stringify(s.body))})`;
        const headers = s.headers ? `, headers: ${JSON.stringify(s.headers)}` : '';
        return [`await context.request.fetch(new URL(${str(s.path)}, BASE_URL).href, { method: ${q(s.method.toUpperCase())}${headers}${data}, failOnStatusCode: false });`];
      }
      case 'mcp':
        return [`// mcp tool call ${q(s.tool)} has no Playwright equivalent here`];
    }
  })();
  return [...wait, ...body, 'await scan();'];
}

const ASSERTIONS: Partial<Record<OracleName, string[]>> = {
  Crash: ['expect(crashes, "the page crashed or the server errored").toEqual([]);'],
  ScriptExecution: ['expect(beacons, "text typed into the page ran as a script").toEqual([]);'],
  A11yViolation: ['expect(a11y, "controls with no accessible name").toEqual([]);'],
  DoubleCharge: [
    'const ledgers = await observe("/api/oracle/ledgers");',
    'const perIntent = new Map<string, number>();',
    'for (const e of ledgers.customer.entries) if (e.amount_cents < 0 && e.intent_id) perIntent.set(e.intent_id, (perIntent.get(e.intent_id) ?? 0) + 1);',
    'expect([...perIntent.values()].filter((n) => n > 1), "one purchase was debited more than once").toEqual([]);',
  ],
  PrivacyLeak: [
    'const orders = await observe("/api/oracle/orders?reads=1");',
    'expect((orders.reads ?? []).filter((r: { orderId: string }) => r.orderId === "stranger-order-fixed"), "a stranger\'s order was readable").toEqual([]);',
  ],
};

const SHOP_ONLY: ReadonlySet<OracleName> = new Set(['DoubleCharge', 'PrivacyLeak', 'StateLoss', 'TillLoss', 'QuantityBreach']);

export function generatePlaywrightTest(v: VerifiedFinding, ctx: CertificateContext): string {
  const f = v.finding;
  const shop = ctx.kind === 'shop' && ctx.hauntingToken !== null;
  const asserts = ASSERTIONS[f.oracle];
  const needsObserve = shop && (SHOP_ONLY.has(f.oracle) || f.steps.some((s) => JSON.stringify(s).includes('{{')));
  const out: string[] = [
    `// Generated by Poltergeist. ${f.oracle} (${f.rule}): ${f.title}`,
    `// Haunting seed ${f.seed}. Replays the recorded steps, then asserts the oracle stays silent.`,
    '// The test FAILS while the bug exists and passes once it is fixed.',
    ...(shop ? ['// Needs SEANCE_SERVER_SECRET in the environment (the local Haunted Shop only).'] : []),
    ...(f.oracle === 'A11yViolation' ? ['// Needs the axe-core package.'] : []),
    '',
    "import { createRequire } from 'node:module';",
    "import { readFileSync } from 'node:fs';",
    "import { test, expect, type Locator } from '@playwright/test';",
    '',
    `const BASE_URL = process.env.POLTERGEIST_BASE_URL ?? ${q(ctx.target)};`,
    ...(shop
      ? [
          `const CLONE_OF = ${q(ctx.hauntingToken!)};`,
          'const SECRET = process.env.SEANCE_SERVER_SECRET ?? "";',
        ]
      : []),
    `const A11Y_RULES = ${JSON.stringify(A11Y_RULE_IDS)};`,
    '',
    `test(${q(`${f.oracle}: ${f.title}`)}, async ({ page, context }) => {`,
    ...(asserts ? [] : [`  test.fixme(true, ${q(`An assertion for ${f.oracle} is not generated yet; the steps below replay the finding.`)});`]),
    '  const crashes: string[] = [];',
    '  const beacons: string[] = [];',
    '  const a11y: string[] = [];',
    '  let token = "";',
    '  page.on("pageerror", (e) => crashes.push("pageerror: " + e.message));',
    '  page.on("response", (r) => { if (r.status() >= 500) crashes.push(r.status() + " " + new URL(r.url()).pathname); });',
    '  await context.exposeFunction("__poltergeistBeacon", (t: unknown) => { beacons.push(String(t)); });',
    '',
    '  const L = (t: { role?: string; name?: string; css?: string; testId?: string }): Locator => {',
    '    let l: Locator | null = t.css ? page.locator(t.css) : null;',
    '    const and = (n: Locator) => { l = l ? l.and(n) : n; };',
    '    if (t.testId) and(page.getByTestId(t.testId));',
    '    if (t.role) and(page.getByRole(t.role as never, t.name === undefined ? {} : { name: t.name, exact: true }));',
    '    else if (t.name !== undefined) and(page.getByText(t.name, { exact: true }));',
    '    if (!l) throw new Error("empty locator");',
    '    return (l as Locator).first();',
    '  };',
    '',
    '  const axeSource = readFileSync(createRequire(import.meta.url).resolve("axe-core/axe.min.js"), "utf8");',
    '  const scan = async () => {',
    '    if (crashes.length === 0 && (await page.locator("[data-error-boundary=true]").count()) > 0) crashes.push("error boundary on " + new URL(page.url()).pathname);',
    ...(f.oracle === 'A11yViolation'
      ? [
          '    await page.evaluate("if (typeof axe === \\"undefined\\") {\\n" + axeSource + "\\n}");',
          '    const found = await page.evaluate("axe.run(document, { resultTypes: [\\"violations\\"] }).then((r) => r.violations.map((v) => v.id))") as string[];',
          '    for (const id of found) if (A11Y_RULES.includes(id) && !a11y.includes(id)) a11y.push(id);',
        ]
      : ['    void axeSource; void A11Y_RULES;']),
    '  };',
    '',
    ...(shop
      ? [
          '  const freshSession = async () => {',
          '    const res = await fetch(new URL("/api/possess", BASE_URL), {',
          '      method: "POST",',
          '      headers: { "content-type": "application/json", "x-poltergeist-secret": SECRET },',
          '      body: JSON.stringify({ cloneOf: CLONE_OF }),',
          '    });',
          '    if (!res.ok) throw new Error("possess failed: HTTP " + res.status);',
          '    token = ((await res.json()) as { token: string }).token;',
          '    await context.clearCookies();',
          '    await context.addCookies([{ name: "__Host-pg_sid", value: token, domain: new URL(BASE_URL).hostname, path: "/", httpOnly: true, secure: true, sameSite: "None" }]);',
          '  };',
        ]
      : ['  const freshSession = async () => { await context.clearCookies(); };']),
    ...(needsObserve
      ? [
          '  const observe = async (path: string) => {',
          '    const res = await fetch(new URL(path, BASE_URL), { headers: { "x-poltergeist-secret": SECRET, "x-pg-observe": token } });',
          '    if (!res.ok) throw new Error("oracle read failed: HTTP " + res.status);',
          '    return (await res.json()) as any;',
          '  };',
          '  const sub = async (s: string) => {',
          '    const intents = (await observe("/api/oracle/intents")).intents;',
          '    const orders = (await observe("/api/oracle/orders")).orders;',
          '    return s.replace(/\\{\\{intentId\\}\\}/g, intents.at(-1)?.id ?? "").replace(/\\{\\{orderId\\}\\}/g, orders.at(-1)?.id ?? "");',
          '  };',
        ]
      : []),
    '',
    '  await freshSession();',
    ...f.steps.flatMap((s) => stepCode(s).map((l) => `  ${l}`)),
    '',
    ...(asserts ?? ['// no assertion generated']).map((l) => `  ${l}`),
    '});',
    '',
  ];
  return out.join('\n');
}
