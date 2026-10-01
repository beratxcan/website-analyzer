import { join } from 'node:path';
import type { NextConfig } from 'next';

/**
 * The browser only ever talks to the API origin (cookies + credentialed
 * fetch), so `connect-src`/`img-src` stay as narrow as the app allows.
 */
function apiOrigin(): string {
  const raw = process.env.NEXT_PUBLIC_API_URL;
  if (!raw) {
    return 'http://localhost:4000';
  }
  try {
    return new URL(raw).origin;
  } catch {
    return 'http://localhost:4000';
  }
}

function contentSecurityPolicy(): string {
  const isDev = process.env.NODE_ENV !== 'production';
  const api = apiOrigin();
  const scriptSrc = isDev
    ? // React Refresh / Next dev server evaluate modules at runtime.
      `'self' 'unsafe-inline' 'unsafe-eval'`
    : `'self' 'unsafe-inline'`;
  return [
    "default-src 'self'",
    `script-src ${scriptSrc}`,
    // Tailwind and Next inject inline styles.
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    `connect-src 'self' ${api}`,
    "frame-ancestors 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
  ].join('; ');
}

// Standalone output is opt-in: it is what the Docker image ships, but it
// creates symlinks that plain `next build` on Windows cannot (EPERM), so local
// builds and CI stay on the default output.
const standalone = process.env.NEXT_OUTPUT_STANDALONE === 'true';

const nextConfig: NextConfig = {
  reactStrictMode: true,
  ...(standalone ? { output: 'standalone' as const } : {}),
  // pnpm workspace root: `next build` runs with the package as cwd.
  outputFileTracingRoot: join(process.cwd(), '..', '..'),
  poweredByHeader: false,
  async headers() {
    const isProduction = process.env.NODE_ENV === 'production';
    const securityHeaders = [
      { key: 'Content-Security-Policy', value: contentSecurityPolicy() },
      { key: 'X-Content-Type-Options', value: 'nosniff' },
      { key: 'X-Frame-Options', value: 'DENY' },
      { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      {
        key: 'Permissions-Policy',
        value: 'geolocation=(), microphone=(), camera=(), payment=()',
      },
      { key: 'Cross-Origin-Opener-Policy', value: 'same-origin' },
      ...(isProduction
        ? [
            {
              key: 'Strict-Transport-Security',
              value: 'max-age=31536000; includeSubDomains',
            },
          ]
        : []),
    ];
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;