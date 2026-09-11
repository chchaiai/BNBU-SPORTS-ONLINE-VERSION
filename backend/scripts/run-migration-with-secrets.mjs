import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import process from 'node:process';

import { loadFileJsonSecret } from './file-json-secret.mjs';
import { prepareStrictMigrationEnvironment } from './postgres-tls.mjs';

const MIGRATION_SECRET_KEYS = ['MIGRATION_DATABASE_URL'];

async function main() {
  const environment = { ...process.env };
  const provider = optionalText(environment.RUNTIME_SECRET_PROVIDER) ?? 'ENVIRONMENT';
  if (provider === 'FILE_JSON') {
    await loadFileJsonSecret({
      filePath: environment.MIGRATOR_SECRET_FILE,
      expectedKeys: MIGRATION_SECRET_KEYS,
      environment,
    });
  } else if (provider !== 'ENVIRONMENT') {
    throw new Error('RUNTIME_SECRET_PROVIDER must be ENVIRONMENT or FILE_JSON');
  } else if (environment.APP_ENV === 'staging' || environment.APP_ENV === 'production') {
    throw new Error(
      'RUNTIME_SECRET_PROVIDER must be FILE_JSON for staging and production migrations',
    );
  }

  required(environment.MIGRATION_DATABASE_URL, 'MIGRATION_DATABASE_URL');
  if (environment.APP_ENV === 'staging' || environment.APP_ENV === 'production') {
    prepareStrictMigrationEnvironment(environment);
  }
  await run(
    process.execPath,
    [resolve('node_modules/prisma/build/index.js'), 'migrate', 'deploy'],
    environment,
  );
  if (process.argv.includes('--harden')) {
    await run(
      process.execPath,
      [resolve('scripts/harden-runtime-database-access.mjs')],
      environment,
    );
  }
}

function run(command, arguments_, environment) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, arguments_, {
      cwd: process.cwd(),
      env: environment,
      shell: false,
      stdio: 'inherit',
      windowsHide: true,
    });
    child.once('error', reject);
    child.once('exit', (code, signal) => {
      if (code === 0) resolvePromise();
      else reject(new Error(`Migration command failed with status ${code ?? signal ?? 'unknown'}`));
    });
  });
}

function required(value, name) {
  if (optionalText(value) === null) throw new Error(`${name} is required`);
}

function optionalText(value) {
  return typeof value === 'string' && value.trim().length > 0 ? value.trim() : null;
}

main().catch((error) => {
  process.stderr.write(
    `Migration bootstrap failed: ${error instanceof Error ? error.message : 'unknown error'}\n`,
  );
  process.exitCode = 1;
});
