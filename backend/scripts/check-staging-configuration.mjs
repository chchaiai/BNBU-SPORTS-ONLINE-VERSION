import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import process from 'node:process';

import { loadFileJsonSecret } from './file-json-secret.mjs';
import { loadTencentDbCa } from './postgres-tls.mjs';

const manifest = JSON.parse(
  await readFile(resolve('config/staging-configuration-requirements.json'), 'utf8'),
);
const expectedR01FixtureSecret = [
  'STAGING_R01_ADMIN_ACCOUNT',
  'STAGING_R01_ADMIN_PASSWORD',
  'STAGING_R01_TEACHER_ACCOUNT',
  'STAGING_R01_TEACHER_PASSWORD',
];
const expectedR01FixtureForbiddenEnvironment = [
  ...expectedR01FixtureSecret,
  'STAGING_R01_STUDENT_ANDROID_EMAIL',
  'STAGING_R01_STUDENT_IOS_EMAIL',
  'STAGING_R01_STUDENT_WEB_EMAIL',
];
if (
  !Array.isArray(manifest.r01FixtureSecret) ||
  manifest.r01FixtureSecret.length !== expectedR01FixtureSecret.length ||
  manifest.r01FixtureSecret.some((name, index) => name !== expectedR01FixtureSecret[index])
) {
  throw new Error('R01 fixture secret allowlist mismatch');
}
if (
  !Array.isArray(manifest.r01FixtureForbiddenEnvironment) ||
  manifest.r01FixtureForbiddenEnvironment.length !==
    expectedR01FixtureForbiddenEnvironment.length ||
  manifest.r01FixtureForbiddenEnvironment.some(
    (name, index) => name !== expectedR01FixtureForbiddenEnvironment[index],
  )
) {
  throw new Error('R01 fixture forbidden environment list mismatch');
}
const checkFiles = process.argv.includes('--files');
const rows = [];

for (const item of manifest.nonSecret) {
  rows.push({
    name: item.name,
    status: configurationStatus(item, process.env[item.name]),
    owner: item.owner,
    source: item.source,
  });
}
for (const item of manifest.optionalNonSecret) {
  rows.push({
    name: item.name,
    status: configured(process.env[item.name]) ? 'CONFIGURED' : 'OPTIONAL',
    owner: item.owner,
    source: item.source,
  });
}
for (const item of manifest.consoleRequirements) {
  rows.push({
    name: item.name,
    status: 'UNKNOWN_CONSOLE_VERIFICATION',
    owner: 'USER_TENCENT_CONSOLE',
    source: item.source,
  });
}

if (checkFiles) {
  await inspectSecretFile(
    'RUNTIME_JSON_SECRET',
    process.env.BNBU_RUNTIME_SECRET_FILE,
    manifest.runtimeSecret,
  );
  await inspectSecretFile(
    'MIGRATOR_JSON_SECRET',
    process.env.BNBU_MIGRATOR_SECRET_FILE,
    manifest.migratorSecret,
  );
  await inspectSecretFile(
    'STAGING_FIXTURE_JSON_SECRET',
    process.env.BNBU_STAGING_FIXTURE_SECRET_FILE,
    manifest.fixtureSecret,
  );
  await inspectSecretFile(
    'STAGING_BUSINESS_FIXTURE_JSON_SECRET',
    process.env.BNBU_STAGING_BUSINESS_FIXTURE_SECRET_FILE,
    manifest.businessFixtureSecret,
  );
  await inspectSecretFile(
    'STAGING_R01_FIXTURE_JSON_SECRET',
    process.env.BNBU_STAGING_R01_FIXTURE_SECRET_FILE,
    manifest.r01FixtureSecret,
    manifest.r01FixtureForbiddenEnvironment,
  );
  inspectCaFile(process.env.BNBU_TENCENTDB_CA_FILE);
} else {
  for (const name of manifest.runtimeSecret) {
    rows.push({
      name,
      status: 'UNKNOWN_FILE_NOT_READ',
      owner: 'DOCKER_COMPOSE_SECRET',
      source: 'runtime JSON secret',
    });
  }
  for (const name of manifest.migratorSecret) {
    rows.push({
      name,
      status: 'UNKNOWN_FILE_NOT_READ',
      owner: 'DOCKER_COMPOSE_SECRET',
      source: 'migrator JSON secret',
    });
  }
  for (const name of manifest.fixtureSecret) {
    rows.push({
      name,
      status: 'UNKNOWN_FILE_NOT_READ',
      owner: 'DOCKER_COMPOSE_SECRET',
      source: 'staging fixture JSON secret',
    });
  }
  for (const name of manifest.businessFixtureSecret) {
    rows.push({
      name,
      status: 'UNKNOWN_FILE_NOT_READ',
      owner: 'DOCKER_COMPOSE_SECRET',
      source: 'staging business fixture JSON secret',
    });
  }
  for (const name of manifest.r01FixtureSecret) {
    rows.push({
      name,
      status: 'UNKNOWN_FILE_NOT_READ',
      owner: 'DOCKER_COMPOSE_SECRET',
      source: 'staging R01 fixture JSON secret',
    });
  }
}

function inspectCaFile(filePath) {
  try {
    loadTencentDbCa(filePath);
    rows.push({
      name: 'TENCENTDB_CA_CHAIN',
      status: 'CONFIGURED',
      owner: 'DOCKER_COMPOSE_SECRET',
      source: 'TENCENTDB_CA_FILE',
    });
  } catch (error) {
    rows.push({
      name: 'TENCENTDB_CA_CHAIN',
      status: 'INVALID_OR_UNAVAILABLE',
      owner: 'DEPLOYMENT',
      source: error instanceof Error ? error.message : 'unknown CA validation failure',
    });
  }
}

for (const row of rows) {
  process.stdout.write(`${row.status}\t${row.name}\t${row.owner}\t${row.source}\n`);
}

const missing = rows.filter((row) => row.status === 'MISSING');
const mismatched = rows.filter((row) => row.status === 'MISMATCH');
const cloudFailures = rows.filter((row) => row.status === 'INVALID_OR_UNAVAILABLE');
const deferred = rows.filter((row) => row.status === 'DEFERRED');
process.stdout.write(
  `Staging configuration summary: configured=${rows.filter((row) => row.status === 'CONFIGURED').length} deferred=${deferred.length} missing=${missing.length} mismatched=${mismatched.length} fileFailures=${cloudFailures.length} filesChecked=${checkFiles}\n`,
);
if (missing.length > 0 || mismatched.length > 0 || cloudFailures.length > 0) process.exitCode = 1;

async function inspectSecretFile(
  label,
  filePath,
  expectedKeys,
  forbiddenEnvironmentKeys = expectedKeys,
) {
  const environment = { ...process.env };
  try {
    if (forbiddenEnvironmentKeys.some((name) => Object.hasOwn(environment, name))) {
      throw new Error('Secret values must not be present in the process environment');
    }
    await loadFileJsonSecret({
      filePath,
      expectedKeys,
      environment,
    });
    for (const name of expectedKeys) {
      rows.push({ name, status: 'CONFIGURED', owner: 'DOCKER_COMPOSE_SECRET', source: label });
    }
  } catch (error) {
    rows.push({
      name: label,
      status: 'INVALID_OR_UNAVAILABLE',
      owner: 'USER_TENCENT_CONSOLE',
      source: error instanceof Error ? error.message : 'unknown validation failure',
    });
  }
}

function configured(value) {
  return typeof value === 'string' && value.trim().length > 0 && !value.includes('CHANGE_ME');
}

function configurationStatus(item, value) {
  if (!configured(value)) return 'MISSING';
  const normalized = value.trim();
  if (item.validation === 'HTTPS_ORIGIN_LIST' && !isHttpsOriginList(normalized)) return 'MISMATCH';
  if (item.deferredValues?.includes(normalized)) return 'DEFERRED';
  if (item.expected !== undefined && normalized !== String(item.expected)) return 'MISMATCH';
  return 'CONFIGURED';
}

function isHttpsOriginList(value) {
  const origins = value.split(',').map((origin) => origin.trim());
  if (origins.length === 0 || origins.some((origin) => origin.length === 0)) return false;
  return origins.every((origin) => {
    try {
      const url = new URL(origin);
      return url.protocol === 'https:' && url.origin === origin;
    } catch {
      return false;
    }
  });
}
