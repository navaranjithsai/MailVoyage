/**
 * Container entrypoint for the MailVoyage API (production image).
 *
 * Runs database migrations (knex) and then starts the server. Everything
 * is precompiled: tsc compiles BOTH the app and the .ts migrations to
 * dist/ — so the image needs no ts-node/typescript at runtime, only knex
 * itself (copied into the image by the Dockerfile).
 *
 * FAILSAFE: if migrations fail, the process exits non-zero so the platform
 * (compose restart policy, Render, Railway, Fly, K8s) surfaces the error
 * loudly instead of silently serving an app with a missing schema.
 */
// knex is a CommonJS module — a named ESM import ({ knex }) throws at
// runtime even though tsc accepts it. Use the default import.
import knexDefault from 'knex';
import { fileURLToPath } from 'url';
import path from 'path';

const { knex } = knexDefault;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const connectionString = process.env.DATABASE_URL;

if (!connectionString) {
  console.error('[entrypoint] DATABASE_URL is not set — cannot run migrations.');
  process.exit(1);
}

console.info('[entrypoint] Running database migrations…');

// Compiled migrations live next to this file: dist/db/migrations/*.js
// (same relative layout as src/, and matching knexfile.ts's directory
// layout). knex 3 loads ESM migration files natively.
const migrationsDir = path.join(__dirname, 'db', 'migrations');

const db = knex({
  client: 'pg',
  connection: connectionString,
  migrations: {
    directory: migrationsDir,
    tableName: 'knex_migrations',
    // The image ships COMPILED .js migrations only — never load .ts sources.
    loadExtensions: ['.js'],
  },
});

try {
  const [batch, logs] = await db.migrate.latest();
  if (logs.length === 0) {
    console.info('[entrypoint] Migrations up to date — nothing to run.');
  } else {
    console.info(`[entrypoint] Applied ${logs.length} migration(s) (batch ${batch}):`);
    for (const name of logs) console.info(`  • ${name}`);
  }
  await db.destroy();
} catch (err) {
  console.error('[entrypoint] Migration failed:', err);
  await db.destroy().catch(() => {});
  process.exit(1);
}

console.info('[entrypoint] Starting MailVoyage API…');
await import('./index.js');
