import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { Finding, ORACLE_NAMES, type Step } from '@poltergeist/protocol';
import { generatePlaywrightTest, renderCertificate, type CertificateContext, type VerifiedFinding } from './certificate';

const t = { gapMs: 0, timingSensitive: false };
const steps: Step[] = [
  { kind: 'freshSession', ...t },
  { kind: 'goto', path: '/products/kettle', ...t },
  { kind: 'type', target: { role: 'textbox', name: 'Review' }, text: 'x`y```z <img src=x onerror=1>', gapMs: 40, timingSensitive: false },
  { kind: 'click', target: { role: 'button', name: 'Pay' }, count: 2, delayMs: 30, ...t },
  { kind: 'request', method: 'post', path: '/api/checkout', body: { intentId: '{{intentId}}' }, ...t },
  { kind: 'press', key: 'Tab', ...t },
  { kind: 'back', ...t },
  { kind: 'reload', ...t },
];

const finding = (oracle: (typeof ORACLE_NAMES)[number]): VerifiedFinding => ({
  finding: Finding.parse({
    title: 'Something broke',
    rule: 'C1',
    oracle,
    harm: 'A customer was hurt.',
    evidence: { details: { note: 'has ``` fence' }, screenshot: null, trace: null, console: ['boom ```'], network: [], http5xx: [] },
    steps,
    seed: 42,
  }),
  severity: 'Critical',
  reproduction: { fired: 3, replays: 3, rate: 1 },
  cleanSilent: true,
});

const shopCtx: CertificateContext = { target: 'http://127.0.0.1:3000', kind: 'shop', ghost: 'arrival walk', hauntingToken: 'Fe26.2**abc' };
const siteCtx: CertificateContext = { ...shopCtx, kind: 'site', hauntingToken: null };

describe('renderCertificate', () => {
  const md = renderCertificate(finding('DoubleCharge'), shopCtx, '01.spec.ts');

  it('carries the fields the brief asks for', () => {
    for (const s of ['Cause of death:** DoubleCharge', 'Who gets hurt:', 'Severity:** Critical', 'reproduced 3/3', 'Steps to reproduce', 'Haunting seed:** 42']) {
      expect(md).toContain(s);
    }
    expect(md).toMatch(/^1\. Open a fresh session$/m);
    expect(md).toMatch(/^8\. Reload the page$/m);
  });

  it('keeps untrusted text inside code spans and fences', () => {
    const step3 = md.split('\n').find((l) => l.startsWith('3. '))!;
    expect(step3).toMatch(/^3\. Type ````+ x`y```z <img src=x onerror=1> ````+ into/);
    expect(md).toMatch(/^`{4,}json$/m);
  });
});

describe('generatePlaywrightTest', () => {
  it.each([...ORACLE_NAMES])('produces syntactically valid TypeScript for %s', (oracle) => {
    for (const ctx of [shopCtx, siteCtx]) {
      const code = generatePlaywrightTest(finding(oracle), ctx);
      const out = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
      expect(out.diagnostics?.map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n')) ?? []).toEqual([]);
    }
  });

  it('asserts through the oracle API for money oracles and fails on the bug', () => {
    const code = generatePlaywrightTest(finding('DoubleCharge'), shopCtx);
    expect(code).toContain('/api/oracle/ledgers');
    expect(code).toContain('x-poltergeist-secret');
    expect(code).toContain('cloneOf');
    expect(code).toContain('await sub("{\\"intentId\\":\\"{{intentId}}\\"}")');
  });

  it('marks oracles without a generated assertion as fixme instead of passing silently', () => {
    expect(generatePlaywrightTest(finding('TillLoss'), shopCtx)).toContain('test.fixme(true');
    expect(generatePlaywrightTest(finding('Crash'), siteCtx)).not.toContain('test.fixme');
  });

  it('quotes hostile text as data', () => {
    const code = generatePlaywrightTest(finding('Crash'), siteCtx);
    expect(code).toContain(JSON.stringify('x`y```z <img src=x onerror=1>'));
  });

  it('does not embed a session token for a non-shop target', () => {
    expect(generatePlaywrightTest(finding('Crash'), siteCtx)).not.toContain('Fe26');
  });
});
