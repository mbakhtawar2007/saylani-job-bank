import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadEnvConfig } from '@next/env';
import type { NextConfig } from 'next';
import pkg from './package.json' with { type: 'json' };

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '../..');

// One .env at the monorepo root serves the app, the db scripts and docker compose.
// forceReload: Next has already loaded (and cached) env from apps/web by this point.
loadEnvConfig(repoRoot, process.env.NODE_ENV !== 'production', console, true);

const isProd = process.env.NODE_ENV === 'production';

// Audit 2026-11-11 (M-20): the Content-Security-Policy is built per request
// in middleware (src/lib/http/csp.ts) because it carries a nonce —
// next.config headers are static and cannot hold one. The map-tile host and
// S3 endpoint it needs are read from env there, same as they were here.
const securityHeaders = [
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  // Geolocation stays on: the map pin picker offers "use my location".
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), payment=(), geolocation=(self)' },
  // Prod-only, no preload: HTTPS is not yet guaranteed on every deployment target.
  ...(isProd
    ? [{ key: 'Strict-Transport-Security', value: 'max-age=31536000; includeSubDomains' }]
    : []),
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Audit 2026-11-11 (L-37): the landing page's photos are Unsplash URLs
  // rendered with next/image; only this host is allowlisted.
  images: {
    remotePatterns: [{ protocol: 'https', hostname: 'images.unsplash.com' }],
  },
  // Lets a production build run alongside `next dev` without clobbering its .next folder.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@jobbank/db', '@jobbank/shared'],
  outputFileTracingRoot: repoRoot,
  env: { APP_VERSION: pkg.version },
  // No eslint.ignoreDuringBuilds: lint runs as part of the build, so a lint
  // error fails the build the same way it fails `pnpm lint` and CI.
  // Evaluated at build time: build with the S3_ENDPOINT and map tile URL of the target environment.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
