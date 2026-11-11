import { existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import react from '@vitejs/plugin-react';
import { parse } from 'dotenv';
import { defineConfig } from 'vitest/config';

const alias = {
  '@': fileURLToPath(new URL('./src', import.meta.url)),
  'server-only': fileURLToPath(new URL('./src/test/server-only-stub.ts', import.meta.url)),
};

const rootEnvPath = fileURLToPath(new URL('../../.env', import.meta.url));
const rootEnv = existsSync(rootEnvPath) ? parse(readFileSync(rootEnvPath)) : {};
const withDatabase = (url: string | undefined, name: string) => {
  if (!url) return '';
  const parsed = new URL(url);
  parsed.pathname = `/${name}`;
  return parsed.toString();
};
const testDb = process.env.TEST_DATABASE_NAME ?? 'jobbank_test';
const testMigratorUrl =
  process.env.TEST_DATABASE_MIGRATOR_URL ??
  withDatabase(process.env.DATABASE_MIGRATOR_URL ?? rootEnv.DATABASE_MIGRATOR_URL, testDb);
const testRuntimeUrl = withDatabase(process.env.DATABASE_URL ?? rootEnv.DATABASE_URL, testDb);
// globalSetup runs in this (main) process, where `test.env` does not apply.
process.env.TEST_DATABASE_MIGRATOR_URL ??= testMigratorUrl;
// Same for the seed password: globalSetup seeds the test DB in this process,
// so test.env (workers only) never reaches it. Mirrors the URL line above.
process.env.SEED_DEV_PASSWORD ??= rootEnv.SEED_DEV_PASSWORD ?? '';

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          environment: 'node',
          include: ['src/**/*.test.ts'],
          exclude: ['src/**/*.integration.test.ts'],
          env: {
            SKIP_ENV_VALIDATION: '1',
            LOG_LEVEL: 'silent',
            // Audit 2026-11-11 (M-33): dummy test-only secret (≥32 chars) —
            // without it the OTP tests fail on a clean checkout because
            // getAuthSecret() throws. Never a real secret.
            BETTER_AUTH_SECRET: 'unit-test-secret-unit-test-secret-unit-test',
          },
        },
      },
      {
        plugins: [react()],
        resolve: { alias },
        test: {
          name: 'components',
          environment: 'jsdom',
          include: ['src/**/*.test.tsx'],
          setupFiles: ['./src/test/setup-dom.ts'],
          env: { SKIP_ENV_VALIDATION: '1', LOG_LEVEL: 'silent' },
        },
      },
      {
        resolve: { alias },
        test: {
          name: 'integration',
          environment: 'node',
          include: ['src/**/*.integration.test.ts'],
          globalSetup: ['./src/test/integration-setup.ts'],
          fileParallelism: false,
          testTimeout: 30_000,
          hookTimeout: 60_000,
          env: {
            ...rootEnv,
            ...process.env,
            NODE_ENV: 'test',
            LOG_LEVEL: 'silent',
            DATABASE_URL: testRuntimeUrl,
            TEST_DATABASE_MIGRATOR_URL: testMigratorUrl,
            BETTER_AUTH_SECRET: 'integration-test-secret-integration-test-secret',
            // Seed password for the test DB (from CI env or root .env). No default:
            // getSeedDevPassword() fails fast with instructions if it is missing.
            SEED_DEV_PASSWORD: process.env.SEED_DEV_PASSWORD ?? rootEnv.SEED_DEV_PASSWORD ?? '',
            REDIS_URL: '',
            MAIL_TRANSPORT: 'memory',
          },
        },
      },
    ],
  },
});
