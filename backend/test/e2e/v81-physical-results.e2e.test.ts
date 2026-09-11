import { required } from '../helpers/required.js';
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
import { seedExerciseSessionStudent } from '../helpers/exercise-session.js';
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

describe('V81 physical result HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
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
    key?: string,
  ): RequestInit => ({
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(key === undefined ? {} : { 'idempotency-key': key }),
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
      kind: 'SUPER', permissions: [], mustChangePassword: false,
    } });
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

  const tokenFor = async (userId: string, role: 'STUDENT' | 'ADMIN'): Promise<string> => {
    const session = await prisma.authSession.findFirstOrThrow({ where: { userId } });
    const seconds = Math.floor(Date.now() / 1000);
    return new SignJWT({
      organizationId: session.organizationId,
      role,
      sessionId: session.id,
      tokenVersion: 0,
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setSubject(userId)
      .setJti(uuidv7())
      .setIssuer('bnbu-sports-test')
      .setAudience('bnbu-sports-test-clients')
      .setIssuedAt(seconds)
      .setExpirationTime(seconds + 600)
      .sign(await importPKCS8(TEST_PRIVATE_KEY, 'EdDSA'));
  };

  const data = (result: HttpResult, status = 200) => {
    assert.equal(result.status, status, JSON.stringify(result.body));
    return object(result.body.data);
  };

  for (const [gender, runType] of [['MALE', '1000m'], ['FEMALE', '800m']] as const) {
    it(`records ${runType} raw facts with immutable history, concurrency and student privacy`, async () => {
      const student = await seedExerciseSessionStudent(prisma, fixture, `PHY-${gender}`);
      await prisma.studentProfile.update({ where: { id: student.studentId }, data: { gender } });
      const own = await tokenFor(student.userId, 'STUDENT');
      const teacher = await login(fixture.teacherEmail);
      const otherTeacher = await login(fixture.teacherBEmail);
      const admin = await login(fixture.adminEmail);
      const path = `/api/v1/enrollments/${student.enrollmentId}/physical-results`;
      const studentPath = `/api/v1/student/enrollments/${student.enrollmentId}/physical-result`;
      assert.deepEqual(data(await request(studentPath, authenticated(own))), { status: 'NOT_RECORDED', result: null });
      assert.deepEqual(data(await request(path, authenticated(teacher))).items, []);
      const input = { runType, elapsedSeconds: 270, testedOn: '2026-09-07', expectedVersion: 0 };
      const post = (body: Record<string, unknown>, access = teacher, key = uuidv7()) => request(path, authenticated(access, 'POST', body, key));
      for (const body of [{ ...input, runType: runType === '800m' ? '1000m' : '800m' },
        { ...input, elapsedSeconds: -1 }, { ...input, elapsedSeconds: 1.5 }, { ...input, testedOn: '2026-02-30' },
        { ...input, testedOn: '2999-01-01' }]) {
        assert.equal((await post(body)).status, 422);
      }
      assert.equal((await post(input, own)).status, 403);
      assert.equal((await post(input, admin)).status, 403);
      assert.equal((await post(input, otherTeacher)).status, 404);
      assert.equal((await request(path, authenticated(otherTeacher))).status, 404);
      assert.deepEqual(data(await request(path, authenticated(teacher))).items, []);
      const key = uuidv7();
      const first = data(await post(input, teacher, key), 201);
      assert.deepEqual(data(await post(input, teacher, key), 201), first);
      assert.equal(first.version, 1);
      const race = await Promise.all([post({ ...input, elapsedSeconds: 271, expectedVersion: 1 }),
        post({ ...input, elapsedSeconds: 272, expectedVersion: 1 })]);
      assert.deepEqual(race.map(result => result.status).sort(), [201, 409]);
      const winner = data(race.find(result => result.status === 201)!, 201);
      const current = data(await request(studentPath, authenticated(own)));
      assert.equal(current.status, 'RECORDED');
      assert.deepEqual(current.result, { version: 2, runType, elapsedSeconds: winner.elapsedSeconds, testedOn: input.testedOn });
      assert.doesNotMatch(JSON.stringify(current), /actorId|studentNumber|fullName|createdAt|score|grade/);
      const latest = data(await request(`${path}?limit=1`, authenticated(teacher)));
      assert.equal(required((latest.items as Record<string, unknown>[])[0]).version, 2);
      assert.equal(latest.nextBeforeVersion, 2);
      const previous = data(await request(`${path}?limit=1&beforeVersion=2`, authenticated(teacher)));
      assert.deepEqual(previous.items, [first]);
      assert.equal(previous.nextBeforeVersion, null);
      assert.equal((await request(studentPath, authenticated(teacher))).status, 403);
      const other = await seedExerciseSessionStudent(prisma, fixture, `OTH-${gender}`);
      assert.equal((await request(studentPath, authenticated(await tokenFor(other.userId, 'STUDENT')))).status, 404);
      const rows = await prisma.$queryRaw<{ version: number }[]>`SELECT version FROM v81_physical_result_revisions WHERE enrollment_id=${student.enrollmentId}::uuid ORDER BY version`;
      assert.deepEqual(rows.map(row => row.version), [1, 2]);
      const audit = await prisma.$queryRaw<{ event_outcome: string; actor_role_snapshot: string }[]>`
        SELECT event_outcome,actor_role_snapshot FROM v81_events
        WHERE resource_type='PHYSICAL_RESULT' AND resource_id=${student.enrollmentId}::uuid ORDER BY version`;
      assert.deepEqual(audit, [
        { event_outcome: 'SUCCEEDED', actor_role_snapshot: 'TEACHER' },
        { event_outcome: 'SUCCEEDED', actor_role_snapshot: 'TEACHER' },
      ]);
      assert.equal(await prisma.notification.count({ where: { targetId: student.enrollmentId, notificationType: 'RAW_ENDURANCE_RESULT' } }), 2);
    });
  }
});
