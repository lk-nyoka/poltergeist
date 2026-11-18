import { describe, expect, it, vi } from 'vitest';
import { assertOwnership, classifyAddress, WELL_KNOWN_PATH } from './ownership';

const TOKEN = 'pg-run-0123456789abcdef';

const res = (status: number, body = '', headers: Record<string, string> = {}) =>
  new Response(body, { status, headers });

/** A DNS stub: hostname → addresses. Unknown hosts do not resolve. */
const dns = (table: Record<string, string[]>) => async (h: string) => {
  const a = table[h];
  if (!a) throw new Error('ENOTFOUND');
  return a;
};

const noNetwork = () => {
  throw new Error('the gate must not fetch for this target');
};

describe('classifyAddress', () => {
  it.each([
    ['127.0.0.1', 'loopback'],
    ['127.255.255.254', 'loopback'],
    ['::1', 'loopback'],
    ['::ffff:127.0.0.1', 'loopback'],
    ['::ffff:7f00:1', 'loopback'],
    ['10.0.0.1', 'private'],
    ['172.16.0.1', 'private'],
    ['172.31.255.255', 'private'],
    ['192.168.1.1', 'private'],
    ['169.254.1.1', 'private'],
    ['100.64.0.1', 'private'],
    ['0.0.0.0', 'private'],
    ['fc00::1', 'private'],
    ['fd12:3456::1', 'private'],
    ['fe80::1', 'private'],
    ['::ffff:10.0.0.1', 'private'],
    ['169.254.169.254', 'metadata'],
    ['::ffff:169.254.169.254', 'metadata'],
    ['::ffff:a9fe:a9fe', 'metadata'],
    ['fd00:ec2::254', 'metadata'],
    ['100.100.100.200', 'metadata'],
    ['8.8.8.8', 'public'],
    ['172.32.0.1', 'public'],
    ['2606:4700:4700::1111', 'public'],
    ['not-an-ip', 'private'],
  ])('%s is %s', (ip, expected) => {
    expect(classifyAddress(ip)).toBe(expected);
  });
});

describe('assertOwnership: loopback', () => {
  it.each([
    'http://127.0.0.1:3000/',
    'http://127.5.6.7/',
    'http://[::1]:3000/',
    'http://localhost:3000/',
    'http://2130706433/', // decimal form of 127.0.0.1, normalised by the URL parser
    'http://127.1/',
  ])('allows %s with no token and no network', async (url) => {
    const d = await assertOwnership(url, '', { lookup: dns({ localhost: ['127.0.0.1', '::1'] }), fetch: noNetwork });
    expect(d.allowed).toBe(true);
    expect(d.method).toBe('loopback');
  });

  it('refuses a name that resolves to loopback and a public address', async () => {
    const d = await assertOwnership('https://mixed.example/', TOKEN, {
      lookup: dns({ 'mixed.example': ['127.0.0.1', '93.184.216.34'] }),
      fetch: noNetwork,
    });
    expect(d.allowed).toBe(false);
  });
});

describe('assertOwnership: token', () => {
  const lookup = dns({ 'shop.example': ['93.184.216.34'] });

  it('allows a public host serving the correct token', async () => {
    const fetchMock = vi.fn(async (_url: unknown) => res(200, `hello\n${TOKEN}\n`));
    const d = await assertOwnership('https://shop.example/some/page', TOKEN, { lookup, fetch: fetchMock as never });
    expect(d).toMatchObject({ allowed: true, method: 'token', host: 'shop.example' });
    expect(String(fetchMock.mock.calls[0]![0])).toBe(`https://shop.example${WELL_KNOWN_PATH}`);
  });

  it('refuses when the file is missing', async () => {
    const d = await assertOwnership('https://shop.example/', TOKEN, { lookup, fetch: (async () => res(404)) as never });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('404');
  });

  it('refuses when the token is wrong', async () => {
    const d = await assertOwnership('https://shop.example/', TOKEN, {
      lookup,
      fetch: (async () => res(200, 'pg-run-someone-elses-token')) as never,
    });
    expect(d.allowed).toBe(false);
  });

  it('refuses when the fetch fails or times out', async () => {
    const d = await assertOwnership('https://shop.example/', TOKEN, {
      lookup,
      fetch: (async () => {
        throw new Error('boom');
      }) as never,
    });
    expect(d.allowed).toBe(false);
  });

  it('refuses an empty or short token even if the file is empty', async () => {
    for (const t of ['', 'short']) {
      const d = await assertOwnership('https://shop.example/', t, { lookup, fetch: (async () => res(200, '')) as never });
      expect(d.allowed).toBe(false);
    }
  });

  it('refuses plain http for a non-loopback host', async () => {
    const d = await assertOwnership('http://shop.example/', TOKEN, { lookup, fetch: noNetwork });
    expect(d.allowed).toBe(false);
  });

  it('refuses a host that does not resolve', async () => {
    const d = await assertOwnership('https://nope.example/', TOKEN, { lookup, fetch: noNetwork });
    expect(d.allowed).toBe(false);
  });

  it.each(['ftp://shop.example/', 'file:///etc/passwd', 'javascript:alert(1)', 'not a url', 'https://user:pw@shop.example/'])(
    'refuses %s',
    async (url) => {
      const d = await assertOwnership(url, TOKEN, { lookup, fetch: noNetwork });
      expect(d.allowed).toBe(false);
    },
  );
});

describe('assertOwnership: private and metadata addresses', () => {
  it.each([
    'http://10.0.0.5/',
    'https://192.168.0.10/',
    'https://172.20.1.1/',
    'https://169.254.169.254/latest/meta-data/',
    'https://[fd00:ec2::254]/',
    'https://[fe80::1]/',
    'https://[::ffff:169.254.169.254]/',
    'https://0.0.0.0/',
  ])('refuses %s even though the file would contain the token', async (url) => {
    const d = await assertOwnership(url, TOKEN, { lookup: dns({}), fetch: noNetwork });
    expect(d.allowed).toBe(false);
  });

  it('refuses a public-looking name that resolves to a private address (DNS pointing inward)', async () => {
    const d = await assertOwnership('https://evil.example/', TOKEN, {
      lookup: dns({ 'evil.example': ['10.1.2.3'] }),
      fetch: noNetwork,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('private');
  });

  it('refuses a name that resolves to the metadata address and says so', async () => {
    const d = await assertOwnership('https://evil.example/', TOKEN, {
      lookup: dns({ 'evil.example': ['169.254.169.254'] }),
      fetch: noNetwork,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('metadata');
  });

  it('refuses when any one resolved address is private', async () => {
    const d = await assertOwnership('https://rebind.example/', TOKEN, {
      lookup: dns({ 'rebind.example': ['93.184.216.34', '192.168.1.1'] }),
      fetch: noNetwork,
    });
    expect(d.allowed).toBe(false);
  });
});

describe('assertOwnership: redirects', () => {
  const lookup = dns({ 'shop.example': ['93.184.216.34'] });

  it('refuses a redirect to another host, without following it', async () => {
    const fetchMock = vi.fn(async (_url: unknown) => res(302, '', { location: 'https://other.example/.well-known/poltergeist.txt' }));
    const d = await assertOwnership('https://shop.example/', TOKEN, { lookup, fetch: fetchMock as never });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('leaves the verified host');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('refuses a redirect to a private IP', async () => {
    const d = await assertOwnership('https://shop.example/', TOKEN, {
      lookup,
      fetch: (async () => res(301, '', { location: 'https://169.254.169.254/' })) as never,
    });
    expect(d.allowed).toBe(false);
  });

  it('refuses a downgrade redirect to http on the same host', async () => {
    const d = await assertOwnership('https://shop.example/', TOKEN, {
      lookup,
      fetch: (async () => res(302, '', { location: 'http://shop.example/x' })) as never,
    });
    expect(d.allowed).toBe(false);
  });

  it('follows a same-host redirect and accepts the token there', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(res(302, '', { location: '/real/poltergeist.txt' }))
      .mockResolvedValueOnce(res(200, TOKEN));
    const d = await assertOwnership('https://shop.example/', TOKEN, { lookup, fetch: fetchMock as never });
    expect(d.allowed).toBe(true);
    expect(String(fetchMock.mock.calls[1]![0])).toBe('https://shop.example/real/poltergeist.txt');
  });

  it('refuses a same-host redirect loop', async () => {
    const d = await assertOwnership('https://shop.example/', TOKEN, {
      lookup,
      fetch: (async () => res(302, '', { location: '/again' })) as never,
    });
    expect(d.allowed).toBe(false);
    expect(d.reason).toContain('too many redirects');
  });

  it('refuses a redirect with no location', async () => {
    const d = await assertOwnership('https://shop.example/', TOKEN, { lookup, fetch: (async () => res(302)) as never });
    expect(d.allowed).toBe(false);
  });
});

describe('assertOwnership: logging', () => {
  it('logs one line per decision, allowed or refused', async () => {
    const log = vi.fn();
    await assertOwnership('http://127.0.0.1:3000/', '', { log });
    await assertOwnership('https://10.0.0.1/', TOKEN, { log });
    expect(log).toHaveBeenCalledTimes(2);
    expect(log.mock.calls[0]![0]).toContain('ALLOWED');
    expect(log.mock.calls[1]![0]).toContain('REFUSED');
  });
});
