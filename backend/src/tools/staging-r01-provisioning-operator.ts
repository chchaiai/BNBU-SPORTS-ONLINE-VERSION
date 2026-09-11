import { isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { validateEnvironment, type RuntimeConfig } from '../common/config/environment.js';
import { loadRuntimeSecrets } from '../common/config/file-json-secret-loader.js';
import { PrismaService } from '../common/database/prisma.service.js';
import {
  ensureStagingR01Fixture,
  loadStagingR01FixtureSecret,
  STAGING_R01_CONFIRMATION,
  STAGING_R01_FORBIDDEN_ENV_KEYS,
  STAGING_R01_SAFE_ALIASES,
  StagingR01ProvisioningFailure,
  type StagingR01FixtureOutcome,
} from './staging-r01-fixture.js';

type OperatorCommand = 'bootstrap';

export interface StagingR01OperatorControls {
  fixtureSecretFile: string;
}

const STAGING_DATABASE_HOST = '10.0.0.10';
const STAGING_DATABASE_NAME = 'sports_staging_pg_01';
const STAGING_DATABASE_USER = 'sports_staging_app';
const STAGING_DATABASE_CA_FILE = '/run/secrets/tencentdb-ca-chain.pem';

export function validateStagingR01OperatorControls(
  environment: NodeJS.ProcessEnv,
  command: OperatorCommand,
): StagingR01OperatorControls {
  if (command !== 'bootstrap') {
    throw new StagingR01ProvisioningFailure('R01_COMMAND_INVALID');
  }
  if (STAGING_R01_FORBIDDEN_ENV_KEYS.some((name) => Object.hasOwn(environment, name))) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SECRET_ENV_FORBIDDEN');
  }
  if (environment.APP_ENV?.trim() !== 'staging') {
    throw new StagingR01ProvisioningFailure('R01_APP_ENV_NOT_STAGING');
  }
  if (environment.STAGING_R01_CONFIRMATION?.trim() !== STAGING_R01_CONFIRMATION) {
    throw new StagingR01ProvisioningFailure('R01_CONFIRMATION_MISMATCH');
  }
  const fixtureSecretFile = environment.STAGING_R01_FIXTURE_SECRET_FILE?.trim();
  if (
    fixtureSecretFile === undefined ||
    fixtureSecretFile.length === 0 ||
    fixtureSecretFile.includes('CHANGE_ME') ||
    !isAbsolute(fixtureSecretFile)
  ) {
    throw new StagingR01ProvisioningFailure('R01_FIXTURE_SECRET_PATH_INVALID');
  }
  return { fixtureSecretFile };
}

export function validateStagingR01RuntimeBoundary(config: RuntimeConfig): void {
  if (config.appEnvironment !== 'staging') {
    throw new StagingR01ProvisioningFailure('R01_RUNTIME_NOT_STAGING');
  }
  let parsed: URL;
  let username: string;
  let database: string;
  try {
    parsed = new URL(config.databaseUrl);
    username = decodeURIComponent(parsed.username);
    database = decodeURIComponent(parsed.pathname.slice(1));
  } catch {
    throw new StagingR01ProvisioningFailure('R01_STAGING_DATABASE_BOUNDARY_MISMATCH');
  }
  const port = parsed.port === '' ? 5432 : Number.parseInt(parsed.port, 10);
  const allowedQueryNames = new Set(['schema', 'application_name', 'sslmode', 'sslaccept']);
  const sslMode = parsed.searchParams.get('sslmode');
  const sslAccept = parsed.searchParams.get('sslaccept');
  if (
    (parsed.protocol !== 'postgresql:' && parsed.protocol !== 'postgres:') ||
    parsed.hostname !== STAGING_DATABASE_HOST ||
    port !== 5432 ||
    username !== STAGING_DATABASE_USER ||
    parsed.password.length === 0 ||
    database !== STAGING_DATABASE_NAME ||
    (parsed.searchParams.get('schema') ?? 'public') !== 'public' ||
    [...parsed.searchParams.keys()].some((name) => !allowedQueryNames.has(name)) ||
    ['disable', 'allow', 'prefer', 'no-verify'].includes(sslMode ?? '') ||
    (sslAccept !== null && sslAccept !== 'strict') ||
    parsed.hash !== '' ||
    config.tencentDbCaFile !== STAGING_DATABASE_CA_FILE
  ) {
    throw new StagingR01ProvisioningFailure('R01_STAGING_DATABASE_BOUNDARY_MISMATCH');
  }
}

export function safeStagingR01CommandLabel(value: string | undefined): OperatorCommand | 'INVALID' {
  return value === 'bootstrap' ? value : 'INVALID';
}

export function buildSafeStagingR01Result(
  outcome: StagingR01FixtureOutcome,
): Record<string, unknown> {
  return {
    tool: 'STAGING_R01_PROVISIONING_OPERATOR',
    command: 'bootstrap',
    status: 'PASS',
    fixtureState: outcome.status,
    aliases: STAGING_R01_SAFE_ALIASES,
    counts: outcome.counts,
    createdComponents: outcome.createdComponents,
    phase12OrganizationIsolation: 'VERIFIED',
    studentUsersCreatedByProvisioner: 0,
    studentProfilesCreatedByProvisioner: 0,
    authSessionsCreatedByProvisioner: 0,
    enrollmentsCreatedByProvisioner: 0,
    sensitiveOutput: 'REDACTED',
  };
}

export function buildSafeStagingR01Failure(
  command: string | undefined,
  error: unknown,
): Record<string, unknown> {
  return {
    tool: 'STAGING_R01_PROVISIONING_OPERATOR',
    command: safeStagingR01CommandLabel(command),
    status: 'FAIL',
    failureCode: error instanceof StagingR01ProvisioningFailure ? error.code : 'UNEXPECTED_FAILURE',
    sensitiveOutput: 'REDACTED',
  };
}

function writeSafeResult(result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  try {
    if (command !== 'bootstrap') {
      throw new StagingR01ProvisioningFailure('R01_COMMAND_INVALID');
    }
    const controls = validateStagingR01OperatorControls(process.env, command);
    try {
      await loadRuntimeSecrets(process.env);
    } catch {
      throw new StagingR01ProvisioningFailure('R01_RUNTIME_SECRET_LOAD_FAILED');
    }
    let config: RuntimeConfig;
    try {
      config = validateEnvironment(process.env).RUNTIME_CONFIG as RuntimeConfig;
    } catch {
      throw new StagingR01ProvisioningFailure('R01_RUNTIME_CONFIGURATION_INVALID');
    }
    validateStagingR01RuntimeBoundary(config);
    const secret = await loadStagingR01FixtureSecret(controls.fixtureSecretFile);
    const prisma = new PrismaService(config);
    try {
      await prisma.$connect();
      const outcome = await ensureStagingR01Fixture(prisma, secret);
      writeSafeResult(buildSafeStagingR01Result(outcome));
    } finally {
      await prisma.$disconnect();
    }
  } catch (error) {
    writeSafeResult(buildSafeStagingR01Failure(command, error));
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && currentFile === resolve(process.argv[1])) {
  await main();
}
