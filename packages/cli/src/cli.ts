import {
  PlaywrightDriver,
  assertOwnership,
  emptyObserver,
  httpObserver,
  httpPossess,
  isHauntedShop,
} from '@poltergeist/driver-playwright';
import { USAGE, UsageError, parseHauntArgs } from './args';
import { EXIT, GHOSTS, haunt, realFs, type HauntDeps, type LaunchRequest, type Launched } from './haunt';

export type Io = { out(line: string): void; err(line: string): void };

async function realLaunch(req: LaunchRequest): Promise<Launched> {
  const shop = req.kind === 'shop' && req.serverSecret !== undefined;
  const driver = await PlaywrightDriver.launch({
    baseUrl: req.baseUrl,
    kind: req.kind,
    ownership: req.ownership,
    initial: req.initial,
    ...(shop ? { possess: httpPossess({ baseUrl: req.baseUrl, serverSecret: req.serverSecret! }) } : {}),
  });
  return {
    driver,
    observer: shop ? httpObserver({ baseUrl: req.baseUrl, serverSecret: req.serverSecret! }) : emptyObserver,
    close: () => driver.close(),
  };
}

export function realDeps(env: Record<string, string | undefined>, log: (line: string) => void): HauntDeps {
  return {
    env,
    assertOwnership,
    detectShop: (baseUrl, secret) => isHauntedShop(baseUrl, secret),
    launch: realLaunch,
    ghosts: GHOSTS,
    log,
    ...realFs,
  };
}

/** Runs the CLI. Returns the process exit code: 0 ok, 1 Critical finding, 2 refused or bad usage, 3 failure. */
export async function main(
  argv: string[],
  env: Record<string, string | undefined>,
  io: Io,
  makeDeps: (env: Record<string, string | undefined>, log: (line: string) => void) => HauntDeps = realDeps,
): Promise<number> {
  if (argv.length === 0 || argv[0] === '--help' || argv[0] === '-h') {
    io.out(USAGE);
    return argv.length === 0 ? EXIT.refused : EXIT.ok;
  }
  let opts;
  try {
    opts = parseHauntArgs(argv);
  } catch (e) {
    if (!(e instanceof UsageError)) throw e;
    io.err(`error: ${e.message}\n\n${USAGE}`);
    return EXIT.refused;
  }
  // In --bench mode stdout carries exactly one JSON line; progress goes to stderr.
  const log = opts.bench ? io.err : io.out;
  const { exitCode, report } = await haunt(opts, makeDeps(env, log));
  if (opts.bench) io.out(JSON.stringify(report));
  else {
    const n = report.findings.length;
    log(`\nDone: ${n} verified finding(s), ${report.critical} Critical. Exit ${exitCode}.`);
  }
  return exitCode;
}
