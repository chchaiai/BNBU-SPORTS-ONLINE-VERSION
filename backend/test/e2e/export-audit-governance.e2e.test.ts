import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import { ValidationPipe, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import { importPKCS8, SignJWT } from 'jose';
import { v7 as uuidv7 } from 'uuid';

import type { RuntimeConfig } from '../../src/common/config/environment.js';
import type { BodyParserErrorMiddleware as BodyParserErrorMiddlewareType } from '../../src/common/http/body-parser-error.middleware.js';
import type { RequestIdMiddleware as RequestIdMiddlewareType } from '../../src/common/http/request-id.js';
import type { validationException as ValidationExceptionFactory } from '../../src/common/http/validation.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import {
  seedExerciseSessionStudent,
  type ExerciseSessionStudentFixture,
} from '../helpers/exercise-session.js';
import {
  foundationEnvironment,
  requireTestDatabaseUrl,
  TEST_PASSWORD,
  TEST_PRIVATE_KEY,
} from '../helpers/test-environment.js';

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function compiledModule(relativePath: string): string {
  return pathToFileURL(resolve('dist', relativePath)).href;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return address.port;
}

describe('Stage 19 Export, Audit Read, and governance HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let student: ExerciseSessionStudentFixture;
  let baseUrl: string;

  const request = async (path: string, init: RequestInit = {}): Promise<HttpResult> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
    };
  };

  const authenticated = (
    token: string,
    method = 'GET',
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): RequestInit => ({
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  before(async () => {
    const databaseUrl = requireTestDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    const port = await availablePort();
    Object.assign(process.env, foundationEnvironment(databaseUrl, port));
    const { AppModule } = (await import(compiledModule('app.module.js'))) as {
      AppModule: Type<unknown>;
    };
    const { RUNTIME_CONFIG } = (await import(
      compiledModule('common/config/runtime-config.module.js')
    )) as { RUNTIME_CONFIG: symbol };
    const { RequestIdMiddleware } = (await import(compiledModule('common/http/request-id.js'))) as {
      RequestIdMiddleware: Type<RequestIdMiddlewareType>;
    };
    const { BodyParserErrorMiddleware } = (await import(
      compiledModule('common/http/body-parser-error.middleware.js')
    )) as { BodyParserErrorMiddleware: Type<BodyParserErrorMiddlewareType> };
    const { validationException } = (await import(compiledModule('common/http/validation.js'))) as {
      validationException: typeof ValidationExceptionFactory;
    };
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    const config = app.get<RuntimeConfig>(RUNTIME_CONFIG);
    const requestIds = app.get(RequestIdMiddleware);
    const bodyParserErrors = app.get(BodyParserErrorMiddleware);
    app.use(requestIds.use.bind(requestIds));
    app.use(json({ limit: config.requestBodyLimitBytes, strict: true }));
    app.use(
      urlencoded({ extended: false, limit: config.requestBodyLimitBytes, parameterLimit: 100 }),
    );
    app.use(bodyParserErrors.use.bind(bodyParserErrors));
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        exceptionFactory: validationException,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(port, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${port}`;
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
    await prisma.v81AccountSecurity.createMany({ data:
      [fixture.teacherUserId, fixture.teacherBUserId, fixture.adminUserId].map(userId => ({
        userId, organizationId: fixture.organizationId,
        loginAccount: userId === fixture.adminUserId ? fixture.adminEmail : null,
        mustChangePassword: false, passwordChangedAt: new Date(),
      })) });
    await prisma.v81AdminAccess.create({ data: {
      userId: fixture.adminUserId, organizationId: fixture.organizationId,
      kind: 'SUB', permissions: ['USER_ACCOUNTS', 'COURSE_VIEW', 'AUDIT_QUERY'], mustChangePassword: false,
    } });
    student = await seedExerciseSessionStudent(prisma, fixture, 'GOVERNANCE');
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const login = async (account: string): Promise<string> => {
    const response = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account, password: TEST_PASSWORD }),
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return String(object(response.body.data).accessToken);
  };

  const studentToken = async (): Promise<string> => {
    const seconds = Math.floor(Date.now() / 1000);
    return new SignJWT({
      organizationId: fixture.organizationId,
      role: 'STUDENT',
      sessionId: student.authSessionId,
      tokenVersion: 0,
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setSubject(student.userId)
      .setJti(uuidv7())
      .setIssuer('bnbu-sports-test')
      .setAudience('bnbu-sports-test-clients')
      .setIssuedAt(seconds)
      .setExpirationTime(seconds + 600)
      .sign(await importPKCS8(TEST_PRIVATE_KEY, 'EdDSA'));
  };

  it('enforces role and organization scope for Student and Teacher projections', async () => {
    const admin = await login(fixture.adminEmail);
    const teacherA = await login(fixture.teacherEmail);
    const teacherB = await login(fixture.teacherBEmail);
    const ownStudent = await studentToken();
    for (const token of [admin, teacherA]) {
      const listed = await request('/api/v1/students?limit=20', authenticated(token));
      assert.equal(listed.status, 200, JSON.stringify(listed.body));
      assert.equal((listed.body.data as unknown[]).length, 1);
      assert.equal(
        object((listed.body.data as Record<string, unknown>[])[0]).studentNumber,
        'SYNTH-SESSION-GOVERNANCE',
      );
    }
    const unrelated = await request('/api/v1/students?limit=20', authenticated(teacherB));
    assert.equal((unrelated.body.data as unknown[]).length, 0);
    for (const token of [admin, teacherA, ownStudent]) {
      assert.equal(
        (await request(`/api/v1/students/${student.studentId}`, authenticated(token))).status,
        200,
      );
    }
    assert.equal(
      (await request(`/api/v1/students/${student.studentId}`, authenticated(teacherB))).status,
      404,
    );
    assert.equal(
      (await request(`/api/v1/teachers/${fixture.teacherProfileId}`, authenticated(ownStudent)))
        .status,
      200,
    );
    assert.equal(
      (await request(`/api/v1/teachers/${fixture.teacherBProfileId}`, authenticated(ownStudent)))
        .status,
      404,
    );
  });

  it('denies administrator student-profile mutation without side effects', async () => {
    const admin = await login(fixture.adminEmail);
    const before = {
      audit: await prisma.auditLog.count(),
      outbox: await prisma.outboxEvent.count(),
      version: (await prisma.studentProfile.findUniqueOrThrow({ where: { id: student.studentId } }))
        .version,
    };
    const update = await request(
      `/api/v1/students/${student.studentId}`,
      authenticated(
        admin,
        'PATCH',
        { fullName: 'Changed Synthetic', expectedVersion: 1 },
        uuidv7(),
      ),
    );
    assert.equal(update.status, 403);
    assert.equal(update.body.code, 'PERMISSION_RESOURCE_SCOPE_DENIED');
    assert.equal(await prisma.auditLog.count(), before.audit);
    assert.equal(await prisma.outboxEvent.count(), before.outbox);
    assert.equal(
      (await prisma.studentProfile.findUniqueOrThrow({ where: { id: student.studentId } })).version,
      before.version,
    );
  });

  it('denies unassigned legacy Export operations without persistence', async () => {
    const admin = await login(fixture.adminEmail);
    const exportId = uuidv7();
    const calls: [string, RequestInit][] = [
      ['/api/v1/exports?limit=20', authenticated(admin)],
      [
        '/api/v1/exports',
        authenticated(
          admin,
          'POST',
          { exportType: 'AUDIT_LOGS', filters: {}, purpose: 'Synthetic verification' },
          uuidv7(),
        ),
      ],
      [`/api/v1/exports/${exportId}`, authenticated(admin)],
      [
        `/api/v1/exports/${exportId}/download-url`,
        authenticated(admin, 'POST', { purpose: 'Synthetic verification' }, uuidv7()),
      ],
    ];
    const before = {
      audit: await prisma.auditLog.count(),
      outbox: await prisma.outboxEvent.count(),
    };
    for (const [path, init] of calls) {
      const response = await request(path, init);
      assert.equal(response.status, 403, JSON.stringify(response.body));
      assert.equal(response.body.code, 'PERMISSION_RESOURCE_SCOPE_DENIED');
      assert.equal(response.body.data, undefined);
    }
    assert.equal(await prisma.auditLog.count(), before.audit);
    assert.equal(await prisma.outboxEvent.count(), before.outbox);
    const exportTables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name FROM information_schema.tables
       WHERE table_schema = 'public' AND table_name LIKE 'export%'
    `;
    assert.deepEqual(exportTables, []);
  });

  it('allows only organization ADMIN audit read, redacts recursively, and audits each read', async () => {
    const sourceId = uuidv7();
    const isolationId = uuidv7();
    await prisma.auditLog.createMany({
      data: [
        {
          id: sourceId,
          organizationId: fixture.organizationId,
          actorUserId: fixture.adminUserId,
          actorRoleSnapshot: 'ADMIN',
          permissionId: 'AUTH-PASSWORD-LOGIN',
          actionType: 'AUTHENTICATION_SUCCEEDED',
          targetType: 'USER',
          targetId: fixture.adminUserId,
          requestId: uuidv7(),
          outcome: 'SUCCEEDED',
          safeMetadata: {
            credentialType: {
              kind: 'PASSWORD',
              password: 'synthetic-secret',
              nested: { email: 'synthetic@invalid.test', safe: true },
            },
          },
          occurredAt: new Date(),
        },
        {
          id: isolationId,
          organizationId: fixture.isolationOrganizationId,
          permissionId: 'SYSTEM-READ',
          actionType: 'SYSTEM_MODE_CHANGED',
          targetType: 'ORGANIZATION',
          targetId: fixture.isolationOrganizationId,
          requestId: uuidv7(),
          outcome: 'SUCCEEDED',
          safeMetadata: { previousMode: 'NORMAL', nextMode: 'NORMAL' },
          occurredAt: new Date(),
        },
      ],
    });
    const admin = await login(fixture.adminEmail);
    const teacher = await login(fixture.teacherEmail);
    const denied = await request('/api/v1/audit-logs?limit=20', authenticated(teacher));
    assert.equal(denied.status, 403);
    assert.equal(denied.body.code, 'PERMISSION_AUDIT_SCOPE_DENIED');

    const beforeReads = await prisma.auditLog.count({ where: { actionType: 'AUDIT_LOG_READ' } });
    const listed = await request('/api/v1/audit-logs?limit=20', authenticated(admin));
    assert.equal(listed.status, 200, JSON.stringify(listed.body));
    const listedItem = (listed.body.data as Record<string, unknown>[]).find(
      (item) => item.id === sourceId,
    );
    assert.ok(listedItem);
    const credential = object(object(listedItem.safeMetadata).credentialType);
    assert.equal(credential.password, '[REDACTED]');
    assert.equal(object(credential.nested).email, '[REDACTED]');
    assert.equal(object(credential.nested).safe, true);
    assert.equal(
      await prisma.auditLog.count({ where: { actionType: 'AUDIT_LOG_READ' } }),
      beforeReads + 1,
    );

    const fetched = await request(`/api/v1/audit-logs/${sourceId}`, authenticated(admin));
    assert.equal(fetched.status, 200);
    assert.equal(object(fetched.body.data).id, sourceId);
    assert.equal(
      await prisma.auditLog.count({ where: { actionType: 'AUDIT_LOG_READ' } }),
      beforeReads + 2,
    );
    const crossOrganization = await request(
      `/api/v1/audit-logs/${isolationId}`,
      authenticated(admin),
    );
    assert.equal(crossOrganization.status, 404);
    assert.equal(crossOrganization.body.code, 'PERMISSION_RESOURCE_NOT_FOUND');
  });
});
