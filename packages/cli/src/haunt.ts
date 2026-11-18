/**
 * The haunting pipeline: ownership gate first, then driver, ghosts, oracles, replay verification,
 * certificates. Every external effect (browser, network, disk) comes in through HauntDeps so the
 * pipeline is testable with FakeDriver and FakeShop.
 */
import { mkdir, writeFile } from 'node:fs/promises';
import { randomBytes } from 'node:crypto';
import { join, resolve } from 'node:path';
import {
  RecordingDriver,
  cleanReplay,
  observe,
  runOracles,
  verify,
  type AxeViolation,
  type Driver,
  type Observation,
  type OracleHit,
  type PageEvent,
  type ShopObserver,
} from '@poltergeist/ghost-core';
import {
  MIN_TOKEN_LENGTH,
  emptyObserver,
  runSiteOracles,
  siteObservation,
  type OwnershipDecision,
  type OwnershipDeps,
  type TargetKind,
} from '@poltergeist/driver-playwright';
import { Finding, type PossessOptions, type Step } from '@poltergeist/protocol';
import type { GhostId, HauntOptions } from './args';
import {
  certificateSlug,
  generatePlaywrightTest,
  renderCertificate,
  type CertificateContext,
  type VerifiedFinding,
} from './certificate';
import { SEVERITY } from './severity';

// ── Ghosts ────────────────────────────────────────────────────────────────────────────────────────
export type GhostContext = {
  /** A recording driver: whatever the ghost does becomes the finding's steps. */
  driver: Driver;
  observer: ShopObserver;
  kind: TargetKind;
  seed: number;
  budgetMs: number;
  /** `Date.now()` value after which the ghost must stop. */
  deadline: number;
  log: (line: string) => void;
};

export type Ghost = { id: GhostId; run(ctx: GhostContext): Promise<void> };

/** The ghost personas register here in S06 and S07. */
export const GHOSTS: Partial<Record<GhostId, Ghost>> = {};

// ── Dependencies ──────────────────────────────────────────────────────────────────────────────────
export type LaunchRequest = {
  baseUrl: string;
  kind: TargetKind;
  ownership: OwnershipDecision;
  initial: PossessOptions;
  serverSecret: string | undefined;
};

export type Launched = { driver: Driver; observer: ShopObserver; close(): Promise<void> };

export type HauntDeps = {
  env: Record<string, string | undefined>;
  assertOwnership(url: string, token: string, deps?: OwnershipDeps): Promise<OwnershipDecision>;
  detectShop(baseUrl: string, serverSecret: string): Promise<boolean>;
  launch(req: LaunchRequest): Promise<Launched>;
  ghosts: Partial<Record<GhostId, Ghost>>;
  /** Human-readable progress. Goes to stderr in --bench mode. */
  log(line: string): void;
  mkdir(path: string): Promise<void>;
  writeFile(path: string, text: string): Promise<void>;
};

export const realFs = {
  mkdir: async (p: string) => {
    await mkdir(p, { recursive: true });
  },
  writeFile: (p: string, t: string) => writeFile(p, t, 'utf8'),
};

// ── Report ────────────────────────────────────────────────────────────────────────────────────────
export type ReportFinding = {
  oracle: string;
  rule: string;
  severity: string;
  title: string;
  reproduction: { fired: number; replays: number; rate: number };
  cleanSilent: boolean | null;
  files: { certificate: string; test: string } | null;
};

export type HauntReport = {
  schema: 1;
  target: string;
  ownership: { allowed: boolean; method: string | null; reason: string };
  kind: TargetKind | null;
  seed: number;
  budgetSeconds: number;
  ghosts: { ran: GhostId[]; skipped: GhostId[] };
  findings: ReportFinding[];
  unverified: number;
  critical: number;
};

export type HauntResult = { exitCode: 0 | 1 | 2 | 3; report: HauntReport };

export const EXIT = { ok: 0, critical: 1, refused: 2, failed: 3 } as const;

// ── Helpers ───────────────────────────────────────────────────────────────────────────────────────
const STATUS_LINE = /^(\d{3}) ([A-Z]+) (\S+)/;

/** Turns oracle hits into structured Findings carrying the recipe and the haunting seed. */
export function toFindings(hits: OracleHit[], obs: Observation, ctx: { steps: Step[]; seed: number }): Finding[] {
  const consoleLines = obs.events.filter((e) => e.kind === 'pageerror' || e.kind === 'errorBoundary').map((e) => e.detail);
  const http5xx = obs.events.filter((e) => e.kind === 'http5xx').map((e) => e.detail);
  const network = http5xx.flatMap((d) => {
    const m = STATUS_LINE.exec(d);
    return m ? [{ status: Number(m[1]), method: m[2]!, path: m[3]! }] : [];
  });
  return hits.map((h) =>
    Finding.parse({
      title: h.title,
      rule: h.rule,
      oracle: h.oracle,
      harm: h.harm,
      evidence: { details: h.evidence, screenshot: null, trace: null, console: consoleLines, network, http5xx },
      steps: ctx.steps,
      seed: ctx.seed,
    }),
  );
}

const emptyReport = (opts: HauntOptions): HauntReport => ({
  schema: 1,
  target: opts.url,
  ownership: { allowed: false, method: null, reason: '' },
  kind: null,
  seed: opts.seed,
  budgetSeconds: opts.budget,
  ghosts: { ran: [], skipped: [] },
  findings: [],
  unverified: 0,
  critical: 0,
});

const sleepMs = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

// ── The haunting ──────────────────────────────────────────────────────────────────────────────────
export async function haunt(opts: HauntOptions, deps: HauntDeps): Promise<HauntResult> {
  const report = emptyReport(opts);
  const { log } = deps;

  // 1. The per-run ownership token: chosen in advance by the operator, or generated and printed.
  const preset = deps.env['POLTERGEIST_OWNERSHIP_TOKEN'];
  if (preset !== undefined && preset.length < MIN_TOKEN_LENGTH) {
    report.ownership.reason = `POLTERGEIST_OWNERSHIP_TOKEN must be at least ${MIN_TOKEN_LENGTH} characters`;
    log(`error: ${report.ownership.reason}`);
    return { exitCode: EXIT.refused, report };
  }
  const token = preset ?? `pg-${randomBytes(16).toString('hex')}`;
  log(`Ownership token for this run: ${token}`);

  // 2. The gate runs before anything touches the target.
  const decision = await deps.assertOwnership(opts.url, token, { log });
  report.ownership = { allowed: decision.allowed, method: decision.method, reason: decision.reason };
  if (!decision.allowed) {
    log(`Refusing to haunt ${opts.url}: ${decision.reason}.`);
    log(
      `Only loopback hosts, or sites you control, can be haunted. To prove control, serve the token above at ` +
        `https://<host>/.well-known/poltergeist.txt and re-run with POLTERGEIST_OWNERSHIP_TOKEN set to it.`,
    );
    return { exitCode: EXIT.refused, report };
  }

  let target: URL;
  try {
    target = new URL(opts.url);
  } catch {
    return { exitCode: EXIT.refused, report };
  }
  const baseUrl = target.origin;
  const arrival = target.pathname + target.search || '/';

  // 3. Haunted Shop (all oracles) or any other site (DOM/HTTP oracles only).
  const secret = deps.env['SEANCE_SERVER_SECRET'];
  const kind: TargetKind = secret && (await deps.detectShop(baseUrl, secret)) ? 'shop' : 'site';
  report.kind = kind;
  log(kind === 'shop' ? 'Target is a Haunted Shop: all oracles on.' : 'Target is a site: DOM/HTTP oracles only.');
  const initial: PossessOptions = kind === 'shop' && opts.possess === 'demo' ? { demo: true } : { clean: true };

  let launched: Launched;
  try {
    launched = await deps.launch({ baseUrl, kind, ownership: decision, initial, serverSecret: secret });
  } catch (e) {
    log(`error: could not start the browser session: ${e instanceof Error ? e.message : String(e)}`);
    return { exitCode: EXIT.failed, report };
  }

  try {
    const rec = new RecordingDriver(launched.driver, { seed: opts.seed, ...(kind === 'shop' ? { observer: launched.observer } : {}) });
    const observer = kind === 'shop' ? launched.observer : emptyObserver;
    const events: PageEvent[] = [];
    rec.onEvent((e) => events.push(e));
    const axe = new Map<string, AxeViolation>();
    const scan = async () => {
      for (const v of await rec.axe()) axe.set(`${v.id}|${v.targets.join(',')}`, v);
    };

    // 4. Arrival, then each available ghost within its budget.
    log(`Arriving at ${arrival}`);
    await rec.goto(arrival);
    await scan();
    for (const id of opts.ghosts) {
      const ghost = deps.ghosts[id];
      if (!ghost) {
        report.ghosts.skipped.push(id);
        log(`Ghost ${id}: not available yet, skipped.`);
        continue;
      }
      const budgetMs = opts.budget * 1000;
      const deadline = Date.now() + budgetMs;
      log(`Ghost ${id}: haunting for up to ${opts.budget}s.`);
      const done = ghost.run({ driver: rec, observer, kind, seed: opts.seed, budgetMs, deadline, log }).then(() => 'done' as const);
      const outcome = await Promise.race([done, sleepMs(budgetMs + 5000).then(() => 'late' as const)]);
      if (outcome === 'late') log(`Ghost ${id}: over budget, moving on.`);
      report.ghosts.ran.push(id);
      await scan();
    }

    // 5. Oracles over everything observed.
    const hauntingToken = rec.sessionToken();
    const steps = rec.stepsSinceFreshSession();
    const obs: Observation =
      kind === 'shop'
        ? await observe(observer, hauntingToken, { events, axe: [...axe.values()] })
        : siteObservation({ events, axe: [...axe.values()] });
    const hits = kind === 'shop' ? runOracles(obs) : runSiteOracles(obs);
    const findings = toFindings(hits, obs, { steps, seed: opts.seed });
    log(`Oracles fired ${findings.length} time(s); verifying by replay.`);

    // 6. Replay verification (3 replays), plus the clean replay on the Haunted Shop.
    const replayDeps = { driver: launched.driver, observer };
    const verified: VerifiedFinding[] = [];
    for (const finding of findings) {
      const v = await verify(finding, replayDeps, { base: hauntingToken });
      if (!v.verified) {
        report.unverified += 1;
        log(`  not reproduced, dropped: ${finding.oracle} ${finding.rule}`);
        continue;
      }
      const cleanSilent = kind === 'shop' ? (await cleanReplay(finding, replayDeps)).silent : null;
      verified.push({
        finding,
        severity: SEVERITY[finding.oracle],
        reproduction: { fired: v.fired, replays: v.replays, rate: v.reproductionRate },
        cleanSilent,
      });
      log(`  verified ${v.fired}/${v.replays}: ${finding.oracle} ${finding.rule} (${SEVERITY[finding.oracle]})`);
    }

    // 7. Certificates and generated tests (not in --bench mode).
    const ctx: CertificateContext = {
      target: baseUrl,
      kind,
      ghost: report.ghosts.ran.length > 0 ? report.ghosts.ran.join(', ') : 'arrival walk',
      hauntingToken: kind === 'shop' ? hauntingToken : null,
    };
    const outDir = resolve(opts.out);
    if (!opts.bench && verified.length > 0) await deps.mkdir(outDir);
    for (const [i, v] of verified.entries()) {
      const slug = certificateSlug(i, v.finding);
      let files: ReportFinding['files'] = null;
      if (!opts.bench) {
        files = { certificate: join(outDir, `${slug}.md`), test: join(outDir, `${slug}.spec.ts`) };
        await deps.writeFile(files.test, generatePlaywrightTest(v, ctx));
        await deps.writeFile(files.certificate, renderCertificate(v, ctx, `${slug}.spec.ts`));
      }
      report.findings.push({
        oracle: v.finding.oracle,
        rule: v.finding.rule,
        severity: v.severity,
        title: v.finding.title,
        reproduction: v.reproduction,
        cleanSilent: v.cleanSilent,
        files,
      });
    }
    report.critical = verified.filter((v) => v.severity === 'Critical').length;
    if (!opts.bench && verified.length > 0) log(`Wrote ${verified.length} certificate(s) to ${outDir}`);
    return { exitCode: report.critical > 0 ? EXIT.critical : EXIT.ok, report };
  } catch (e) {
    log(`error: haunting failed: ${e instanceof Error ? e.message : String(e)}`);
    return { exitCode: EXIT.failed, report };
  } finally {
    await launched.close().catch(() => {});
  }
}
