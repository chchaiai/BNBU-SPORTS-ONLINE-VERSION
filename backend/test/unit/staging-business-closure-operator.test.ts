import assert from 'node:assert/strict';
import { resolve } from 'node:path';
import { describe, it } from 'node:test';

import type { RuntimeConfig } from '../../src/common/config/environment.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  STAGING_BUSINESS_CONFIRMATION,
  STAGING_BUSINESS_FIXTURE_AUDIT_ACTION,
  STAGING_BUSINESS_FIXTURE_PERMISSION_ID,
  STAGING_BUSINESS_PUBLIC_BASE_URL,
  STAGING_QR_PATH_LOG_REDACTION_CONFIRMATION,
  StagingBusinessOperatorFailure,
  loadStagingBusinessFixtureSecret,
} from '../../src/tools/staging-business-fixture.js';
import {
  readHiddenOtp,
  nextQrInviteRecoveryAttempt,
  safeOperatorCommandLabel,
  validateQrJoinCapabilityDatabaseEvidence,
  validateCosUploadUrl,
  validateStagingDatabaseTarget,
  validateStagingBusinessOperatorControls,
  validateStagingBusinessRuntimeBoundary,
  verifyExerciseSessionApi,
  type ApiResult,
  type OperatorApiClient,
} from '../../src/tools/staging-business-closure-operator.js';
import {
  requireTestDatabaseUrl,
  TEST_DATABASE_RESET_CONFIRMATION,
} from '../helpers/test-environment.js';

const SYNTHETIC_ADMIN_PASSWORD = 'Synthetic-Business-Admin-Only-2026';
const SYNTHETIC_TEACHER_PASSWORD = 'Synthetic-Business-Teacher-Only-2026';
const SYNTHETIC_STUDENT_EMAIL = 'student.business.closure@unit.verityai.cn';

function secretDependencies(
  bytes: Uint8Array,
  metadata: Partial<{
    uid: number;
    gid: number;
    mode: number;
    isFile: boolean;
    isSymbolicLink: boolean;
  }> = {},
) {
  return {
    inspectSecretFile: () =>
      Promise.resolve({
        uid: 0,
        gid: 10_001,
        mode: 0o100640,
        isFile: true,
        isSymbolicLink: false,
        ...metadata,
      }),
    readSecretFile: () => Promise.resolve(bytes),
  };
}

function isFailure(code: string): (error: unknown) => boolean {
  return (error) =>
    error instanceof StagingBusinessOperatorFailure &&
    error.code === code &&
    error.message === code;
}

function runtimeBoundaryConfig(): RuntimeConfig {
  const objectStorage = {
    endpoint: 'https://cos.ap-guangzhou.myqcloud.com',
    region: 'ap-guangzhou',
    bucket: 'sports-staging-media-1443273655',
    credentials: { provider: 'TENCENT_CVM_ROLE' as const },
    forcePathStyle: false,
  };
  const boundary = {
    appEnvironment: 'staging' as const,
    databaseUrl:
      'postgresql://sports_staging_app:synthetic-database-password@10.0.0.10:5432/sports_staging_pg_01?schema=public&sslmode=verify-full&sslaccept=strict',
    tencentDbCaFile: '/run/secrets/tencentdb-ca-chain.pem',
    corsAllowlist: new Set(['https://admin.verityai.cn', 'https://www.verityai.cn']),
    objectStorage,
    media: {
      storage: { ...objectStorage },
      uploadUrlTtlSeconds: 300,
      accessUrlTtlSeconds: 300,
      maxImageBytes: 10_485_760,
      maxImagePixels: 40_000_000,
      maxVideoTransportBytes: 536_870_912,
      scannerMode: 'TEST_SIGNATURE' as const,
      workerEnabled: true,
      workerPollMs: 500,
    },
    emailDelivery: {
      provider: 'TENCENT_SES' as const,
      region: 'ap-guangzhou',
      fromAddress: 'no-reply@verityai.cn',
      replyToAddress: null,
      templateId: 56_852,
      templateVariables: { code: 'code', expiryMinutes: null, purpose: null },
    },
    joinCapabilityTtlSeconds: 600,
  };
  return boundary as unknown as RuntimeConfig;
}

const SESSION_SMOKE_STATE = {
  organizationId: '00000000-0000-0000-0000-000000000101',
  adminUserId: '00000000-0000-0000-0000-000000000102',
  teacherUserId: '00000000-0000-0000-0000-000000000103',
  teacherProfileId: '00000000-0000-0000-0000-000000000104',
  studentUserId: '00000000-0000-0000-0000-000000000105',
  studentProfileId: '00000000-0000-0000-0000-000000000106',
  semesterId: '00000000-0000-0000-0000-000000000107',
  courseId: '00000000-0000-0000-0000-000000000108',
  classSectionId: '00000000-0000-0000-0000-000000000109',
  scoreRuleId: '00000000-0000-0000-0000-000000000110',
};

function sessionSmokeApi(
  operations: { operation: string; requestId: string }[],
): OperatorApiClient {
  const session = { id: '00000000-0000-0000-0000-000000000120', version: 1 };
  return {
    request(operation, _path, init): Promise<ApiResult> {
      operations.push({
        operation,
        requestId: new Headers(init.headers).get('x-request-id') ?? '',
      });
      if (operation === 'SESSION_STALE_VERSION') {
        return Promise.resolve({
          status: 409,
          body: { code: 'CONFLICT_VERSION_MISMATCH' },
          headers: new Headers(),
        });
      }
      if (operation === 'SESSION_CANCEL') {
        return Promise.resolve({
          status: 200,
          body: { data: { ...session, status: 'CANCELLED', version: 2 } },
          headers: new Headers(),
        });
      }
      return Promise.resolve({ status: 201, body: { data: session }, headers: new Headers() });
    },
  };
}

describe('staging business closure operator safety gates', () => {
  it('uses closed-catalog audit identifiers', () => {
    assert.equal(STAGING_BUSINESS_FIXTURE_AUDIT_ACTION, 'STAGING_FIXTURE_BOOTSTRAP');
    assert.match(STAGING_BUSINESS_FIXTURE_PERMISSION_ID, /^[A-Z][A-Z0-9-]*$/u);
  });

  it('never reflects an arbitrary command-line value into status output', () => {
    assert.equal(safeOperatorCommandLabel('bootstrap'), 'bootstrap');
    assert.equal(safeOperatorCommandLabel('run'), 'run');
    assert.equal(safeOperatorCommandLabel('sensitive-accidental-argument'), 'INVALID');
    assert.equal(safeOperatorCommandLabel(undefined), 'INVALID');
  });

  it('bounds QR interruption recovery to three synthetic invite rotations', () => {
    const state = {
      organizationId: '00000000-0000-0000-0000-000000000010',
      classSectionId: '00000000-0000-0000-0000-000000000011',
      teacherUserId: '00000000-0000-0000-0000-000000000012',
    };
    const first = {
      id: '00000000-0000-0000-0000-000000000021',
      organizationId: state.organizationId,
      classSectionId: state.classSectionId,
      createdBy: state.teacherUserId,
      versionNumber: 1,
      status: 'REVOKED',
      replacedByInviteId: '00000000-0000-0000-0000-000000000022',
    };
    const second = {
      id: '00000000-0000-0000-0000-000000000022',
      organizationId: state.organizationId,
      classSectionId: state.classSectionId,
      createdBy: state.teacherUserId,
      versionNumber: 2,
      status: 'ACTIVE',
      replacedByInviteId: null,
    };
    assert.equal(nextQrInviteRecoveryAttempt([], state), 1);
    assert.equal(nextQrInviteRecoveryAttempt([first, second], state), 3);
    assert.throws(
      () =>
        nextQrInviteRecoveryAttempt(
          [
            first,
            { ...second, status: 'REVOKED', replacedByInviteId: 'third' },
            { ...second, id: 'third', versionNumber: 3 },
          ],
          state,
        ),
      isFailure('QR_RECOVERY_ATTEMPTS_EXHAUSTED'),
    );
    assert.throws(
      () =>
        nextQrInviteRecoveryAttempt([{ ...second, versionNumber: 1, createdBy: 'foreign' }], state),
      isFailure('QR_RECOVERY_HISTORY_CONFLICT'),
    );
  });

  it('accepts only the domain ACTIVE state as fresh join-capability database evidence', () => {
    const classSectionId = '00000000-0000-0000-0000-000000000011';
    const createdRequestId = 'staging-business-qc-synthetic';
    const row = { classSectionId, status: 'ACTIVE', createdRequestId };

    assert.doesNotThrow(() =>
      validateQrJoinCapabilityDatabaseEvidence([row], classSectionId, createdRequestId),
    );
    assert.throws(
      () =>
        validateQrJoinCapabilityDatabaseEvidence(
          [{ ...row, status: 'ISSUED' }],
          classSectionId,
          createdRequestId,
        ),
      isFailure('QR_CAPABILITY_DATABASE_EVIDENCE_INVALID'),
    );
  });

  it('runs a fresh session start/replay/stale/cancel sequence on every clean invocation', async () => {
    const operations: { operation: string; requestId: string }[] = [];
    const prisma = {
      exerciseSession: { findMany: () => Promise.resolve([]) },
    } as unknown as PrismaClient;
    const auditRequestIds = new Set<string>();

    await verifyExerciseSessionApi(
      sessionSmokeApi(operations),
      prisma,
      SESSION_SMOKE_STATE,
      '00000000-0000-0000-0000-000000000111',
      {
        accessToken: 'synthetic-access',
        refreshToken: 'synthetic-refresh',
        sessionId: 'synthetic-session',
      },
      auditRequestIds,
    );

    assert.deepEqual(
      operations.map(({ operation }) => operation),
      ['SESSION_START', 'SESSION_START_REPLAY', 'SESSION_STALE_VERSION', 'SESSION_CANCEL'],
    );
    assert.match(operations[0]?.requestId ?? '', /^sb-ss-/u);
    assert.equal(operations[1]?.requestId, operations[0]?.requestId);
    assert.match(operations[3]?.requestId ?? '', /^sb-sc-/u);
    assert.deepEqual(
      auditRequestIds,
      new Set([operations[0]?.requestId, operations[3]?.requestId]),
    );
  });

  it('cancels an interrupted operator session and still executes a fresh session sequence', async () => {
    const operations: { operation: string; requestId: string }[] = [];
    const enrollmentId = '00000000-0000-0000-0000-000000000111';
    const prisma = {
      exerciseSession: {
        findMany: () =>
          Promise.resolve([
            {
              id: '00000000-0000-0000-0000-000000000121',
              organizationId: SESSION_SMOKE_STATE.organizationId,
              studentId: SESSION_SMOKE_STATE.studentProfileId,
              enrollmentId,
              classSectionId: SESSION_SMOKE_STATE.classSectionId,
              semesterId: SESSION_SMOKE_STATE.semesterId,
              startedByAuthSessionId: 'prior-auth-session',
              status: 'IN_PROGRESS',
              version: 1,
              events: [
                {
                  eventVersion: 1,
                  eventType: 'STARTED',
                  fromStatus: null,
                  toStatus: 'IN_PROGRESS',
                  actorUserId: SESSION_SMOKE_STATE.studentUserId,
                  authSessionId: 'prior-auth-session',
                  requestId: 'sb-ss-0198d5ac-0000-7000-8000-000000000001',
                },
              ],
            },
          ]),
      },
    } as unknown as PrismaClient;

    await verifyExerciseSessionApi(
      sessionSmokeApi(operations),
      prisma,
      SESSION_SMOKE_STATE,
      enrollmentId,
      {
        accessToken: 'synthetic-access',
        refreshToken: 'synthetic-refresh',
        sessionId: 'synthetic-session',
      },
      new Set<string>(),
    );

    assert.deepEqual(
      operations.map(({ operation }) => operation),
      [
        'SESSION_CANCEL',
        'SESSION_START',
        'SESSION_START_REPLAY',
        'SESSION_STALE_VERSION',
        'SESSION_CANCEL',
      ],
    );
    assert.match(operations[0]?.requestId ?? '', /^sb-src-/u);
    assert.match(operations[1]?.requestId ?? '', /^sb-ss-/u);
    assert.match(operations[4]?.requestId ?? '', /^sb-sc-/u);
  });

  it('permits destructive database tests only on the dedicated confirmed loopback target', () => {
    const safeUrl =
      'postgresql://bnbu_test:synthetic-only@127.0.0.1:55432/bnbu_sports_test?schema=public';
    assert.equal(
      requireTestDatabaseUrl({
        TEST_DATABASE_URL: safeUrl,
        TEST_DATABASE_RESET_CONFIRMATION,
      }),
      safeUrl,
    );
    for (const environment of [
      { TEST_DATABASE_URL: safeUrl },
      {
        TEST_DATABASE_URL:
          'postgresql://bnbu_test:synthetic-only@10.0.0.10:5432/bnbu_sports_test?schema=public',
        TEST_DATABASE_RESET_CONFIRMATION,
      },
      {
        TEST_DATABASE_URL:
          'postgresql://sports_staging_app:synthetic-only@127.0.0.1:55432/bnbu_sports_test?schema=public',
        TEST_DATABASE_RESET_CONFIRMATION,
      },
      {
        TEST_DATABASE_URL:
          'postgresql://bnbu_test:synthetic-only@127.0.0.1:55432/sports_staging_pg_01?schema=public',
        TEST_DATABASE_RESET_CONFIRMATION,
      },
      {
        TEST_DATABASE_URL: `${safeUrl}&sslmode=disable`,
        TEST_DATABASE_RESET_CONFIRMATION,
      },
    ]) {
      assert.throws(() => requireTestDatabaseUrl(environment));
    }
  });

  it('confines presigned uploads to the staging bucket media image prefix', () => {
    const organizationId = '00000000-0000-0000-0000-000000000001';
    const mediaId = '00000000-0000-0000-0000-000000000002';
    const valid =
      'https://sports-staging-media-1443273655.cos.ap-guangzhou.myqcloud.com/media/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/image?synthetic-signature=redacted';
    assert.doesNotThrow(() => validateCosUploadUrl(valid, organizationId, mediaId));
    assert.throws(
      () =>
        validateCosUploadUrl(
          'https://sports-staging-media-1443273655.cos.ap-guangzhou.myqcloud.com/exports/00000000-0000-0000-0000-000000000001',
          organizationId,
          mediaId,
        ),
      isFailure('COS_UPLOAD_URL_BOUNDARY_MISMATCH'),
    );
    assert.throws(
      () =>
        validateCosUploadUrl(
          'https://other-bucket.cos.ap-guangzhou.myqcloud.com/media/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000002/image',
          organizationId,
          mediaId,
        ),
      isFailure('COS_UPLOAD_URL_BOUNDARY_MISMATCH'),
    );
    assert.throws(
      () =>
        validateCosUploadUrl(
          'https://sports-staging-media-1443273655.cos.ap-guangzhou.myqcloud.com/media/00000000-0000-0000-0000-000000000001/00000000-0000-0000-0000-000000000003/image',
          organizationId,
          mediaId,
        ),
      isFailure('COS_UPLOAD_URL_BOUNDARY_MISMATCH'),
    );
  });

  it('requires staging, exact confirmation, an absolute secret path and the canonical HTTPS API', () => {
    const fixtureSecretFile = resolve('synthetic-business-fixture.json');
    const environment: NodeJS.ProcessEnv = {
      APP_ENV: 'staging',
      STAGING_BUSINESS_CONFIRMATION,
      STAGING_BUSINESS_FIXTURE_SECRET_FILE: fixtureSecretFile,
      STAGING_BUSINESS_PUBLIC_BASE_URL,
      STAGING_QR_PATH_LOG_REDACTION_CONFIRMED: STAGING_QR_PATH_LOG_REDACTION_CONFIRMATION,
    };

    assert.deepEqual(validateStagingBusinessOperatorControls(environment, 'bootstrap'), {
      fixtureSecretFile,
      publicBaseUrl: STAGING_BUSINESS_PUBLIC_BASE_URL,
    });
    assert.deepEqual(validateStagingBusinessOperatorControls(environment, 'run'), {
      fixtureSecretFile,
      publicBaseUrl: STAGING_BUSINESS_PUBLIC_BASE_URL,
    });

    assert.throws(
      () =>
        validateStagingBusinessOperatorControls(
          { ...environment, STAGING_QR_PATH_LOG_REDACTION_CONFIRMED: 'NOT_CONFIRMED' },
          'run',
        ),
      isFailure('QR_PATH_LOG_REDACTION_NOT_CONFIRMED'),
    );

    assert.throws(
      () =>
        validateStagingBusinessOperatorControls({ ...environment, APP_ENV: 'production' }, 'run'),
      isFailure('APP_ENV_NOT_STAGING'),
    );
    assert.throws(
      () =>
        validateStagingBusinessOperatorControls(
          { ...environment, STAGING_BUSINESS_CONFIRMATION: 'wrong' },
          'run',
        ),
      isFailure('BUSINESS_CONFIRMATION_MISMATCH'),
    );
    assert.throws(
      () =>
        validateStagingBusinessOperatorControls(
          { ...environment, STAGING_BUSINESS_FIXTURE_SECRET_FILE: 'relative-fixture.json' },
          'bootstrap',
        ),
      isFailure('BUSINESS_FIXTURE_SECRET_PATH_INVALID'),
    );
    assert.throws(
      () =>
        validateStagingBusinessOperatorControls(
          {
            ...environment,
            STAGING_BUSINESS_PUBLIC_BASE_URL: 'http://127.0.0.1:3000/api/v1',
          },
          'run',
        ),
      isFailure('BUSINESS_PUBLIC_BASE_URL_MISMATCH'),
    );
  });

  it('loads exactly the isolated fixture keys without exposing rejected values', async () => {
    const loaded = await loadStagingBusinessFixtureSecret(
      '/run/secrets/synthetic-business.json',
      secretDependencies(
        Buffer.from(
          JSON.stringify({
            STAGING_BUSINESS_ADMIN_PASSWORD: SYNTHETIC_ADMIN_PASSWORD,
            STAGING_BUSINESS_TEACHER_PASSWORD: SYNTHETIC_TEACHER_PASSWORD,
            STAGING_BUSINESS_STUDENT_EMAIL: SYNTHETIC_STUDENT_EMAIL,
          }),
        ),
      ),
    );
    assert.deepEqual(loaded, {
      adminPassword: SYNTHETIC_ADMIN_PASSWORD,
      teacherPassword: SYNTHETIC_TEACHER_PASSWORD,
      studentEmail: SYNTHETIC_STUDENT_EMAIL,
    });

    const rejectedValue = 'synthetic-value-that-must-not-appear-in-errors';
    await assert.rejects(
      loadStagingBusinessFixtureSecret(
        '/run/secrets/synthetic-business.json',
        secretDependencies(
          Buffer.from(
            JSON.stringify({
              STAGING_BUSINESS_ADMIN_PASSWORD: SYNTHETIC_ADMIN_PASSWORD,
              STAGING_BUSINESS_TEACHER_PASSWORD: SYNTHETIC_TEACHER_PASSWORD,
              STAGING_BUSINESS_STUDENT_EMAIL: SYNTHETIC_STUDENT_EMAIL,
              UNEXPECTED: rejectedValue,
            }),
          ),
        ),
      ),
      (error) =>
        isFailure('BUSINESS_FIXTURE_SECRET_KEYS_INVALID')(error) &&
        error instanceof Error &&
        !error.message.includes(rejectedValue),
    );
  });

  it('rejects non-isolated passwords, reserved mailboxes, oversized input and invalid UTF-8', async () => {
    const encoded = (overrides: Record<string, unknown> = {}): Buffer =>
      Buffer.from(
        JSON.stringify({
          STAGING_BUSINESS_ADMIN_PASSWORD: SYNTHETIC_ADMIN_PASSWORD,
          STAGING_BUSINESS_TEACHER_PASSWORD: SYNTHETIC_TEACHER_PASSWORD,
          STAGING_BUSINESS_STUDENT_EMAIL: SYNTHETIC_STUDENT_EMAIL,
          ...overrides,
        }),
      );

    await assert.rejects(
      loadStagingBusinessFixtureSecret(
        '/synthetic.json',
        secretDependencies(
          encoded({ STAGING_BUSINESS_TEACHER_PASSWORD: SYNTHETIC_ADMIN_PASSWORD }),
        ),
      ),
      isFailure('BUSINESS_FIXTURE_PASSWORDS_NOT_ISOLATED'),
    );
    await assert.rejects(
      loadStagingBusinessFixtureSecret(
        '/synthetic.json',
        secretDependencies(encoded({ STAGING_BUSINESS_STUDENT_EMAIL: 'student@example.com' })),
      ),
      isFailure('CONTROLLED_MAILBOX_NOT_DELIVERABLE'),
    );
    await assert.rejects(
      loadStagingBusinessFixtureSecret(
        '/synthetic.json',
        secretDependencies(Buffer.alloc(8 * 1024 + 1)),
      ),
      isFailure('BUSINESS_FIXTURE_SECRET_TOO_LARGE'),
    );
    await assert.rejects(
      loadStagingBusinessFixtureSecret(
        '/synthetic.json',
        secretDependencies(Uint8Array.from([0xff])),
      ),
      isFailure('BUSINESS_FIXTURE_SECRET_NOT_UTF8'),
    );
  });

  it('fails closed unless the fixture secret is a root-owned 0640 regular file for gid 10001', async () => {
    const bytes = Buffer.from(
      JSON.stringify({
        STAGING_BUSINESS_ADMIN_PASSWORD: SYNTHETIC_ADMIN_PASSWORD,
        STAGING_BUSINESS_TEACHER_PASSWORD: SYNTHETIC_TEACHER_PASSWORD,
        STAGING_BUSINESS_STUDENT_EMAIL: SYNTHETIC_STUDENT_EMAIL,
      }),
    );
    for (const metadata of [
      { uid: 1 },
      { gid: 1 },
      { mode: 0o100644 },
      { isFile: false },
      { isSymbolicLink: true },
    ]) {
      await assert.rejects(
        loadStagingBusinessFixtureSecret('/synthetic.json', secretDependencies(bytes, metadata)),
        isFailure('BUSINESS_FIXTURE_SECRET_PERMISSIONS_INVALID'),
      );
    }
  });

  it('accepts OTP only through the injected hidden-input boundary', async () => {
    let reads = 0;
    const otp = await readHiddenOtp({
      readFromTty: () => {
        reads += 1;
        return Promise.resolve('654321');
      },
    });
    assert.equal(otp, '654321');
    assert.equal(reads, 1);

    await assert.rejects(
      readHiddenOtp({ readFromTty: () => Promise.resolve('not-an-otp') }),
      isFailure('CONTROLLED_MAILBOX_OTP_INVALID'),
    );
  });

  it('accepts only the staging CVM-role, TEST_SIGNATURE worker and Tencent SES runtime boundary', () => {
    assert.doesNotThrow(() => validateStagingBusinessRuntimeBoundary(runtimeBoundaryConfig()));

    const production = runtimeBoundaryConfig();
    production.appEnvironment = 'production';
    assert.throws(
      () => validateStagingBusinessRuntimeBoundary(production),
      isFailure('RUNTIME_NOT_STAGING'),
    );

    const productionDatabase = runtimeBoundaryConfig();
    productionDatabase.databaseUrl =
      'postgresql://sports_staging_app:synthetic-database-password@10.0.0.99:5432/production?schema=public';
    assert.throws(
      () => validateStagingDatabaseTarget(productionDatabase),
      isFailure('STAGING_DATABASE_BOUNDARY_MISMATCH'),
    );

    const migratorCredential = runtimeBoundaryConfig();
    migratorCredential.databaseUrl =
      'postgresql://sports_staging_admin:synthetic-database-password@10.0.0.10:5432/sports_staging_pg_01?schema=public';
    assert.throws(
      () => validateStagingDatabaseTarget(migratorCredential),
      isFailure('STAGING_DATABASE_BOUNDARY_MISMATCH'),
    );

    const unexpectedCors = runtimeBoundaryConfig();
    unexpectedCors.corsAllowlist = new Set(['https://unexpected.verityai.cn']);
    assert.throws(
      () => validateStagingBusinessRuntimeBoundary(unexpectedCors),
      isFailure('STAGING_CORS_BOUNDARY_MISMATCH'),
    );

    const staticObjectStorage = runtimeBoundaryConfig();
    if (staticObjectStorage.objectStorage === null) assert.fail('expected object storage');
    staticObjectStorage.objectStorage.credentials = {
      provider: 'STATIC',
      accessKey: 'synthetic-access-key',
      secretKey: 'synthetic-secret-key-only',
    };
    assert.throws(
      () => validateStagingBusinessRuntimeBoundary(staticObjectStorage),
      isFailure('STAGING_OBJECT_STORAGE_BOUNDARY_MISMATCH'),
    );

    const foreignEndpoint = runtimeBoundaryConfig();
    if (foreignEndpoint.objectStorage === null) assert.fail('expected object storage');
    foreignEndpoint.objectStorage.endpoint = 'https://cos.synthetic.invalid';
    assert.throws(
      () => validateStagingBusinessRuntimeBoundary(foreignEndpoint),
      isFailure('STAGING_OBJECT_STORAGE_BOUNDARY_MISMATCH'),
    );

    const externalScanner = runtimeBoundaryConfig();
    if (externalScanner.media === null) assert.fail('expected media configuration');
    externalScanner.media.scannerMode = 'EXTERNAL_REQUIRED';
    assert.throws(
      () => validateStagingBusinessRuntimeBoundary(externalScanner),
      isFailure('STAGING_MEDIA_BOUNDARY_MISMATCH'),
    );

    const stoppedWorker = runtimeBoundaryConfig();
    if (stoppedWorker.media === null) assert.fail('expected media configuration');
    stoppedWorker.media.workerEnabled = false;
    assert.throws(
      () => validateStagingBusinessRuntimeBoundary(stoppedWorker),
      isFailure('STAGING_MEDIA_BOUNDARY_MISMATCH'),
    );

    const smtp = runtimeBoundaryConfig();
    smtp.emailDelivery = {
      provider: 'SMTP',
      host: 'smtp.synthetic.invalid',
      port: 465,
      secure: true,
      username: null,
      password: null,
      fromAddress: 'no-reply@synthetic.invalid',
    };
    assert.throws(
      () => validateStagingBusinessRuntimeBoundary(smtp),
      isFailure('STAGING_EMAIL_BOUNDARY_MISMATCH'),
    );

    const wrongSesTemplate = runtimeBoundaryConfig();
    if (wrongSesTemplate.emailDelivery?.provider !== 'TENCENT_SES') {
      assert.fail('expected Tencent SES configuration');
    }
    wrongSesTemplate.emailDelivery.templateId = 1;
    assert.throws(
      () => validateStagingBusinessRuntimeBoundary(wrongSesTemplate),
      isFailure('STAGING_EMAIL_BOUNDARY_MISMATCH'),
    );
  });
});
