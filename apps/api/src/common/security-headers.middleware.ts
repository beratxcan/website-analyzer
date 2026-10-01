import type { NextFunction, Request, Response } from 'express';

/**
 * The API only ever returns JSON (and PDF downloads), so the policy can be
 * maximally restrictive. `frame-ancestors`/`form-action` matter even here
 * because the PDF response can be rendered inline by some clients.
 */
const API_CONTENT_SECURITY_POLICY =
  "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'; sandbox";

const HSTS_VALUE = 'max-age=31536000; includeSubDomains';

export interface SecurityHeadersOptions {
  /** HSTS is only meaningful over HTTPS, so production enables it explicitly. */
  enableHsts: boolean;
  /**
   * Path prefix where the CSP must be skipped because the response is an HTML
   * application (the Swagger UI, which is development-only).
   */
  docsPrefix?: string;
}

/**
 * Sets defensive headers on every API response. HSTS is added only when the
 * deployment terminates TLS; CSP is skipped for the interactive docs page.
 */
export function securityHeadersMiddleware(options: SecurityHeadersOptions) {
  return function securityHeaders(request: Request, response: Response, next: NextFunction): void {
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('X-Frame-Options', 'DENY');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');
    response.setHeader('Cross-Origin-Opener-Policy', 'same-origin');
    response.setHeader('Cross-Origin-Resource-Policy', 'same-site');
    // Never advertise the framework.
    response.removeHeader('X-Powered-By');

    const isDocs = options.docsPrefix !== undefined && request.path.startsWith(options.docsPrefix);
    if (!isDocs) {
      response.setHeader('Content-Security-Policy', API_CONTENT_SECURITY_POLICY);
    }
    if (options.enableHsts) {
      response.setHeader('Strict-Transport-Security', HSTS_VALUE);
    }
    next();
  };
}
