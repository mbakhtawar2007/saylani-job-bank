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

/** `https://{s}.tile.example.org/{z}/{x}/{y}.png` → `https://*.tile.example.org` */
function originOf(url: string | undefined): string | null {
  const match = url?.match(/^https?:\/\/[^/]+/);
  return match ? match[0].replace('{s}', '*') : null;
}

const mapTiles = originOf(process.env.NEXT_PUBLIC_MAP_TILE_URL) ?? 'https://tile.openstreetmap.org';
// Browsers upload to and download from object storage directly, through presigned URLs.
const storage = originOf(process.env.S3_ENDPOINT);

const contentSecurityPolicy = [
  "default-src 'self'",
  // 'unsafe-inline': the theme script (layout.tsx) and Next's hydration scripts are inline
  // (no nonces yet — see Phase 4). 'unsafe-eval': only `next dev` needs it.
  `script-src 'self' 'unsafe-inline'${isProd ? '' : " 'unsafe-eval'"}`,
  "style-src 'self' 'unsafe-inline'",
  // images.unsplash.com: landing-page photos. data:/blob:: leaflet markers and previews.
  ['img-src', "'self'", 'data:', 'blob:', 'https://images.unsplash.com', mapTiles, storage]
    .filter(Boolean)
    .join(' '),
  // next/font/google bundles fonts at build time and serves them from 'self'.
  "font-src 'self' data:",
  // connect-src must include storage: document uploads PUT directly to presigned URLs.
  ['connect-src', "'self'", storage, isProd ? null : 'ws:'].filter(Boolean).join(' '),
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
].join('; ');

const securityHeaders = [
  { key: 'Content-Security-Policy', value: contentSecurityPolicy },
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
  // Lets a production build run alongside `next dev` without clobbering its .next folder.
  distDir: process.env.NEXT_DIST_DIR ?? '.next',
  poweredByHeader: false,
  // Workspace packages ship TypeScript source; Next compiles them.
  transpilePackages: ['@jobbank/db', '@jobbank/shared'],
  outputFileTracingRoot: repoRoot,
  env: { APP_VERSION: pkg.version },
  // Linting runs as its own turbo task (pnpm lint) and in CI; don't repeat it in builds.
  eslint: { ignoreDuringBuilds: true },
  // Evaluated at build time: build with the S3_ENDPOINT and map tile URL of the target environment.
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }];
  },
};

export default nextConfig;
