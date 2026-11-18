import { parseArgs } from 'node:util';

/** Ghost ids accepted by `--ghosts`. The personas themselves arrive in S06 and S07. */
export const GHOST_IDS = ['night-owl', 'impatient', 'glitch', 'fraudster'] as const;
export type GhostId = (typeof GHOST_IDS)[number];

export type HauntOptions = {
  url: string;
  ghosts: GhostId[];
  /** Seconds per ghost. */
  budget: number;
  seed: number;
  out: string;
  bench: boolean;
  /** Shop only: which possession to haunt. */
  possess: 'clean' | 'demo';
};

export class UsageError extends Error {}

export const USAGE = `Usage: poltergeist haunt <url> [options]

  --ghosts <list>   Comma-separated ghosts (${GHOST_IDS.join(', ')}) or "all". Default: all
  --budget <secs>   Time budget per ghost, in seconds. Default: 60
  --seed <int>      Haunting seed. Default: 42
  --out <dir>       Where certificates and tests are written. Default: ./haunting
  --bench           Deterministic-only run; one JSON line on stdout, nothing written to disk
  --possess <mode>  Haunted Shop only: "clean" (default) or "demo" (the public demo mutants)

Only sites you control may be haunted: loopback hosts, or a site serving this run's token at
/.well-known/poltergeist.txt. Set POLTERGEIST_OWNERSHIP_TOKEN (16+ characters) to choose the token
in advance. A Haunted Shop also needs SEANCE_SERVER_SECRET in the environment.`;

function int(name: string, raw: string, min: number): number {
  if (!/^-?\d+$/.test(raw)) throw new UsageError(`--${name} must be an integer, got "${raw}"`);
  const n = Number(raw);
  if (!Number.isSafeInteger(n) || n < min) throw new UsageError(`--${name} must be an integer >= ${min}`);
  return n;
}

/** Parses `argv` (without node and script). Throws UsageError on anything unexpected. */
export function parseHauntArgs(argv: string[]): HauntOptions {
  let parsed;
  try {
    parsed = parseArgs({
      args: argv,
      allowPositionals: true,
      options: {
        ghosts: { type: 'string' },
        budget: { type: 'string' },
        seed: { type: 'string' },
        out: { type: 'string' },
        bench: { type: 'boolean' },
        possess: { type: 'string' },
      },
    });
  } catch (e) {
    throw new UsageError(e instanceof Error ? e.message : String(e));
  }
  const [command, url, ...extra] = parsed.positionals;
  if (command !== 'haunt') throw new UsageError(command ? `unknown command "${command}"` : 'missing command');
  if (!url) throw new UsageError('missing <url>');
  if (extra.length > 0) throw new UsageError(`unexpected argument "${extra[0]}"`);
  const v = parsed.values;

  const ghostArg = v.ghosts ?? 'all';
  const ghosts: GhostId[] =
    ghostArg === 'all'
      ? [...GHOST_IDS]
      : ghostArg.split(',').map((g) => {
          const id = g.trim();
          if (!(GHOST_IDS as readonly string[]).includes(id)) throw new UsageError(`unknown ghost "${id}"`);
          return id as GhostId;
        });
  if (v.possess !== undefined && v.possess !== 'clean' && v.possess !== 'demo') {
    throw new UsageError('--possess must be "clean" or "demo"');
  }
  if (v.out !== undefined && v.out.trim() === '') throw new UsageError('--out must not be empty');

  return {
    url,
    ghosts: [...new Set(ghosts)],
    budget: v.budget === undefined ? 60 : int('budget', v.budget, 1),
    seed: v.seed === undefined ? 42 : int('seed', v.seed, 0),
    out: v.out ?? './haunting',
    bench: v.bench ?? false,
    possess: v.possess === 'demo' ? 'demo' : 'clean',
  };
}
