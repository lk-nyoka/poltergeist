/**
 * Ownership safety gate (brief H8). Poltergeist drives a browser hard against a site, so it only
 * acts on a target the operator controls: a loopback host, or a site that serves the per-run token
 * at /.well-known/poltergeist.txt (the same idea as an ACME HTTP challenge).
 *
 * Never weaken this file and never add a flag that skips it for non-loopback hosts.
 */
import { lookup as dnsLookup } from 'node:dns/promises';
import { isIP } from 'node:net';

export const WELL_KNOWN_PATH = '/.well-known/poltergeist.txt';
/** A token shorter than this is refused, so an empty or trivial token can never match. */
export const MIN_TOKEN_LENGTH = 16;
const MAX_REDIRECTS = 3;
const MAX_BODY_CHARS = 4096;

export type AddressClass = 'loopback' | 'private' | 'metadata' | 'public';

export type OwnershipDecision = {
  allowed: boolean;
  /** `loopback` or `token` when allowed; null when refused. */
  method: 'loopback' | 'token' | null;
  /** `host:port` of the verified target. The browser must not leave it. */
  host: string;
  reason: string;
  addresses: string[];
};

export type OwnershipDeps = {
  /** Resolve a hostname to all of its IP addresses. */
  lookup?: (hostname: string) => Promise<string[]>;
  fetch?: typeof fetch;
  /** Receives one line per decision. */
  log?: (line: string) => void;
  timeoutMs?: number;
};

// ── Address classification ─────────────────────────────────────────────────────────────────────
function parseV4(s: string): number[] | null {
  const parts = s.split('.');
  if (parts.length !== 4) return null;
  const nums = parts.map((p) => (/^\d{1,3}$/.test(p) ? Number(p) : NaN));
  return nums.every((n) => n >= 0 && n <= 255) ? nums : null;
}

/** Parses an IPv6 literal (no brackets, no zone) to 16 bytes. */
function parseV6(input: string): number[] | null {
  let s = input;
  const pct = s.indexOf('%');
  if (pct >= 0) s = s.slice(0, pct);
  let tail: number[] = [];
  const lastColon = s.lastIndexOf(':');
  if (s.includes('.')) {
    const v4 = parseV4(s.slice(lastColon + 1));
    if (!v4) return null;
    tail = v4;
    s = s.slice(0, lastColon + 1) + '0:0';
  }
  const halves = s.split('::');
  if (halves.length > 2) return null;
  const toGroups = (h: string) => (h === '' ? [] : h.split(':'));
  const head = toGroups(halves[0]!);
  const rest = halves.length === 2 ? toGroups(halves[1]!) : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill('0'), ...rest];
  if (groups.length !== 8 || !groups.every((g) => /^[0-9a-f]{1,4}$/i.test(g))) return null;
  const bytes = groups.flatMap((g) => {
    const n = parseInt(g, 16);
    return [n >> 8, n & 0xff];
  });
  if (tail.length === 4) bytes.splice(12, 4, ...tail);
  return bytes;
}

function classifyV4(b: number[]): AddressClass {
  const [a, c] = [b[0]!, b[1]!];
  // Cloud metadata endpoints first: they must be named as such even though they are also link-local.
  if (a === 169 && c === 254 && b[2] === 169 && b[3] === 254) return 'metadata'; // AWS, GCP, Azure
  if (a === 100 && c === 100 && b[2] === 100 && b[3] === 200) return 'metadata'; // Alibaba
  if (a === 192 && c === 0 && b[2] === 0 && b[3] === 192) return 'metadata'; // Oracle
  if (a === 127) return 'loopback';
  if (a === 0 || a === 10) return 'private';
  if (a === 172 && c >= 16 && c <= 31) return 'private';
  if (a === 192 && c === 168) return 'private';
  if (a === 169 && c === 254) return 'private'; // link-local
  if (a === 100 && c >= 64 && c <= 127) return 'private'; // carrier-grade NAT
  if (a === 192 && c === 0 && b[2] === 0) return 'private'; // IETF protocol assignments
  if (a >= 224) return 'private'; // multicast, reserved, broadcast
  return 'public';
}

function classifyV6(b: number[]): AddressClass {
  const isZero = (from: number, to: number) => b.slice(from, to).every((x) => x === 0);
  if (isZero(0, 15) && b[15] === 1) return 'loopback'; // ::1
  if (isZero(0, 16)) return 'private'; // ::
  // IPv4-mapped (::ffff:a.b.c.d), IPv4-compatible (::a.b.c.d) and NAT64 (64:ff9b::/96) embed an IPv4 address.
  const mapped = isZero(0, 10) && b[10] === 0xff && b[11] === 0xff;
  const compat = isZero(0, 12);
  const nat64 = b[0] === 0 && b[1] === 0x64 && b[2] === 0xff && b[3] === 0x9b && isZero(4, 12);
  if (mapped || compat || nat64) return classifyV4(b.slice(12, 16));
  if (b[0] === 0xfd && b[1] === 0x00 && b[2] === 0x0e && b[3] === 0xc2 && isZero(4, 14) && b[14] === 0x02 && b[15] === 0x54) {
    return 'metadata'; // fd00:ec2::254 (AWS)
  }
  if ((b[0]! & 0xfe) === 0xfc) return 'private'; // fc00::/7 unique local
  if (b[0] === 0xfe && (b[1]! & 0xc0) === 0x80) return 'private'; // fe80::/10 link-local
  if (b[0] === 0xff) return 'private'; // multicast
  return 'public';
}

/** Classifies an IP literal. Anything that does not parse is treated as private (refused). */
export function classifyAddress(ip: string): AddressClass {
  const bare = ip.replace(/^\[|\]$/g, '');
  const family = isIP(bare);
  if (family === 4) {
    const b = parseV4(bare);
    return b ? classifyV4(b) : 'private';
  }
  if (family === 6) {
    const b = parseV6(bare);
    return b ? classifyV6(b) : 'private';
  }
  return 'private';
}

async function defaultLookup(hostname: string): Promise<string[]> {
  const rows = await dnsLookup(hostname, { all: true, verbatim: true });
  return rows.map((r) => r.address);
}

// ── The gate ───────────────────────────────────────────────────────────────────────────────────
/**
 * Decides whether `rawUrl` may be acted on. Never throws; a failure to decide is a refusal.
 * `token` is the per-run token the CLI generated and printed.
 */
export async function assertOwnership(
  rawUrl: string,
  token: string,
  deps: OwnershipDeps = {},
): Promise<OwnershipDecision> {
  const log = deps.log ?? (() => {});
  const finish = (d: OwnershipDecision): OwnershipDecision => {
    log(`ownership: ${d.allowed ? 'ALLOWED' : 'REFUSED'} ${d.host || rawUrl} (${d.method ?? 'none'}): ${d.reason}`);
    return d;
  };
  const refuse = (host: string, reason: string, addresses: string[] = []) =>
    finish({ allowed: false, method: null, host, reason, addresses });

  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return refuse('', 'not a valid URL');
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return refuse(url.host, `unsupported scheme ${url.protocol}`);
  if (url.username || url.password) return refuse(url.host, 'credentials in the URL are not allowed');

  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  let addresses: string[];
  try {
    addresses = isIP(hostname) ? [hostname] : await (deps.lookup ?? defaultLookup)(hostname);
  } catch {
    return refuse(url.host, 'host did not resolve');
  }
  if (addresses.length === 0) return refuse(url.host, 'host did not resolve');

  const classes = addresses.map(classifyAddress);
  const metadata = classes.indexOf('metadata');
  if (metadata >= 0) return refuse(url.host, `cloud-metadata address ${addresses[metadata]}`, addresses);
  const priv = classes.indexOf('private');
  if (priv >= 0) return refuse(url.host, `private-range address ${addresses[priv]}`, addresses);
  if (classes.every((c) => c === 'loopback')) {
    return finish({ allowed: true, method: 'loopback', host: url.host, reason: 'host resolves only to loopback', addresses });
  }
  if (classes.includes('loopback')) {
    return refuse(url.host, 'host resolves to both loopback and public addresses', addresses);
  }

  // Public host: the operator must have placed this run's token on the site.
  if (token.length < MIN_TOKEN_LENGTH) return refuse(url.host, 'ownership token is missing or too short', addresses);
  if (url.protocol !== 'https:') return refuse(url.host, 'a non-loopback target must be https', addresses);

  const doFetch = deps.fetch ?? fetch;
  let current = new URL(WELL_KNOWN_PATH, url.origin);
  try {
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      const res = await doFetch(current, {
        redirect: 'manual',
        signal: AbortSignal.timeout(deps.timeoutMs ?? 5000),
        headers: { accept: 'text/plain' },
      });
      if (res.status >= 300 && res.status < 400) {
        const loc = res.headers.get('location');
        let next: URL | null = null;
        try {
          next = loc ? new URL(loc, current) : null;
        } catch {
          next = null;
        }
        if (!next) return refuse(url.host, 'redirect with no usable location', addresses);
        if (next.host !== url.host || next.protocol !== 'https:') {
          return refuse(url.host, `redirect leaves the verified host (to ${next.host})`, addresses);
        }
        current = next;
        continue;
      }
      if (res.status !== 200) return refuse(url.host, `${WELL_KNOWN_PATH} returned HTTP ${res.status}`, addresses);
      const body = (await res.text()).slice(0, MAX_BODY_CHARS);
      if (!body.includes(token)) return refuse(url.host, `${WELL_KNOWN_PATH} does not contain this run's token`, addresses);
      return finish({ allowed: true, method: 'token', host: url.host, reason: 'ownership token found', addresses });
    }
    return refuse(url.host, 'too many redirects', addresses);
  } catch {
    return refuse(url.host, `could not fetch ${WELL_KNOWN_PATH}`, addresses);
  }
}
