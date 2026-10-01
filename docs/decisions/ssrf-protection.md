# SSRF Protection Design

## Problem

The core capability of the product is fetching a URL that a user supplies. That
makes the fetcher the most security-sensitive component in the system: an
attacker who controls the target URL can try to make the server issue requests
to places it should not reach — internal services, cloud metadata endpoints, or
the local network. This class of attack is Server-Side Request Forgery (SSRF),
and it must be prevented without breaking the legitimate use case of analyzing
public websites.

## Context

- The fetcher runs in the worker, which has network access to internal
  infrastructure (PostgreSQL, Redis) and, in a cloud deployment, to an instance
  metadata service.
- Users can enter arbitrary URLs; nothing about the string can be trusted.
- Redirects are common on real websites and are a classic bypass vector if only
  the initial URL is validated.
- DNS resolution is attacker-influenceable (DNS rebinding), so validating a
  hostname once is not sufficient.

## Alternatives Considered

1. **Blocklist of known-bad strings.** Trivially bypassed by alternate IP
   encodings, redirects and DNS tricks; provides a false sense of safety.
2. **Egress network policy only (firewall / proxy).** A real defense in depth,
   but it is environment-specific and would leave the application vulnerable on
   any deployment that lacks it; the application must protect itself regardless.
3. **A third-party URL-safety API.** Adds an external dependency and latency to
   every fetch, and still needs in-app checks for the redirect and resolution
   cases.
4. **Layered validation in the fetcher itself, applied at every step (chosen).**

## Chosen Solution

Protection is layered so that any single mistake does not open a hole. Each layer
is validated against the others:

- **Scheme allowlist.** Only `http://` and `https://` are accepted; `file:`,
  `ftp:`, `data:`, `javascript:`, `gopher:`, `ws:`/`wss:` and similar schemes are
  rejected.
- **Credential rejection.** URLs with embedded credentials (`user:password@host`)
  are refused.
- **Hostname blocklist.** Internal and metadata hostnames — `localhost`,
  `*.local`, `*.internal`, `*.home.arpa`, `*.onion`, `instance-data`, `metadata`
  and similar — are rejected before resolution.
- **Address-range validation.** Every address a hostname resolves to is checked
  against the ranges that must never be fetched: loopback, private (`10/8`,
  `172.16/12`, `192.168/16`), link-local, CGNAT, reserved, multicast,
  documentation, NAT64 and IPv4-mapped ranges. IPv6 is expanded to hextets
  before inspection so that hex-form IPv4-mapped addresses (for example a mapped
  loopback written in hexadecimal) cannot slip past dotted-quad rules.
- **Two-sided DNS validation.** If a hostname resolves to a mix of allowed and
  blocked addresses, the request is rejected outright, and the socket-level
  lookup additionally filters blocked addresses so a rebinding answer cannot be
  connected to between the pre-flight check and the connection.
- **Redirect re-validation.** Every redirect hop is re-validated as if it were a
  fresh request, so a redirect cannot carry the fetch into a blocked range.
- **Bounded resource use.** Connection timeout, total timeout, maximum redirects
  and maximum response size are validated configuration values (`FETCH_*`)
  rather than hardcoded constants, so security limits cannot silently drift and
  oversized responses cannot exhaust memory.

The protection is exercised by an automated test suite covering localhost and
loopback rejection, private and link-local ranges, private IPv6, local hostnames,
alternate IP encodings, credentials, unsupported schemes, redirect-to-private,
redirect-limit exhaustion, oversized responses and timeouts.

## Trade-offs

- Aggressive address validation can reject legitimate targets that share
  infrastructure with blocked ranges; this is accepted as the safe default.
- Re-validating each redirect hop and resolution adds a small amount of latency
  per fetch; negligible relative to the fetch itself.
- The fetcher depends on the system resolver and the platform's IP parser, so
  the address checks must be kept in step with the engine's IPv6 handling.
- The limits are configuration, so a misconfiguration can weaken them; the
  defaults are safe and validation bounds them.

## Future Evolution

- DNS resolution could be pinned to a validated address and the connection made
  to that address directly, eliminating the remaining rebinding window at the
  cost of more custom transport code.
- An egress proxy allowlist at the infrastructure layer would complement the
  in-app checks with a network-level guarantee.
- If redirect behavior is ever relaxed, the hop validation and cap must move with
  it in the same change.

See [../architecture/analysis-pipeline.md](../architecture/analysis-pipeline.md)
for where these checks sit in the pipeline.
