import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ValidationPipe } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import { validateEnvironment } from '../../src/common/config/environment.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import { BodyParserErrorMiddleware } from '../../src/common/http/body-parser-error.middleware.js';
import type { FoundationRequest } from '../../src/common/http/request-context.js';
import { validationException } from '../../src/common/http/validation.js';
import { redactSensitive } from '../../src/common/logging/redaction.js';
import { AccessPolicyGuard } from '../../src/common/policy/access-policy.guard.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { FixedClock } from '../../src/common/time/clock.js';
import { operationPolicies } from '../../src/generated/operation-policies.generated.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { AccessTokenGuard } from '../../src/modules/auth/access-token.guard.js';
import type { TokenService } from '../../src/modules/auth/token.service.js';
import { PrismaClassSectionRepository } from '../../src/modules/class-sections/infrastructure/prisma-class-section.repository.js';
import {
  ClassSectionListQueryDto,
  CreateClassSectionRequestDto,
  UpdateClassSectionRequestDto,
} from '../../src/modules/class-sections/interface/http/class-sections.dto.js';
import { CreateCourseRequestDto } from '../../src/modules/courses/interface/http/courses.dto.js';
import { foundationEnvironment } from '../helpers/test-environment.js';

function context(handler: () => void, request: Partial<FoundationRequest>): never {
  return {
    getHandler: () => handler,
    getClass: () => class SecurityController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as never;
}

describe('security negative gates', () => {
  it('rejects placeholders and malformed production configuration', () => {
    const raw = foundationEnvironment(
      'postgresql://synthetic:synthetic@127.0.0.1:1/bnbu_security_test',
      3000,
    );
    raw.APP_ENV = 'production';
    raw.TOKEN_SIGNING_KEY = 'CHANGE_ME_PRIVATE_KEY';
    assert.throws(() => validateEnvironment(raw), /TOKEN_SIGNING_KEY/);

    raw.TOKEN_SIGNING_KEY = 'not-a-pem';
    assert.throws(() => validateEnvironment(raw), /PEM-encoded private key/);
  });

  it('fails closed when staging email delivery is absent or unauthenticated', () => {
    const raw = foundationEnvironment(
      'postgresql://synthetic:synthetic@127.0.0.1:1/bnbu_security_test',
      3000,
    );
    raw.APP_ENV = 'staging';
    raw.CORS_ALLOWLIST = 'https://web-origin-not-configured.invalid';
    useCvmRoleStorage(raw);
    delete raw.SMTP_HOST;
    delete raw.SMTP_PORT;
    delete raw.SMTP_FROM_ADDRESS;
    delete raw.SMTP_USERNAME;
    delete raw.SMTP_PASSWORD;
    delete raw.EMAIL_DELIVERY_PROVIDER;
    assert.throws(() => validateEnvironment(raw), /EMAIL_DELIVERY_PROVIDER/);

    raw.EMAIL_DELIVERY_PROVIDER = 'SMTP';
    raw.SMTP_HOST = 'smtp.example.test';
    raw.SMTP_PORT = '587';
    raw.SMTP_SECURE = 'false';
    raw.SMTP_FROM_ADDRESS = 'no-reply@example.test';
    assert.throws(() => validateEnvironment(raw), /SMTP credentials are required/);
  });

  it('allows an isolated unauthenticated SMTP sink only for local development', () => {
    const raw = foundationEnvironment(
      'postgresql://synthetic:synthetic@127.0.0.1:1/bnbu_security_test',
      3000,
    );
    raw.APP_ENV = 'local';
    raw.EMAIL_DELIVERY_PROVIDER = 'SMTP';
    raw.SMTP_HOST = '127.0.0.1';
    raw.SMTP_PORT = '1025';
    raw.SMTP_SECURE = 'false';
    raw.SMTP_FROM_ADDRESS = 'no-reply@local.bnbu.invalid';
    delete raw.SMTP_USERNAME;
    delete raw.SMTP_PASSWORD;
    const config = validateEnvironment(raw).RUNTIME_CONFIG as {
      emailDelivery: { username: string | null; password: string | null } | null;
    };
    assert.deepEqual(config.emailDelivery, {
      provider: 'SMTP',
      host: '127.0.0.1',
      port: 1025,
      secure: false,
      username: null,
      password: null,
      fromAddress: 'no-reply@local.bnbu.invalid',
    });
  });

  it('accepts explicit Tencent SES template configuration without static cloud credentials', () => {
    const raw = foundationEnvironment(
      'postgresql://synthetic:synthetic@127.0.0.1:1/bnbu_security_test',
      3000,
    );
    raw.APP_ENV = 'staging';
    raw.CORS_ALLOWLIST = 'https://web-origin-not-configured.invalid';
    useCvmRoleStorage(raw);
    raw.EMAIL_DELIVERY_PROVIDER = 'TENCENT_SES';
    raw.TENCENT_SES_REGION = 'ap-guangzhou';
    raw.TENCENT_SES_FROM_EMAIL = 'no-reply@verityai.cn';
    raw.TENCENT_SES_TEMPLATE_ID = '56852';
    raw.TENCENT_SES_TEMPLATE_CODE_VARIABLE = 'code';
    const config = validateEnvironment(raw).RUNTIME_CONFIG as {
      emailDelivery: Record<string, unknown> | null;
    };
    assert.deepEqual(config.emailDelivery, {
      provider: 'TENCENT_SES',
      region: 'ap-guangzhou',
      fromAddress: 'no-reply@verityai.cn',
      replyToAddress: null,
      templateId: 56_852,
      templateVariables: {
        code: 'code',
        expiryMinutes: null,
        purpose: null,
      },
    });
  });

  it('requires CVM role storage and rejects static COS credentials in staging', () => {
    const raw = foundationEnvironment(
      'postgresql://synthetic:synthetic@127.0.0.1:1/bnbu_security_test',
      3000,
    );
    raw.APP_ENV = 'staging';
    raw.CORS_ALLOWLIST = 'https://web-origin-not-configured.invalid';
    raw.EMAIL_DELIVERY_PROVIDER = 'TENCENT_SES';
    raw.TENCENT_SES_REGION = 'ap-guangzhou';
    raw.TENCENT_SES_FROM_EMAIL = 'no-reply@verityai.cn';
    raw.TENCENT_SES_TEMPLATE_ID = '56852';
    raw.TENCENT_SES_TEMPLATE_CODE_VARIABLE = 'code';
    assert.throws(() => validateEnvironment(raw), /must be TENCENT_CVM_ROLE/);

    useCvmRoleStorage(raw);
    raw.MEDIA_STORAGE_SECRET_KEY = 'must-not-be-accepted-in-staging';
    assert.throws(
      () => validateEnvironment(raw),
      /Static object storage credentials must be omitted/,
    );
  });

  it('requires exact HTTPS CORS origins in staging while retaining HTTP support for tests', () => {
    const raw = foundationEnvironment(
      'postgresql://synthetic:synthetic@127.0.0.1:1/bnbu_security_test',
      3000,
    );
    assert.doesNotThrow(() => validateEnvironment(raw));

    raw.APP_ENV = 'staging';
    raw.CORS_ALLOWLIST = 'http://129.204.146.192';
    useCvmRoleStorage(raw);
    raw.EMAIL_DELIVERY_PROVIDER = 'TENCENT_SES';
    raw.TENCENT_SES_REGION = 'ap-guangzhou';
    raw.TENCENT_SES_FROM_EMAIL = 'no-reply@verityai.cn';
    raw.TENCENT_SES_TEMPLATE_ID = '56852';
    raw.TENCENT_SES_TEMPLATE_CODE_VARIABLE = 'code';
    assert.throws(
      () => validateEnvironment(raw),
      /CORS_ALLOWLIST entries must use HTTPS in staging and production/,
    );

    raw.CORS_ALLOWLIST = 'https://web-origin-not-configured.invalid';
    assert.doesNotThrow(() => validateEnvironment(raw));
  });

  it('rejects a forged role or organization even when token verification succeeds', async () => {
    const handler = (): void => undefined;
    Reflect.defineMetadata(OPERATION_ID_METADATA, 'getCurrentUser', handler);
    const request = {
      headers: { authorization: 'Bearer signed-token' },
    } as Partial<FoundationRequest>;
    const tokenService = {
      verify: () =>
        Promise.resolve({
          userId: 'user-1',
          organizationId: 'org-forged',
          role: 'ADMIN',
          sessionId: 'session-1',
          tokenVersion: 0,
          jti: 'jti-1',
        }),
    } as unknown as TokenService;
    const prisma = {
      authSession: {
        findUnique: () =>
          Promise.resolve({
            id: 'session-1',
            organizationId: 'org-real',
            userId: 'user-1',
            status: 'ACTIVE',
            absoluteExpiresAt: new Date('2026-08-03T00:00:00.000Z'),
            idleExpiresAt: new Date('2026-08-03T00:00:00.000Z'),
            user: {
              id: 'user-1',
              organizationId: 'org-real',
              role: 'TEACHER',
              status: 'ACTIVE',
              tokenVersion: 0,
              deletedAt: null,
            },
            organization: { id: 'org-real', status: 'ACTIVE' },
          }),
      },
    } as unknown as PrismaService;
    const guard = new AccessTokenGuard(
      new Reflector(),
      tokenService,
      prisma,
      new FixedClock(new Date('2026-08-02T00:00:00.000Z')),
    );
    await assert.rejects(
      guard.canActivate(context(handler, request)),
      (error: unknown) => error instanceof ApplicationError && error.code === 'AUTH_TOKEN_INVALID',
    );
  });

  it('returns a five-field envelope for oversized or malformed bodies without echoing content', () => {
    const middleware = new BodyParserErrorMiddleware(
      new FixedClock(new Date('2026-08-02T00:00:00.000Z')),
    );
    const request = { requestId: 'req-security' } as FoundationRequest;
    let body: Record<string, unknown> = {};
    let status = 0;
    middleware.use(
      { type: 'entity.too.large', password: 'must-never-echo' },
      request,
      {
        status: (value: number) => {
          status = value;
          return { json: (valueBody: Record<string, unknown>) => (body = valueBody) };
        },
      } as never,
      () => assert.fail('Known body-parser errors must be handled'),
    );
    assert.equal(status, 422);
    assert.deepEqual(Object.keys(body).sort(), [
      'code',
      'details',
      'message',
      'requestId',
      'timestamp',
    ]);
    assert.equal(JSON.stringify(body).includes('must-never-echo'), false);
  });

  it('redacts every frozen sensitive field without leaking nested values', () => {
    const secrets = {
      authorization: 'Bearer token',
      cookie: 'session=secret',
      accessToken: 'access',
      refreshToken: 'refresh',
      password: 'password',
      verificationCode: '123456',
      inviteToken: 'invite',
      joinCapability: 'join',
      signedUrl: 'https://signed.invalid',
      storageKey: 'private/key',
      primaryEmail: 'person@example.edu',
      primaryPhone: '+15555555555',
      studentNumber: '00123456',
      internalNote: 'private note',
      fileBody: 'binary',
      rawRosterRow: 'raw row',
      sourceFileStorageKey: 'private/roster.csv',
      sourceChecksumSha256: 'a'.repeat(64),
      fileName: 'private-roster.csv',
      fieldMappingSnapshot: { studentNumber: 'Student Number' },
      rawStudentNumberSafe: '00123456',
      normalizedStudentNumber: '00123456',
      rawRowSnapshotSafe: { studentNumber: '00123456' },
      subjectKey: 'OFFICIAL:00123456',
      officialValue: 'Synthetic Student',
      platformValue: 'Synthetic Student',
    };
    const result = redactSensitive({ nested: secrets }) as {
      nested: Record<string, unknown>;
    };
    for (const key of Object.keys(secrets)) assert.equal(result.nested[key], '[REDACTED]');
  });

  it('fails closed for unknown operation policies and unsupported resource resolvers', async () => {
    const reflector = new Reflector();
    const unknownHandler = (): void => undefined;
    Reflect.defineMetadata(OPERATION_ID_METADATA, 'syntheticUnknownOperation', unknownHandler);
    const request = {
      headers: {},
      principal: {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'ADMIN',
        sessionId: 'session-1',
        tokenVersion: 0,
        jti: 'jti-1',
      },
    } as Partial<FoundationRequest>;
    await assert.rejects(
      new AccessPolicyGuard(reflector).canActivate(context(unknownHandler, request)),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === 'SYSTEM_DATA_INTEGRITY_ERROR' &&
        error.details.invariant === 'OPERATION_POLICY_UNKNOWN',
    );

    const handler = (): void => undefined;
    Reflect.defineMetadata(OPERATION_ID_METADATA, 'listCourses', handler);
    const mutablePolicies = operationPolicies as unknown as Record<
      string,
      { resourceResolver: string }
    >;
    const listCoursesPolicy = mutablePolicies.listCourses;
    if (listCoursesPolicy === undefined) assert.fail('listCourses policy must exist');
    const originalResolver = listCoursesPolicy.resourceResolver;
    listCoursesPolicy.resourceResolver = 'SYNTHETIC_UNKNOWN_RESOLVER';
    try {
      await assert.rejects(
        new AccessPolicyGuard(reflector).canActivate(context(handler, request)),
        (error: unknown) =>
          error instanceof ApplicationError &&
          error.code === 'SYSTEM_DATA_INTEGRITY_ERROR' &&
          error.details.invariant === 'IMPLEMENTED_POLICY_METADATA_UNSUPPORTED',
      );
    } finally {
      listCoursesPolicy.resourceResolver = originalResolver;
    }
  });

  it('accepts only the frozen Stage 13 roster resolver identifiers', async () => {
    const reflector = new Reflector();
    const request = {
      headers: {},
      principal: {
        userId: 'user-1',
        organizationId: 'org-1',
        role: 'TEACHER',
        sessionId: 'session-1',
        tokenVersion: 0,
        jti: 'jti-1',
      },
    } as Partial<FoundationRequest>;
    const operationIds = [
      'listRosterImports',
      'getRosterImport',
      'rollbackRosterImport',
      'listRosterAlignmentResults',
      'getRosterAlignmentResult',
      'confirmRosterAlignmentResult',
    ] as const;

    for (const operationId of operationIds) {
      const handler = (): void => undefined;
      Reflect.defineMetadata(OPERATION_ID_METADATA, operationId, handler);
      assert.equal(
        await new AccessPolicyGuard(reflector).canActivate(context(handler, request)),
        true,
      );
    }
  });

  it('rejects an otherwise valid access token after its session is revoked', async () => {
    const handler = (): void => undefined;
    Reflect.defineMetadata(OPERATION_ID_METADATA, 'getCurrentUser', handler);
    const tokenService = {
      verify: () =>
        Promise.resolve({
          userId: 'user-1',
          organizationId: 'org-1',
          role: 'TEACHER',
          sessionId: 'session-1',
          tokenVersion: 0,
          jti: 'jti-1',
        }),
    } as unknown as TokenService;
    const prisma = {
      authSession: {
        findUnique: () =>
          Promise.resolve({
            id: 'session-1',
            organizationId: 'org-1',
            userId: 'user-1',
            status: 'REVOKED',
            absoluteExpiresAt: new Date('2026-08-04T00:00:00.000Z'),
            idleExpiresAt: new Date('2026-08-04T00:00:00.000Z'),
            user: {
              id: 'user-1',
              organizationId: 'org-1',
              role: 'TEACHER',
              status: 'ACTIVE',
              tokenVersion: 0,
              deletedAt: null,
            },
            organization: { id: 'org-1', status: 'ACTIVE' },
          }),
      },
    } as unknown as PrismaService;
    const guard = new AccessTokenGuard(
      new Reflector(),
      tokenService,
      prisma,
      new FixedClock(new Date('2026-08-03T00:00:00.000Z')),
    );
    await assert.rejects(
      guard.canActivate(
        context(handler, {
          headers: { authorization: 'Bearer signed-token' },
        }),
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'AUTH_SESSION_REVOKED',
    );
  });

  it('rejects organization, teacher, course, and query mass assignment at the DTO boundary', async () => {
    const pipe = new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
      forbidUnknownValues: true,
      exceptionFactory: validationException,
    });
    const rejected = async (value: Record<string, unknown>, metatype: new () => object) => {
      await assert.rejects(
        pipe.transform(value, { type: 'body', metatype }),
        (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_FAILED',
      );
    };
    await rejected(
      {
        courseCode: 'SYNTH-SEC-101',
        courseName: 'Synthetic Security Course',
        organizationId: '00000000-0000-7000-8000-000000000001',
      },
      CreateCourseRequestDto,
    );
    await rejected(
      {
        courseId: '00000000-0000-7000-8000-000000000001',
        semesterId: '00000000-0000-7000-8000-000000000002',
        classCode: 'SYNTH-SEC-A',
        displayName: 'Synthetic Security Section',
        teacherId: '00000000-0000-7000-8000-000000000003',
      },
      CreateClassSectionRequestDto,
    );
    await rejected(
      {
        displayName: 'Synthetic Unauthorized Reassignment',
        expectedVersion: 1,
        organizationId: '00000000-0000-7000-8000-000000000001',
        courseId: '00000000-0000-7000-8000-000000000002',
        teacherId: '00000000-0000-7000-8000-000000000003',
      },
      UpdateClassSectionRequestDto,
    );
    await rejected({ teacherId: '00000000-0000-7000-8000-000000000003' }, ClassSectionListQueryDto);
  });

  it('maps database constraint failures without exposing SQL or constraint names', async () => {
    const databaseError = new Prisma.PrismaClientKnownRequestError(
      'Synthetic sensitive SQL constraint class_sections_internal_secret_key',
      {
        code: 'P2003',
        clientVersion: '7.9.1',
        meta: { constraint: 'class_sections_internal_secret_key' },
      },
    );
    const transaction = {
      classSection: { create: () => Promise.reject(databaseError) },
    };
    const repository = new PrismaClassSectionRepository({} as PrismaService);
    await assert.rejects(
      repository.create({} as never, transaction),
      (error: unknown) =>
        error instanceof ApplicationError &&
        error.code === 'VALIDATION_FAILED' &&
        !error.message.includes('class_sections_internal_secret_key') &&
        !JSON.stringify(error.details).includes('class_sections_internal_secret_key'),
    );
  });
});

function useCvmRoleStorage(raw: NodeJS.ProcessEnv): void {
  raw.TENCENTDB_CA_FILE = '/run/secrets/tencentdb-ca-chain.pem';
  raw.STORAGE_CREDENTIAL_PROVIDER = 'TENCENT_CVM_ROLE';
  delete raw.OBJECT_STORAGE_ACCESS_KEY;
  delete raw.OBJECT_STORAGE_SECRET_KEY;
  delete raw.MEDIA_STORAGE_ACCESS_KEY;
  delete raw.MEDIA_STORAGE_SECRET_KEY;
}
