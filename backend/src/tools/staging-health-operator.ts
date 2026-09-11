import { readFile } from 'node:fs/promises';
import { isAbsolute, resolve } from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';
import { TextDecoder } from 'node:util';

import { argon2id, hash, verify } from 'argon2';
import { v7 as uuidv7 } from 'uuid';

import { validateEnvironment, type RuntimeConfig } from '../common/config/environment.js';
import { loadRuntimeSecrets } from '../common/config/file-json-secret-loader.js';
import { PrismaService } from '../common/database/prisma.service.js';
import { Prisma } from '../generated/prisma/client.js';

export const STAGING_OPERATOR_CONFIRMATION = 'BNBU_SPORTS_STAGING_SYNTHETIC_V1';
export const STAGING_OPERATOR_INTERNAL_BASE_URL = 'http://backend:3000/api/v1';
export const STAGING_FIXTURE_EMAIL = 'admin.staging.synthetic@bnbu.invalid';
export const STAGING_FIXTURE_AUDIT_ACTION = 'STAGING_FIXTURE_BOOTSTRAP';
export const STAGING_FIXTURE_PERMISSION_ID = 'OPERATIONS-STAGING-FIXTURE-BOOTSTRAP';

const FIXTURE_SECRET_KEY = 'STAGING_ADMIN_PASSWORD';
const FIXTURE_ORGANIZATION_CODE = 'STAGING-SYNTHETIC';
const FIXTURE_EMPLOYEE_NUMBER = 'SYNTH-STAGING-ADMIN';
const FIXTURE_SECRET_MAX_BYTES = 4 * 1024;
const UTF8_DECODER = new TextDecoder('utf-8', { fatal: true });

type OperatorCommand = 'bootstrap' | 'verify';

interface OperatorControls {
  fixtureSecretFile: string;
  internalBaseUrl: string;
}

interface FixtureSecretLoaderDependencies {
  readSecretFile?: (path: string) => Promise<Uint8Array>;
}

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

class OperatorFailure extends Error {
  constructor(readonly code: string) {
    super(code);
    this.name = 'OperatorFailure';
  }
}

export function validateStagingOperatorControls(
  environment: NodeJS.ProcessEnv,
  command: OperatorCommand,
): OperatorControls {
  if (environment.APP_ENV?.trim() !== 'staging') {
    throw new OperatorFailure('APP_ENV_NOT_STAGING');
  }
  if (environment.STAGING_BOOTSTRAP_CONFIRMATION?.trim() !== STAGING_OPERATOR_CONFIRMATION) {
    throw new OperatorFailure('CONFIRMATION_MISMATCH');
  }

  const fixtureSecretFile = environment.STAGING_FIXTURE_SECRET_FILE?.trim();
  if (
    fixtureSecretFile === undefined ||
    fixtureSecretFile.length === 0 ||
    fixtureSecretFile.includes('CHANGE_ME') ||
    !isAbsolute(fixtureSecretFile)
  ) {
    throw new OperatorFailure('FIXTURE_SECRET_PATH_INVALID');
  }

  const internalBaseUrl =
    environment.STAGING_BACKEND_INTERNAL_BASE_URL?.trim() ?? STAGING_OPERATOR_INTERNAL_BASE_URL;
  if (command === 'verify' && internalBaseUrl !== STAGING_OPERATOR_INTERNAL_BASE_URL) {
    throw new OperatorFailure('INTERNAL_BASE_URL_MISMATCH');
  }
  return { fixtureSecretFile, internalBaseUrl };
}

export async function loadStagingFixturePassword(
  filePath: string,
  dependencies: FixtureSecretLoaderDependencies = {},
): Promise<string> {
  let bytes: Uint8Array;
  try {
    bytes = await (dependencies.readSecretFile ?? readFile)(filePath);
  } catch {
    throw new OperatorFailure('FIXTURE_SECRET_UNAVAILABLE');
  }
  if (bytes.byteLength > FIXTURE_SECRET_MAX_BYTES) {
    throw new OperatorFailure('FIXTURE_SECRET_TOO_LARGE');
  }

  let text: string;
  try {
    text = UTF8_DECODER.decode(bytes);
  } catch {
    throw new OperatorFailure('FIXTURE_SECRET_NOT_UTF8');
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    throw new OperatorFailure('FIXTURE_SECRET_INVALID_JSON');
  }
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== 'object') {
    throw new OperatorFailure('FIXTURE_SECRET_INVALID_SHAPE');
  }

  const entries = Object.entries(parsed as Record<string, unknown>);
  if (entries.length !== 1 || entries[0]?.[0] !== FIXTURE_SECRET_KEY) {
    throw new OperatorFailure('FIXTURE_SECRET_KEYS_INVALID');
  }
  const password = entries[0][1];
  if (
    typeof password !== 'string' ||
    password.length < 24 ||
    password.length > 128 ||
    password.includes('CHANGE_ME')
  ) {
    throw new OperatorFailure('FIXTURE_PASSWORD_INVALID');
  }
  return password;
}

export async function bootstrapFixture(config: RuntimeConfig, password: string): Promise<void> {
  const prisma = new PrismaService(config);
  try {
    await prisma.$connect();
    const outcome = await prisma.$transaction(
      async (transaction) => {
        const created: string[] = [];
        const now = new Date();
        let organization = await transaction.organization.findUnique({
          where: { organizationCode: FIXTURE_ORGANIZATION_CODE },
        });
        if (organization === null) {
          organization = await transaction.organization.create({
            data: {
              id: uuidv7(),
              organizationCode: FIXTURE_ORGANIZATION_CODE,
              legalName: 'BNBU Sports Synthetic Staging Health Organization',
              displayName: 'BNBU Sports Synthetic Staging Health',
              timezone: 'Asia/Shanghai',
              defaultLocale: 'zh-CN',
              status: 'ACTIVE',
              createdAt: now,
              updatedAt: now,
            },
          });
          created.push('organization');
        } else if (
          organization.legalName !== 'BNBU Sports Synthetic Staging Health Organization' ||
          organization.displayName !== 'BNBU Sports Synthetic Staging Health' ||
          organization.timezone !== 'Asia/Shanghai' ||
          organization.defaultLocale !== 'zh-CN' ||
          organization.status !== 'ACTIVE'
        ) {
          throw new OperatorFailure('FIXTURE_ORGANIZATION_CONFLICT');
        }

        let admin = await transaction.user.findUnique({
          where: {
            organizationId_primaryEmailNormalized: { emailIdentityScope: 'PRIMARY',
              organizationId: organization.id,
              primaryEmailNormalized: STAGING_FIXTURE_EMAIL,
            },
          },
        });
        if (admin === null) {
          const passwordHash = await hash(password, { type: argon2id });
          admin = await transaction.user.create({
            data: {
              id: uuidv7(),
              organizationId: organization.id,
              role: 'ADMIN',
              status: 'ACTIVE',
              primaryEmail: STAGING_FIXTURE_EMAIL,
              primaryEmailNormalized: STAGING_FIXTURE_EMAIL,
              emailVerifiedAt: now,
              passwordHash,
              createdAt: now,
              updatedAt: now,
            },
          });
          created.push('adminUser');
        } else {
          if (
            admin.role !== 'ADMIN' ||
            admin.status !== 'ACTIVE' ||
            admin.primaryEmail !== STAGING_FIXTURE_EMAIL ||
            admin.primaryEmailNormalized !== STAGING_FIXTURE_EMAIL ||
            admin.emailVerifiedAt === null ||
            admin.deletedAt !== null ||
            admin.passwordHash === null
          ) {
            throw new OperatorFailure('FIXTURE_ADMIN_CONFLICT');
          }
          if (!(await verify(admin.passwordHash, password))) {
            throw new OperatorFailure('FIXTURE_PASSWORD_MISMATCH');
          }
        }

        let profile = await transaction.adminProfile.findUnique({ where: { userId: admin.id } });
        if (profile === null) {
          const employeeNumberConflict = await transaction.adminProfile.findUnique({
            where: {
              organizationId_employeeNumber: {
                organizationId: organization.id,
                employeeNumber: FIXTURE_EMPLOYEE_NUMBER,
              },
            },
          });
          if (employeeNumberConflict !== null) {
            throw new OperatorFailure('FIXTURE_ADMIN_PROFILE_CONFLICT');
          }
          profile = await transaction.adminProfile.create({
            data: {
              id: uuidv7(),
              organizationId: organization.id,
              userId: admin.id,
              employeeNumber: FIXTURE_EMPLOYEE_NUMBER,
              fullName: 'Synthetic Staging Health Admin',
              departmentName: 'Synthetic Staging Operations',
              status: 'ACTIVE',
              createdAt: now,
              updatedAt: now,
            },
          });
          created.push('adminProfile');
        } else if (
          profile.organizationId !== organization.id ||
          profile.employeeNumber !== FIXTURE_EMPLOYEE_NUMBER ||
          profile.fullName !== 'Synthetic Staging Health Admin' ||
          profile.departmentName !== 'Synthetic Staging Operations' ||
          profile.status !== 'ACTIVE' ||
          profile.deletedAt !== null
        ) {
          throw new OperatorFailure('FIXTURE_ADMIN_PROFILE_CONFLICT');
        }

        const policy = await transaction.systemPolicy.findUnique({
          where: { organizationId: organization.id },
        });
        if (policy === null) {
          await transaction.systemPolicy.create({
            data: {
              organizationId: organization.id,
              systemMode: 'NORMAL',
              changedBy: admin.id,
              changeReason: 'Synthetic staging health fixture bootstrap',
              updatedAt: now,
            },
          });
          created.push('systemPolicy');
        } else if (policy.systemMode !== 'NORMAL' || policy.changedBy !== admin.id) {
          throw new OperatorFailure('FIXTURE_SYSTEM_POLICY_CONFLICT');
        }

        if (created.length > 0) {
          await transaction.auditLog.create({
            data: {
              id: uuidv7(),
              organizationId: organization.id,
              actorUserId: admin.id,
              actorRoleSnapshot: 'ADMIN',
              permissionId: STAGING_FIXTURE_PERMISSION_ID,
              actionType: STAGING_FIXTURE_AUDIT_ACTION,
              targetType: 'USER',
              targetId: admin.id,
              requestId: `staging-bootstrap-${uuidv7()}`,
              idempotencyKeyReference: null,
              outcome: 'SUCCEEDED',
              reasonCode: null,
              safeMetadata: { fixtureKind: 'STAGING_HEALTH', createdComponents: created },
              sourceIpHash: null,
              deviceFingerprintHash: null,
              occurredAt: now,
            },
          });
        }

        return { status: created.length === 0 ? 'VERIFIED' : 'CREATED', created };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
    writeSafeResult({
      tool: 'STAGING_HEALTH_OPERATOR',
      command: 'bootstrap',
      status: 'PASS',
      fixtureState: outcome.status,
      createdComponents: outcome.created,
      secretOutput: 'REDACTED',
    });
  } finally {
    await prisma.$disconnect();
  }
}

async function verifyAdminHealth(baseUrl: string, password: string): Promise<void> {
  let accessToken: string | null = null;
  let refreshToken: string | null = null;
  let logoutHttpStatus: number | null = null;
  let healthResult: Record<string, unknown> | null = null;
  let primaryFailure: unknown = null;

  const login = await requestJson(`${baseUrl}/auth/password-login`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'idempotency-key': uuidv7(),
      'x-request-id': `staging-health-login-${uuidv7()}`,
    },
    body: JSON.stringify({ account: STAGING_FIXTURE_EMAIL, password }),
  });
  if (login.status !== 200) throw new OperatorFailure('LOGIN_HTTP_STATUS');
  const authData = objectField(login.body, 'data', 'LOGIN_RESPONSE_INVALID');
  accessToken = stringField(authData, 'accessToken', 'LOGIN_RESPONSE_INVALID');
  refreshToken = stringField(authData, 'refreshToken', 'LOGIN_RESPONSE_INVALID');

  try {
    const requestId = `staging-admin-health-${uuidv7()}`;
    const health = await requestJson(`${baseUrl}/health/admin`, {
      headers: { authorization: `Bearer ${accessToken}`, 'x-request-id': requestId },
    });
    if (health.status !== 200) throw new OperatorFailure('ADMIN_HEALTH_HTTP_STATUS');
    const meta = objectField(health.body, 'meta', 'ADMIN_HEALTH_RESPONSE_INVALID');
    if (meta.requestId !== requestId) throw new OperatorFailure('ADMIN_HEALTH_REQUEST_ID_MISMATCH');
    const data = objectField(health.body, 'data', 'ADMIN_HEALTH_RESPONSE_INVALID');
    const dependencies = objectField(data, 'dependencies', 'ADMIN_HEALTH_RESPONSE_INVALID');
    healthResult = {
      healthStatus: stringField(data, 'status', 'ADMIN_HEALTH_RESPONSE_INVALID'),
      dependencies: {
        database: dependencyStatus(dependencies, 'database'),
        notificationQueue: dependencyStatus(dependencies, 'notificationQueue'),
        objectStorage: dependencyStatus(dependencies, 'objectStorage'),
        mediaStorage: dependencyStatus(dependencies, 'mediaStorage'),
      },
      requestIdVerified: true,
    };
    if (
      healthResult.healthStatus !== 'UP' ||
      Object.values(healthResult.dependencies as Record<string, string>).some(
        (status) => status !== 'UP',
      )
    ) {
      throw new OperatorFailure('ADMIN_HEALTH_NOT_UP');
    }
  } catch (error) {
    primaryFailure = error;
  } finally {
    if (accessToken !== null && refreshToken !== null) {
      const logout = await requestJson(`${baseUrl}/auth/logout`, {
        method: 'POST',
        headers: {
          authorization: `Bearer ${accessToken}`,
          'content-type': 'application/json',
          'idempotency-key': uuidv7(),
          'x-request-id': `staging-health-logout-${uuidv7()}`,
        },
        body: JSON.stringify({ refreshToken }),
      });
      logoutHttpStatus = logout.status;
    }
  }

  if (primaryFailure !== null) {
    if (primaryFailure instanceof Error) throw primaryFailure;
    throw new OperatorFailure('UNEXPECTED_FAILURE');
  }
  if (logoutHttpStatus !== 200) throw new OperatorFailure('LOGOUT_HTTP_STATUS');
  writeSafeResult({
    tool: 'STAGING_HEALTH_OPERATOR',
    command: 'verify',
    status: 'PASS',
    loginHttpStatus: login.status,
    adminHealthHttpStatus: 200,
    logoutHttpStatus,
    ...healthResult,
    tokenOutput: 'REDACTED',
  });
}

async function requestJson(url: string, init: RequestInit = {}): Promise<HttpResult> {
  let response: Response;
  try {
    response = await fetch(url, { ...init, signal: AbortSignal.timeout(15_000) });
  } catch {
    throw new OperatorFailure('HTTP_REQUEST_FAILED');
  }
  const text = await response.text();
  if (text.length === 0) return { status: response.status, body: {} };
  try {
    const body: unknown = JSON.parse(text);
    if (body === null || Array.isArray(body) || typeof body !== 'object') {
      throw new OperatorFailure('HTTP_RESPONSE_INVALID');
    }
    return { status: response.status, body: body as Record<string, unknown> };
  } catch (error) {
    if (error instanceof OperatorFailure) throw error;
    throw new OperatorFailure('HTTP_RESPONSE_INVALID');
  }
}

function objectField(
  value: Record<string, unknown>,
  name: string,
  failureCode: string,
): Record<string, unknown> {
  const field = value[name];
  if (field === null || Array.isArray(field) || typeof field !== 'object') {
    throw new OperatorFailure(failureCode);
  }
  return field as Record<string, unknown>;
}

function stringField(value: Record<string, unknown>, name: string, failureCode: string): string {
  const field = value[name];
  if (typeof field !== 'string' || field.length === 0) throw new OperatorFailure(failureCode);
  return field;
}

function dependencyStatus(dependencies: Record<string, unknown>, name: string): string {
  return stringField(
    objectField(dependencies, name, 'ADMIN_HEALTH_RESPONSE_INVALID'),
    'status',
    'ADMIN_HEALTH_RESPONSE_INVALID',
  );
}

function writeSafeResult(result: Record<string, unknown>): void {
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

async function main(): Promise<void> {
  const command = process.argv[2];
  try {
    if (command !== 'bootstrap' && command !== 'verify') {
      throw new OperatorFailure('COMMAND_INVALID');
    }
    const controls = validateStagingOperatorControls(process.env, command);
    await loadRuntimeSecrets(process.env);
    const config = validateEnvironment(process.env).RUNTIME_CONFIG as RuntimeConfig;
    if (config.appEnvironment !== 'staging') throw new OperatorFailure('RUNTIME_NOT_STAGING');
    const password = await loadStagingFixturePassword(controls.fixtureSecretFile);

    if (command === 'bootstrap') await bootstrapFixture(config, password);
    else await verifyAdminHealth(controls.internalBaseUrl, password);
  } catch (error) {
    writeSafeResult({
      tool: 'STAGING_HEALTH_OPERATOR',
      command: command ?? 'UNKNOWN',
      status: 'FAIL',
      failureCode: error instanceof OperatorFailure ? error.code : 'UNEXPECTED_FAILURE',
      secretOutput: 'REDACTED',
    });
    process.exitCode = 1;
  }
}

const currentFile = fileURLToPath(import.meta.url);
if (process.argv[1] !== undefined && currentFile === resolve(process.argv[1])) {
  await main();
}
