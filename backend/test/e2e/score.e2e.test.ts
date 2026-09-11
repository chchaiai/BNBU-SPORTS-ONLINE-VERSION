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
import { seedSubmittedExerciseRecord } from '../helpers/exercise-review.js';
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

describe('Current internal final grade HTTP E2E', () => {
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
      kind: 'SUB', permissions: ['GLOBAL_RULES', 'COURSE_VIEW'], mustChangePassword: false,
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

  it('preserves teacher draft and publication history with replay and student privacy', async () => {
    const record = await seedSubmittedExerciseRecord(prisma, fixture, 'GR-HIST');
    const teacher = await login(fixture.teacherEmail);
    const student = await tokenFor(record.studentUserId, 'STUDENT');
    const persisted = await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: record.recordId } });
    const path = `/api/v1/enrollments/${persisted.enrollmentId}/final-grades`;
    const beforeRecord = await request(`/api/v1/exercise-records/${record.recordId}`, authenticated(student));
    assert.equal(beforeRecord.status, 200);
    const input = { finalGrade: 123, published: false, expectedVersion: 0 };
    const key = uuidv7();
    const draft = await request(path, authenticated(teacher, 'POST', input, key));
    assert.equal(draft.status, 201, JSON.stringify(draft.body));
    const replay = await request(path, authenticated(teacher, 'POST', input, key));
    assert.equal(replay.status, 201);
    assert.deepEqual(replay.body.data, draft.body.data);
    const published = await request(path, authenticated(teacher, 'POST',
      { finalGrade: 125, published: true, expectedVersion: 1 }, uuidv7()));
    assert.equal(published.status, 201, JSON.stringify(published.body));
    const audit = await prisma.$queryRaw<{ event_type: string; event_outcome: string; actor_role_snapshot: string }[]>`
      SELECT event_type,event_outcome,actor_role_snapshot FROM v81_events
      WHERE resource_type='FINAL_GRADE' AND resource_id=${persisted.enrollmentId}::uuid ORDER BY version`;
    assert.deepEqual(audit, [
      { event_type: 'DRAFT_SAVED', event_outcome: 'SUCCEEDED', actor_role_snapshot: 'TEACHER' },
      { event_type: 'PUBLISHED', event_outcome: 'SUCCEEDED', actor_role_snapshot: 'TEACHER' },
    ]);
    const history = await request(path, authenticated(teacher));
    assert.equal(history.status, 200);
    assert.deepEqual((object(history.body.data).items as Record<string, unknown>[])
      .map(row => [row.version, row.finalGrade, row.published]), [[2, 125, true], [1, 123, false]]);
    const afterRecord = await request(`/api/v1/exercise-records/${record.recordId}`, authenticated(student));
    assert.equal(afterRecord.status, 200);
    assert.deepEqual(afterRecord.body.data, beforeRecord.body.data);
    for (const field of ['finalGrade', 'score', 'rank', 'grade'])
      assert.equal(Object.hasOwn(object(afterRecord.body.data), field), false);
  });

  it('serializes competing revisions and rejects stale writes, notes and unauthorized actors', async () => {
    const record = await seedSubmittedExerciseRecord(prisma, fixture, 'GR-RACE');
    const teacher = await login(fixture.teacherEmail);
    const otherTeacher = await login(fixture.teacherBEmail);
    const admin = await login(fixture.adminEmail);
    const student = await tokenFor(record.studentUserId, 'STUDENT');
    const persisted = await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: record.recordId } });
    const path = `/api/v1/enrollments/${persisted.enrollmentId}/final-grades`;
    const initial = await request(path, authenticated(teacher, 'POST',
      { finalGrade: -1, published: false, expectedVersion: 0 }, uuidv7()));
    assert.equal(initial.status, 201, JSON.stringify(initial.body));
    const competing = await Promise.all([120, 130].map(finalGrade => request(path,
      authenticated(teacher, 'POST', { finalGrade, published: true, expectedVersion: 1 }, uuidv7()))));
    assert.deepEqual(competing.map(result => result.status).sort(), [201, 409]);
    const input = { finalGrade: 140, published: true, expectedVersion: 2 };
    for (const [token, status] of [[student, 403], [admin, 403], [otherTeacher, 404]] as const) {
      assert.equal((await request(path, authenticated(token))).status, status);
      assert.equal((await request(path, authenticated(token, 'POST', input, uuidv7()))).status, status);
    }
    for (const invalid of [{ ...input, note: 'Forbidden note' }, { ...input, finalGrade: 1.5 },
      { ...input, finalGrade: 2147483648 }]) {
      assert.equal((await request(path, authenticated(teacher, 'POST', invalid, uuidv7()))).status, 422);
    }
    assert.equal((await request(path, authenticated(teacher, 'POST',
      { ...input, expectedVersion: 1 }, uuidv7()))).status, 409);
    const history = await request(path, authenticated(teacher));
    const items = object(history.body.data).items as Record<string, unknown>[];
    assert.equal(items.length, 2);
    assert.equal(items[0]!.version, 2);
    assert.equal(items[1]!.finalGrade, -1);
    const audit = await prisma.$queryRaw<{ event_outcome: string }[]>`SELECT event_outcome FROM v81_events
      WHERE resource_type='FINAL_GRADE' AND resource_id=${persisted.enrollmentId}::uuid`;
    assert.equal(audit.length, 2);
    assert.ok(audit.every(event => event.event_outcome === 'SUCCEEDED'));
  });

  it('denies obsolete administrator score governance without creating score rules', async () => {
    const admin = await login(fixture.adminEmail);
    const path = `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/score-rules`;
    const beforeCount = await prisma.scoreRule.count();
    assert.equal((await request(path, authenticated(admin))).status, 403);
    const created = await request(path, authenticated(admin, 'POST',
      { ruleCode: 'FIXED_V1', displayName: 'Synthetic obsolete rule' }, uuidv7()));
    assert.equal(created.status, 403, JSON.stringify(created.body));
    assert.equal(await prisma.scoreRule.count(), beforeCount);
    const teacher = await login(fixture.teacherEmail);
    assert.equal((await request(path, authenticated(teacher))).status, 403);
    assert.equal((await request(path, authenticated(teacher, 'POST',
      { ruleCode: 'FIXED_V1', displayName: 'Retired teacher rule' }, uuidv7()))).status, 403);
    assert.equal(await prisma.scoreRule.count(), beforeCount);

  });
  it('denies every retired score endpoint for authenticated teachers and administrators', async () => {
    const teacher = await login(fixture.teacherEmail);
    const admin = await login(fixture.adminEmail);
    const routes = [
      ['GET', `/api/v1/class-sections/$${uuidv7()}/score-rules`],
      ['POST', `/api/v1/class-sections/$$${uuidv7()}/score-rules`],
      ['GET', `/api/v1/score-rules/${uuidv7()}`],
      ['POST', `/api/v1/score-rules/${uuidv7()}/submit-approval`],
      ['POST', `/api/v1/score-rules/${uuidv7()}/approve`],
      ['POST', `/api/v1/score-rules/${uuidv7()}/reject`],
      ['GET', `/api/v1/student-scores`],
      ['GET', `/api/v1/student-scores/${uuidv7()}`],
      ['POST', `/api/v1/student-scores/${uuidv7()}/recalculate`],
      ['POST', `/api/v1/student-scores/${uuidv7()}/publish`],
      ['GET', `/api/v1/student-scores/${uuidv7()}/adjustments`],
      ['POST', `/api/v1/student-scores/$${uuidv7()}/adjustments`],
      ['POST', `/api/v1/score-adjustments/${uuidv7()}/approve`],
      ['POST', `/api/v1/score-adjustments/${uuidv7()}/reject`],
    ] as const;
    assert.equal(routes.length, 14);
    for (const [method, path] of routes) {
      for (const access of [teacher, admin]) {
        const result = await request(path, authenticated(access, method, method === 'GET' ? undefined : {}, uuidv7()));
        assert.equal(result.status, 403, `${method} ${path}: ${JSON.stringify(result.body)}`);
      }
    }
    assert.equal(await prisma.scoreRule.count(), 0);
    assert.equal(await prisma.studentScore.count(), 0);
    assert.equal(await prisma.scoreAdjustment.count(), 0);
  });

});
