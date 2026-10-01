import { isIP } from 'node:net';
import { FetcherError } from './errors';

export type IpBlockReason =
  | 'loopback'
  | 'private'
  | 'link-local'
  | 'reserved'
  | 'multicast'
  | 'unspecified'
  | 'documentation'
  | 'nat64'
  | 'ipv4-mapped';

export interface IpValidation {
  allowed: boolean;
  reason?: IpBlockReason;
}

export interface ResolvedAddress {
  address: string;
  family: number;
}

/** Resolves a hostname to its addresses (default: system DNS). */
export type LookupFn = (hostname: string, options: Record<string, unknown>) => Promise<ResolvedAddress[]>;

/**
 * Validates a single IP address against ranges that must never be fetched:
 * loopback, private, link-local, reserved, multicast, documentation, NAT64
 * and IPv4-mapped addresses carrying a blocked embedded address.
 */
export function validateIpAddress(ip: string): IpValidation {
  const family = isIP(ip);
  if (family === 4) {
    return validateIpv4(ip);
  }
  if (family === 6) {
    return validateIpv6(ip);
  }
  return { allowed: false, reason: 'reserved' };
}

function blocked(reason: IpBlockReason): IpValidation {
  return { allowed: false, reason };
}

function validateIpv4(ip: string): IpValidation {
  const [aRaw, bRaw, cRaw] = ip.split('.');
  const a = Number(aRaw);
  const b = Number(bRaw);
  const c = Number(cRaw);

  if (a === 0) return blocked('reserved'); // 0.0.0.0/8
  if (a === 10) return blocked('private'); // 10.0.0.0/8
  if (a === 127) return blocked('loopback'); // 127.0.0.0/8
  if (a === 100 && b >= 64 && b <= 127) return blocked('reserved'); // 100.64.0.0/10 CGNAT
  if (a === 169 && b === 254) return blocked('link-local'); // 169.254.0.0/16
  if (a === 172 && b >= 16 && b <= 31) return blocked('private'); // 172.16.0.0/12
  if (a === 192 && b === 168) return blocked('private'); // 192.168.0.0/16
  if (a === 192 && b === 0 && c === 0) return blocked('reserved'); // 192.0.0.0/24
  if (a === 192 && b === 0 && c === 2) return blocked('documentation'); // 192.0.2.0/24 TEST-NET-1
  if (a === 192 && b === 88 && c === 99) return blocked('reserved'); // 192.88.99.0/24 6to4 relay
  if (a === 198 && (b === 18 || b === 19)) return blocked('reserved'); // 198.18.0.0/15
  if (a === 198 && b === 51 && c === 100) return blocked('documentation'); // 198.51.100.0/24 TEST-NET-2
  if (a === 203 && b === 0 && c === 113) return blocked('documentation'); // 203.0.113.0/24 TEST-NET-3
  if (a >= 224 && a <= 239) return blocked('multicast'); // 224.0.0.0/4
  if (a >= 240) return blocked('reserved'); // 240.0.0.0/4 + broadcast

  return { allowed: true };
}

/** Reads a 16-bit hextet without tripping `noUncheckedIndexedAccess`. */
function hextet(groups: readonly number[], index: number): number {
  return groups[index] ?? 0;
}

function allZero(groups: readonly number[]): boolean {
  return groups.every((group) => group === 0);
}

/**
 * Expands any accepted IPv6 notation (compressed, full, dotted-quad tail,
 * zone index) into eight 16-bit groups. Returns null for malformed input.
 *
 * Writing the checks on top of the expanded form is what makes hex-form
 * IPv4-mapped addresses (`::ffff:7f00:1`) impossible to smuggle past the
 * reviewer-only dotted form (`::ffff:127.0.0.1`).
 */
function expandIpv6(ip: string): number[] | null {
  let address = ip.toLowerCase();
  const zone = address.indexOf('%');
  if (zone !== -1) {
    address = address.slice(0, zone);
  }

  // Convert an embedded dotted-quad tail into hex groups.
  const lastColon = address.lastIndexOf(':');
  const tail = address.slice(lastColon + 1);
  if (tail.includes('.')) {
    const octets = tail.split('.').map((part) => Number(part));
    if (octets.length !== 4 || octets.some((value) => !Number.isInteger(value) || value < 0 || value > 255)) {
      return null;
    }
    const high = ((octets[0] ?? 0) << 8) | (octets[1] ?? 0);
    const low = ((octets[2] ?? 0) << 8) | (octets[3] ?? 0);
    address = `${address.slice(0, lastColon + 1)}${high.toString(16)}:${low.toString(16)}`;
  }

  const parseGroups = (segment: string): number[] | null => {
    if (segment === '') return [];
    const out: number[] = [];
    for (const group of segment.split(':')) {
      if (!/^[0-9a-f]{1,4}$/.test(group)) return null;
      out.push(parseInt(group, 16));
    }
    return out;
  };

  const halves = address.split('::');
  if (halves.length > 2) return null;

  const head = parseGroups(halves[0] ?? '');
  if (head === null) return null;

  if (halves.length === 1) {
    return head.length === 8 ? head : null;
  }

  const tailGroups = parseGroups(halves[1] ?? '');
  if (tailGroups === null) return null;

  const zeros = 8 - head.length - tailGroups.length;
  if (zeros < 1) return null;
  return [...head, ...new Array<number>(zeros).fill(0), ...tailGroups];
}

function validateIpv6(ip: string): IpValidation {
  const groups = expandIpv6(ip);
  if (groups === null || groups.length !== 8) {
    return blocked('reserved');
  }

  const g0 = hextet(groups, 0);
  const g1 = hextet(groups, 1);
  const g5 = hextet(groups, 5);
  const g6 = hextet(groups, 6);
  const g7 = hextet(groups, 7);

  if (allZero(groups)) {
    return blocked('unspecified'); // ::
  }
  if (allZero(groups.slice(0, 7)) && g7 === 1) {
    return blocked('loopback'); // ::1
  }

  const embeddedIpv4 = `${g6 >> 8}.${g6 & 0xff}.${g7 >> 8}.${g7 & 0xff}`;

  // IPv4-mapped: ::ffff:a.b.c.d (also written ::ffff:7f00:1).
  if (allZero(groups.slice(0, 5)) && g5 === 0xffff) {
    return validateIpv4(embeddedIpv4).allowed ? { allowed: true } : { allowed: false, reason: 'ipv4-mapped' };
  }

  // IPv4-compatible (deprecated): ::a.b.c.d — still routable on some stacks.
  if (allZero(groups.slice(0, 6))) {
    return validateIpv4(embeddedIpv4).allowed ? { allowed: true } : { allowed: false, reason: 'ipv4-mapped' };
  }

  if (g0 === 0x0064 && g1 === 0xff9b) return blocked('nat64'); // 64:ff9b::/96 + 64:ff9b:1::/48

  if ((g0 & 0xfe00) === 0xfc00) return blocked('private'); // fc00::/7 ULA
  if ((g0 & 0xffc0) === 0xfe80) return blocked('link-local'); // fe80::/10
  if ((g0 & 0xff00) === 0xff00) return blocked('multicast'); // ff00::/8

  if (g0 === 0x0100 && allZero(groups.slice(1, 4))) return blocked('reserved'); // 100::/64 discard
  if (g0 === 0x2002) return blocked('reserved'); // 2002::/16 6to4 (embeds IPv4)
  if (g0 === 0x2001 && g1 === 0x0db8) return blocked('documentation'); // 2001:db8::/32
  if (g0 === 0x2001 && g1 === 0x0002 && hextet(groups, 2) === 0) return blocked('reserved'); // 2001:2::/48
  if (g0 === 0x2001 && (g1 & 0xfff0) === 0x0010) return blocked('reserved'); // 2001:10::/28 ORCHID
  if (g0 === 0x2001 && (g1 & 0xfff0) === 0x0020) return blocked('reserved'); // 2001:20::/28 ORCHIDv2

  return { allowed: true };
}

/**
 * Hostnames that must never be fetched, independent of DNS resolution.
 * Cloud metadata endpoints and internal-only suffixes are the primary
 * targets here; numeric and hex hostnames can alias IP literals and are
 * also refused.
 */
export function isBlockedHostname(hostname: string): boolean {
  const lower = hostname.toLowerCase().replace(/\.$/, '');
  if (lower === 'localhost' || lower === '0') return true; // '0' is 0.0.0.0 shorthand
  if (lower.endsWith('.localhost')) return true;
  if (lower.endsWith('.local')) return true; // mDNS (RFC 6762)
  if (lower.endsWith('.internal')) return true; // cloud metadata (e.g. metadata.google.internal)
  if (lower.endsWith('.home.arpa')) return true; // residential networks (RFC 8375)
  if (lower.endsWith('.localdomain')) return true;
  if (lower.endsWith('.onion')) return true; // Tor
  if (lower === 'instance-data' || lower === 'metadata' || lower === 'metadata.google.internal') return true;
  if (/^\d+$/.test(lower)) return true; // numeric hostnames can alias IPs
  if (/^0x[0-9a-f]+$/i.test(lower)) return true; // hex IP aliases
  return false;
}

/**
 * Validates a target URL for fetching: protocol, credentials, hostname, and
 * (after DNS resolution) every resolved address. Used both for the initial
 * target and for every redirect target.
 */
export async function validateUrlForFetch(rawUrl: string, lookup: LookupFn): Promise<URL> {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    throw new FetcherError('INVALID_URL', `Malformed URL: ${rawUrl}`);
  }

  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new FetcherError('UNSUPPORTED_PROTOCOL', `Protocol "${url.protocol}" is not allowed`);
  }
  if (url.username !== '' || url.password !== '') {
    throw new FetcherError('URL_CREDENTIALS', 'URL must not contain credentials');
  }

  let hostname = url.hostname;
  if (hostname === '') {
    throw new FetcherError('INVALID_URL', 'URL must include a hostname');
  }
  // Node keeps the brackets on IPv6 literal hostnames; strip them for IP checks.
  if (hostname.startsWith('[') && hostname.endsWith(']')) {
    hostname = hostname.slice(1, -1);
  }

  const ipFamily = isIP(hostname);
  if (ipFamily !== 0) {
    const check = validateIpAddress(hostname);
    if (!check.allowed) {
      throw new FetcherError('PRIVATE_IP_BLOCKED', `Target address ${hostname} is blocked (${check.reason})`);
    }
    return url;
  }

  if (isBlockedHostname(hostname)) {
    throw new FetcherError('HOSTNAME_BLOCKED', `Hostname "${hostname}" is blocked`);
  }

  let addresses: ResolvedAddress[];
  try {
    addresses = await lookup(hostname, { all: true, verbatim: true });
  } catch {
    throw new FetcherError('DNS_RESOLUTION_FAILED', `Could not resolve hostname "${hostname}"`);
  }
  if (addresses.length === 0) {
    throw new FetcherError('DNS_RESOLUTION_FAILED', `Could not resolve hostname "${hostname}"`);
  }

  for (const { address } of addresses) {
    const check = validateIpAddress(address);
    if (!check.allowed) {
      throw new FetcherError(
        'PRIVATE_IP_BLOCKED',
        `Resolved address ${address} for "${hostname}" is blocked (${check.reason})`,
      );
    }
  }

  return url;
}
