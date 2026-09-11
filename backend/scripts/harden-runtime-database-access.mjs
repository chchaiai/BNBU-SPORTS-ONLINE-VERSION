import process from 'node:process';

import pg from 'pg';

import { createStrictPgClientConfig } from './postgres-tls.mjs';

const { Client } = pg;
const ROLE_NAME = /^[a-z_][a-z0-9_]{0,62}$/;

function requiredEnvironment(name) {
  const value = process.env[name];
  if (typeof value !== 'string' || value.length === 0) {
    throw new Error(`${name} is required for database privilege hardening`);
  }
  return value;
}

function quotedRole(value) {
  if (!ROLE_NAME.test(value)) {
    throw new Error('POSTGRES_APP_USER must be a lowercase PostgreSQL identifier');
  }
  return `"${value}"`;
}

async function main() {
  const migrationDatabaseUrl = requiredEnvironment('MIGRATION_DATABASE_URL');
  const caFile = optionalText(process.env.TENCENTDB_CA_FILE);
  if (
    caFile === null &&
    (process.env.APP_ENV === 'staging' || process.env.APP_ENV === 'production')
  ) {
    throw new Error('TENCENTDB_CA_FILE is required for database privilege hardening');
  }
  const appRoleName = requiredEnvironment('POSTGRES_APP_USER');
  const appRole = quotedRole(appRoleName);
  const client = new Client(
    caFile === null
      ? { connectionString: migrationDatabaseUrl }
      : createStrictPgClientConfig(migrationDatabaseUrl, caFile),
  );
  await client.connect();

  try {
    await client.query('BEGIN');
    await client.query(
      `GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO ${appRole}`,
    );
    await client.query(
      `GRANT USAGE, SELECT, UPDATE ON ALL SEQUENCES IN SCHEMA public TO ${appRole}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO ${appRole}`,
    );
    await client.query(
      `ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT USAGE, SELECT, UPDATE ON SEQUENCES TO ${appRole}`,
    );
    await client.query(
      `REVOKE ALL PRIVILEGES ON TABLE public."_prisma_migrations" FROM ${appRole}`,
    );
    await client.query(`GRANT SELECT ON TABLE public."_prisma_migrations" TO ${appRole}`);

    const result = await client.query(
      `SELECT
         has_table_privilege($1, 'public._prisma_migrations', 'SELECT') AS can_select,
         has_table_privilege($1, 'public._prisma_migrations', 'INSERT') AS can_insert,
         has_table_privilege($1, 'public._prisma_migrations', 'UPDATE') AS can_update,
         has_table_privilege($1, 'public._prisma_migrations', 'DELETE') AS can_delete`,
      [appRoleName],
    );
    const privileges = result.rows[0];
    if (
      privileges?.can_select !== true ||
      privileges.can_insert !== false ||
      privileges.can_update !== false ||
      privileges.can_delete !== false
    ) {
      throw new Error('Runtime migration-table privileges do not satisfy the read-only invariant');
    }
    await client.query('COMMIT');
    process.stdout.write('Runtime database privileges hardened; migration history is read-only.\n');
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await client.end();
  }
}

function optionalText(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

main().catch((error) => {
  process.stderr.write(
    `Database privilege hardening failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
