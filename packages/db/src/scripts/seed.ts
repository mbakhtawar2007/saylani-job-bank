import { sql } from 'drizzle-orm';
import { fileURLToPath } from 'node:url';
import { createDb, type Database } from '../client';
import { devData } from '../seed/dev-data';
import { masterDataSeed } from '../seed/master-data';
import { referenceData } from '../seed/reference-data';
import { loadRootEnv, requireEnv } from './env';

/**
 * A seed step must be idempotent (safe to run repeatedly). Modules append their
 * steps to the list below in dependency order (branches → users → master data → …).
 */
export interface SeedStep {
  name: string;
  run: (db: Database) => Promise<void>;
}

// Dev accounts (seeded branches/users with the shared SEED_DEV_PASSWORD) are
// OPT-IN: they are included only when SEED_DEV_DATA=true (or the caller passes
// includeDevData explicitly). They used to be seeded by default in every
// non-production run, which meant any `pnpm db:seed` created sign-in accounts
// with a shared password unless the operator remembered to opt out.
function seedSteps(includeDevData: boolean): SeedStep[] {
  return [referenceData, masterDataSeed, ...(includeDevData ? [devData] : [])];
}

async function assertDatabaseReady(db: Database): Promise<void> {
  const [row] = await db.execute<{ postgis: string }>(sql`SELECT postgis_lib_version() AS postgis`);
  console.info(`• PostGIS ${row?.postgis} available`);
}

export async function runSeed(url: string, options?: { includeDevData?: boolean }): Promise<void> {
  const { db, client } = createDb(url, { max: 1, applicationName: 'jobbank-seed' });
  const steps = seedSteps(options?.includeDevData ?? process.env.SEED_DEV_DATA === 'true');
  try {
    await assertDatabaseReady(db);
    for (const step of steps) {
      await step.run(db);
      console.info(`• seeded ${step.name}`);
    }
    console.info(`✔ seed complete (${steps.length} steps)`);
  } finally {
    await client.end();
  }
}

const isEntrypoint = process.argv[1] === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  loadRootEnv();
  runSeed(requireEnv('DATABASE_MIGRATOR_URL')).catch((error: unknown) => {
    console.error('✘ seed failed:', error);
    process.exit(1);
  });
}
