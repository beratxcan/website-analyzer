import { describe, expect, it } from 'vitest';
import {
  isBlockedHostname,
  validateIpAddress,
  validateUrlForFetch,
} from '../src/fetcher/ssrf';
import { FetcherError } from '../src/fetcher/errors';

const BLOCKED_IPV4 = [
  '0.0.0.0',
  '10.0.0.1',
  '10.255.255.255',
  '127.0.0.1',
  '127.8.8.8',
  '169.254.1.1',
  '172.16.0.1',
  '172.31.255.254',
  '192.168.1.1',
  '100.64.0.1',
  '100.127.255.255',
  '192.0.0.1',
  '192.0.2.1',
  '198.18.0.1',
  '198.19.255.255',
  '198.51.100.1',
  '203.0.113.1',
  '224.0.0.1',
  '239.255.255.255',
  '240.0.0.1',
  '255.255.255.255',
];

const ALLOWED_IPV4 = ['8.8.8.8', '93.184.216.34', '1.1.1.1', '172.32.0.1', '100.128.0.1', '192.0.3.1', '198.20.0.1', '203.0.114.1'];

const BLOCKED_IPV6 = [
  '::',
  '::1',
  '::ffff:10.0.0.1',
  '::ffff:127.0.0.1',
  '::ffff:192.168.1.1',
  // Hex-form IPv4-mapped and IPv4-compatible notations must not bypass the
  // dotted-quad checks (these are the representations that slip past naive
  // string matching).
  '::ffff:7f00:1',
  '::ffff:a00:1',
  '::ffff:c0a8:101',
  '0:0:0:0:0:ffff:7f00:1',
  '::7f00:1',
  '::a00:1',
  '64:ff9b::1',
  '64:ff9b:1::1',
  'fc00::1',
  'fd12:3456::1',
  'fe80::1',
  'febf::1',
  'ff00::1',
  'ff02::1',
  '100::1',
  '2002::1',
  '2001:db8::1',
  '2001:2::1',
  '2001:10::1',
  '2001:20::1',
];

const ALLOWED_IPV6 = [
  '2606:2800:220:1::1',
  '2001:4860:4860::8888',
  '::ffff:8.8.8.8',
  '::ffff:808:808',
];

describe('validateIpAddress', () => {
  it.each(BLOCKED_IPV4)('blocks private/reserved IPv4 %s', (ip) => {
    const result = validateIpAddress(ip);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it.each(ALLOWED_IPV4)('allows public IPv4 %s', (ip) => {
    expect(validateIpAddress(ip).allowed).toBe(true);
  });

  it.each(BLOCKED_IPV6)('blocks private/reserved IPv6 %s', (ip) => {
    const result = validateIpAddress(ip);
    expect(result.allowed).toBe(false);
    expect(result.reason).toBeDefined();
  });

  it.each(ALLOWED_IPV6)('allows public IPv6 %s', (ip) => {
    expect(validateIpAddress(ip).allowed).toBe(true);
  });

  it('rejects non-IP input', () => {
    expect(validateIpAddress('not-an-ip').allowed).toBe(false);
  });
});

describe('isBlockedHostname', () => {
  it.each([
    'localhost',
    'LOCALHOST',
    'localhost.',
    'foo.localhost',
    'bar.local',
    '0',
    '2130706433',
    '0x7f000001',
    'metadata.google.internal',
    'foo.internal',
    'printer.localdomain',
    'abcdefghijklmnop.onion',
    'instance-data',
    'metadata',
    'router.home.arpa',
  ])('blocks hostname %s', (hostname) => {
    expect(isBlockedHostname(hostname)).toBe(true);
  });

  it.each(['example.com', 'sub.example.com', 'api.github.com'])('allows hostname %s', (hostname) => {
    expect(isBlockedHostname(hostname)).toBe(false);
  });
});

describe('validateUrlForFetch', () => {
  const lookup = async () => [{ address: '93.184.216.34', family: 4 }];

  it('accepts a valid public HTTPS URL', async () => {
    const url = await validateUrlForFetch('https://example.com/page', lookup);
    expect(url.toString()).toBe('https://example.com/page');
  });

  it('rejects non-HTTP(S) protocols', async () => {
    for (const raw of ['ftp://example.com/file', 'file:///etc/passwd', 'javascript:alert(1)', 'gopher://example.com']) {
      await expect(validateUrlForFetch(raw, lookup)).rejects.toMatchObject({ code: 'UNSUPPORTED_PROTOCOL' });
    }
  });

  it('rejects URLs with credentials', async () => {
    await expect(validateUrlForFetch('https://user:pass@example.com/', lookup)).rejects.toMatchObject({
      code: 'URL_CREDENTIALS',
    });
  });

  it('rejects malformed URLs', async () => {
    await expect(validateUrlForFetch('not a url', lookup)).rejects.toMatchObject({ code: 'INVALID_URL' });
    await expect(validateUrlForFetch('http://', lookup)).rejects.toMatchObject({ code: 'INVALID_URL' });
  });

  it('rejects localhost hostnames without DNS lookup', async () => {
    let lookedUp = false;
    const trackingLookup = async () => {
      lookedUp = true;
      return [{ address: '93.184.216.34', family: 4 }];
    };
    await expect(validateUrlForFetch('http://localhost:8080/', trackingLookup)).rejects.toMatchObject({
      code: 'HOSTNAME_BLOCKED',
    });
    expect(lookedUp).toBe(false);
  });

  it('rejects private IPv4 literals without DNS lookup', async () => {
    await expect(validateUrlForFetch('http://10.0.0.1/', lookup)).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(validateUrlForFetch('http://127.0.0.1/', lookup)).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(validateUrlForFetch('http://192.168.1.10/', lookup)).rejects.toMatchObject({
      code: 'PRIVATE_IP_BLOCKED',
    });
  });

  it('rejects private IPv6 literals', async () => {
    await expect(validateUrlForFetch('http://[::1]/', lookup)).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(validateUrlForFetch('http://[fc00::1]/', lookup)).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
    await expect(validateUrlForFetch('http://[fe80::1]/', lookup)).rejects.toMatchObject({ code: 'PRIVATE_IP_BLOCKED' });
  });

  it('rejects hostnames resolving to private addresses', async () => {
    const privateResolver = async () => [{ address: '192.168.1.5', family: 4 }];
    await expect(validateUrlForFetch('http://internal.example.com/', privateResolver)).rejects.toMatchObject({
      code: 'PRIVATE_IP_BLOCKED',
    });
  });

  it('rejects hostnames resolving to any blocked address in a mixed set', async () => {
    const mixedResolver = async () => [
      { address: '93.184.216.34', family: 4 },
      { address: '10.0.0.1', family: 4 },
    ];
    await expect(validateUrlForFetch('http://mixed.example.com/', mixedResolver)).rejects.toMatchObject({
      code: 'PRIVATE_IP_BLOCKED',
    });
  });

  it('rejects hostnames resolving to blocked IPv6', async () => {
    const v6Resolver = async () => [{ address: 'fe80::1', family: 6 }];
    await expect(validateUrlForFetch('http://v6.example.com/', v6Resolver)).rejects.toMatchObject({
      code: 'PRIVATE_IP_BLOCKED',
    });
  });

  it('accepts hostnames resolving to public IPv6', async () => {
    const v6Resolver = async () => [{ address: '2606:2800:220:1::1', family: 6 }];
    const url = await validateUrlForFetch('http://v6.example.com/', v6Resolver);
    expect(url.hostname).toBe('v6.example.com');
  });

  it('reports DNS resolution failures', async () => {
    const failingResolver = async () => {
      throw new Error('ENOTFOUND');
    };
    await expect(validateUrlForFetch('http://nowhere.invalid/', failingResolver)).rejects.toMatchObject({
      code: 'DNS_RESOLUTION_FAILED',
    });
    await expect(validateUrlForFetch('http://empty.invalid/', async () => [])).rejects.toMatchObject({
      code: 'DNS_RESOLUTION_FAILED',
    });
  });

  it('rejects encoded/aliased IPv4 representations (URL normalization still lands on a blocked literal)', async () => {
    for (const raw of [
      'http://2130706433/',
      'http://0x7f000001/',
      'http://127.1/',
      'http://0177.0.0.1/',
      'http://[::ffff:7f00:1]/',
      'http://[::ffff:127.0.0.1]/',
      'http://[::ffff:a00:1]/',
    ]) {
      await expect(validateUrlForFetch(raw, lookup)).rejects.toMatchObject({
        code: 'PRIVATE_IP_BLOCKED',
      });
    }
  });

  it('rejects cloud metadata and internal hostnames before DNS resolution', async () => {
    let lookedUp = false;
    const trackingLookup = async () => {
      lookedUp = true;
      return [{ address: '93.184.216.34', family: 4 }];
    };
    for (const raw of ['http://metadata.google.internal/', 'http://foo.internal/', 'http://x.onion/']) {
      await expect(validateUrlForFetch(raw, trackingLookup)).rejects.toMatchObject({
        code: 'HOSTNAME_BLOCKED',
      });
    }
    expect(lookedUp).toBe(false);
  });

  it('throws typed FetcherError instances', async () => {
    try {
      await validateUrlForFetch('http://10.0.0.1/', lookup);
      expect.unreachable('should have thrown');
    } catch (error) {
      expect(error).toBeInstanceOf(FetcherError);
      expect((error as FetcherError).code).toBe('PRIVATE_IP_BLOCKED');
    }
  });
});