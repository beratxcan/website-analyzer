# Authentication and Ownership Design

## Problem

The product must establish real user identity and enforce that every project,
website, analysis, run, finding and report belongs to exactly one user. The
mechanism needs to be secure against the common web threats (token theft, replay,
cross-site attacks, user enumeration) while remaining simple enough for a
modular monolith, and it must never leak one user's data to another even when
identifiers are guessed.

## Context

- The dashboard is a browser app talking to a separate API origin.
- The API is sessionful in the UX sense but should be stateless for access
  checks so it can scale horizontally.
- Refresh sessions must be revocable (logout, rotation, compromise).
- The product is a portfolio-grade application; the design should reflect
  production practice without introducing an external identity provider.

## Alternatives Considered

1. **Access tokens in `localStorage` with `Authorization` headers.** Simple for
   SPAs, but vulnerable to token exfiltration via cross-site scripting and
   awkward for server-side rendering.
2. **Server-side sessions in Redis keyed by a session cookie.** Straightforward
   revocation, but makes a request-time dependency on Redis for every
   authenticated call and complicates the "stateless access check" property.
3. **Third-party identity provider (OAuth/OIDC).** Strong security posture, but
   adds an external dependency and configuration burden disproportionate to the
   product's needs, and would hide the authentication design rather than
   demonstrate it.
4. **Cookie-based sessions with a short-lived access token plus a rotating
   opaque refresh token (chosen).**

## Chosen Solution

Authentication uses two cookies, both `HttpOnly`, `SameSite=Lax` and `Secure`
in production:

- **Access token** — a short-lived JWT signed with `JWT_ACCESS_SECRET`. It
  carries the subject and email and is verified on every request. It is never
  readable by JavaScript.
- **Refresh token** — a long-lived opaque token (32 random bytes). Only its
  SHA-256 hash is persisted; the raw value lives solely in the cookie, is never
  logged, and is rotated on every use (the previous row is marked revoked).
  Logout revokes it.

Passwords are hashed with Argon2 and never returned by the API. Login returns a
generic `INVALID_CREDENTIALS` error for both unknown emails and wrong passwords,
reducing user enumeration. Registration rejects duplicate emails explicitly
because that already leaks existence by design.

**Ownership isolation** is enforced server-side on every resource access: queries
are scoped to the authenticated user's ownership chain, and a foreign identifier
resolves to **`404`, never `403`**. Returning `404` means an attacker cannot even
confirm that another user's resource exists.

Cross-site request forgery is mitigated by `SameSite=Lax` cookies, JSON-only
request bodies, a restricted CORS origin allowlist (never a wildcard, with
credentials enabled), and an origin/referer guard that rejects state-changing
requests from unlisted or `null` origins. Non-browser clients that omit those
headers are unaffected.

Authentication endpoints share a dedicated, fail-closed rate-limit budget so
credential stuffing is throttled even if other budgets degrade.

## Trade-offs

- Cookies require CORS and CSRF consideration that bearer tokens in headers
  would not; this is exchanged for XSS resilience, which is the more common and
  more damaging failure mode.
- `SameSite=Lax` blocks cookies on cross-site POSTs but still allows top-level
  navigations; the origin guard covers the remaining state-changing surface.
- The access and refresh secrets are symmetric and must be strong in production;
  the configuration validates that they are neither development defaults nor
  shorter than 32 characters when `NODE_ENV=production`.
- Refresh rotation invalidates the previous token immediately, which is correct
  but means concurrent refreshes from multiple tabs can race; clients refresh a
  single session rather than forking it.

## Future Evolution

- A CSRF token layer can be added on top of the origin guard if the threat model
  requires defense from non-browser-adjacent vectors.
- Access-token revocation (a denylist) is unnecessary while access tokens are
  short-lived; it would be introduced only if the TTL grew.
- Multi-factor authentication and role-based access would extend the `User`
  model without changing the ownership model.

See also [../architecture/database-design.md](../architecture/database-design.md)
for the ownership chain and [../architecture/system-overview.md](../architecture/system-overview.md)
for the request flow.
