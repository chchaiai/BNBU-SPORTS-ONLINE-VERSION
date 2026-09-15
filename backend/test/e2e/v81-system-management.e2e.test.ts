import { responseContainer } from '../helpers/required.js';
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

describe('V81 system management HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let baseUrl: string;
  let runtimeConfig: RuntimeConfig;

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
    runtimeConfig = config;
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
      kind: 'SUB', permissions: ['SYSTEM_MODE'], mustChangePassword: false,
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

  it('enforces all eight subadministrator permissions during maintenance', async () => {
    await prisma.systemPolicy.updateMany({ data: { systemMode: 'MAINTENANCE' } });
    const admin = await login(fixture.adminEmail);
    const routes = { COURSE_VIEW: '/admin/course-directory', SEMESTER_MANAGE: '/admin/semesters',
      USER_ACCOUNTS: '/admin/teacher-accounts', STUDENT_FEEDBACK: '/admin/feedback',
      GLOBAL_RULES: '/admin/endurance-tables', SYSTEM_MODE: '/system-mode/history',
      HELP_CENTER: '/admin/help-articles', AUDIT_QUERY: '/admin/audit-events' };
    for (const permission of Object.keys(routes)) {
      await prisma.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: { permissions: [permission] } });
      for (const [required, path] of Object.entries(routes)) {
        assert.equal((await request(`/api/v1${path}`, authenticated(admin))).status, permission === required ? 200 : 403, `${permission}: ${path}`);
      }
    }
  });

  for (const kind of ['SUPER', 'SUB'] as const) {
    it(`allows ${kind} authorized reads and writes during maintenance without expanding permissions`, async () => {
      await prisma.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: {
        kind, permissions: ['HELP_CENTER'],
      } });
      const teacher = await login(fixture.teacherEmail);
      const student = await seedExerciseSessionStudent(prisma, fixture, 'MAINT');
      const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { id: student.studentId } });
      await prisma.systemPolicy.updateMany({ data: { systemMode: 'MAINTENANCE' } });
      const admin = await login(fixture.adminEmail);
      const base = '/api/v1/admin/help-articles';
      const input = { titleZh: '维护帮助', titleEn: 'Maintenance help', bodyZh: '测试', bodyEn: 'Test',
        keywords: ['maintenance'], category: 'maintenance', status: 'draft', sortWeight: 0, expectedVersion: 0 };
      const key = uuidv7();
      const article = data(await request(base, authenticated(admin, 'POST', input, key)), 201);
      assert.deepEqual(data(await request(base, authenticated(admin, 'POST', input, key)), 201), article);
      assert.equal((await request(base, authenticated(admin))).status, 200);
      assert.equal((await request('/api/v1/teacher/courses', authenticated(teacher, 'POST', { displayName: 'Blocked maintenance test' }, uuidv7()))).status, 503);
      const goal = await request('/api/v1/admin/exercise-goal', authenticated(admin));
      assert.equal(goal.status, kind === 'SUPER' ? 200 : 403);
      if (kind === 'SUPER') {
        data(await request(`/api/v1/admin/students/${student.studentId}/delete`, authenticated(admin, 'POST', {
          expectedVersion: profile.version, confirmationStudentNumber: profile.studentNumber, reason: 'Synthetic maintenance deletion',
        }, uuidv7())), 201);
        data(await request('/api/v1/rule-templates', authenticated(admin, 'POST', {
          displayName: 'Maintenance template', expectedVersion: 0,
        }, uuidv7())), 201);
        const previous = object(goal.body.data);
        data(await request('/api/v1/admin/exercise-goal', authenticated(admin, 'POST', {
          totalTargetMinutes: 1260, expectedVersion: previous.version,
        }, uuidv7())), 201);
      }
      await prisma.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: { kind: 'SUB', permissions: ['SYSTEM_MODE'] } });
      assert.equal((await request(base, authenticated(admin))).status, 403);
      assert.equal((await request(base, authenticated(admin, 'POST', input, uuidv7()))).status, 403);
    });
  }

  it('changes maintenance mode with replay, durable history, public announcement and recovery', async () => {
    const admin = await login(fixture.adminEmail);
    const teacher = await login(fixture.teacherEmail);
    const seeded = await seedExerciseSessionStudent(prisma, fixture, 'MODE');
    const student = await tokenFor(seeded.userId, 'STUDENT');
    const current = await prisma.systemPolicy.findUniqueOrThrow({ where: { organizationId: fixture.organizationId } });
    const path = '/api/v1/system-mode/changes';
    const input = { mode: 'MAINTENANCE', expectedVersion: current.version, reason: 'Synthetic maintenance',
      titleZh: '系统维护', titleEn: 'System maintenance', bodyZh: '测试维护公告', bodyEn: 'Synthetic maintenance announcement',
      estimatedRecoveryAt: new Date(Date.now() + 3600000).toISOString() };
    assert.equal(data(await request('/api/v1/system-mode/announcement')).announcement, null);
    for (const token of [teacher, student]) {
      assert.equal((await request('/api/v1/system-mode/history', authenticated(token))).status, 403);
      assert.equal((await request(path, authenticated(token, 'POST', input, uuidv7()))).status, 403);
    }
    assert.equal((await request(path, authenticated(admin, 'POST', { ...input, titleEn: '' }, uuidv7()))).status, 422);
    const key = uuidv7();
    const changed = data(await request(path, authenticated(admin, 'POST', input, key)), 201);
    assert.equal(changed.mode, 'MAINTENANCE');
    assert.deepEqual(data(await request(path, authenticated(admin, 'POST', input, key)), 201), changed);
    // The two active synthetic organizations now disagree; the public endpoint must fail closed.
    assert.equal((await request('/api/v1/system-mode/announcement')).status, 503);
    await prisma.systemPolicy.updateMany({ where: { organizationId: { not: fixture.organizationId } }, data: { systemMode: 'MAINTENANCE' } });
    const announcement = data(await request('/api/v1/system-mode/announcement'));
    assert.equal(announcement.mode, 'MAINTENANCE');
    assert.deepEqual(announcement.announcement, { titleZh: input.titleZh, titleEn: input.titleEn,
      bodyZh: input.bodyZh, bodyEn: input.bodyEn, estimatedRecoveryAt: input.estimatedRecoveryAt });
    const history = await request('/api/v1/system-mode/history', authenticated(admin));
    assert.equal(history.status, 200);
    assert.equal((history.body.data as unknown[]).length, 1);
    const courseCount = await prisma.course.count();
    const blocked = await request('/api/v1/teacher/courses', authenticated(teacher, 'POST',
      { displayName: 'Blocked synthetic course' }, uuidv7()));
    assert.equal(blocked.status, 503);
    assert.equal(await prisma.course.count(), courseCount);
    assert.equal((await request(path, authenticated(admin, 'POST',
      { mode: 'NORMAL', reason: 'Stale recovery', expectedVersion: current.version }, uuidv7()))).status, 409);
    const restored = data(await request(path, authenticated(admin, 'POST',
      { mode: 'NORMAL', reason: 'Synthetic recovery', expectedVersion: changed.policyVersion }, uuidv7())), 201);
    assert.equal(restored.mode, 'NORMAL');
    await prisma.systemPolicy.updateMany({ where: { organizationId: { not: fixture.organizationId } }, data: { systemMode: 'NORMAL' } });
    assert.equal(data(await request('/api/v1/system-mode/announcement')).announcement, null);
    const finalHistory = await request('/api/v1/system-mode/history', authenticated(admin));
    assert.equal(finalHistory.status, 200);
    assert.deepEqual((finalHistory.body.data as Record<string, unknown>[]).map(row => row.version),
      [Number(current.version) + 2, Number(current.version) + 1]);
    const interruptions = await prisma.$queryRaw<{ ended_at: Date | null }[]>`SELECT ended_at FROM v81_interruptions
      WHERE organization_id=${fixture.organizationId}::uuid AND kind='MAINTENANCE'`;
    assert.equal(interruptions.length, 1); assert.ok(interruptions[0]!.ended_at);
    const activeUsers = await prisma.user.count({ where: { organizationId: fixture.organizationId, status: 'ACTIVE', deletedAt: null } });
    assert.equal(await prisma.notification.count({ where: { organizationId: fixture.organizationId, notificationType: 'SYSTEM_MODE' } }), activeUsers * 2);
  });
  it('scopes public mode and announcement to the configured school while another school stays normal', async () => {
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
    const previous = runtimeConfig.publicOrganizationCode;
    runtimeConfig.publicOrganizationCode = organization.organizationCode;
    try {
      const admin = await login(fixture.adminEmail);
      const teacherBeforeMaintenance = await login(fixture.teacherEmail);
      const current = data(await request('/api/v1/system-mode'));
      const changed = data(await request('/api/v1/system-mode/changes', authenticated(admin, 'POST', {
        mode: 'MAINTENANCE', reason: 'Synthetic scoped mode', expectedVersion: current.policyVersion,
        titleZh: '本校测试维护', titleEn: 'Selected school maintenance', bodyZh: '本校测试', bodyEn: 'Selected school test',
        estimatedRecoveryAt: new Date(Date.now() + 3600000).toISOString(),
      }, uuidv7())), 201);
      assert.equal(data(await request('/api/v1/system-mode')).mode, 'MAINTENANCE');
      assert.equal(object(data(await request('/api/v1/system-mode/announcement')).announcement).titleEn, 'Selected school maintenance');
      assert.ok(await login(fixture.adminEmail), 'Administrator can log in to restore maintenance');
      assert.equal((await request('/api/v1/me', authenticated(admin))).status, 200);
      assert.equal((await request('/api/v1/me', authenticated(teacherBeforeMaintenance))).status, 503);
      assert.equal(await prisma.systemPolicy.count({ where: { organizationId: { not: fixture.organizationId }, systemMode: 'NORMAL' } }), 1);
      runtimeConfig.publicOrganizationCode = 'SYNTHETIC_MISSING_ORG';
      assert.equal((await request('/api/v1/system-mode')).status, 503);
      runtimeConfig.publicOrganizationCode = organization.organizationCode;
      data(await request('/api/v1/system-mode/changes', authenticated(admin, 'POST', {
        mode: 'NORMAL', reason: 'Synthetic scoped recovery', expectedVersion: changed.policyVersion,
      }, uuidv7())), 201);
      assert.equal(data(await request('/api/v1/system-mode/announcement')).announcement, null);
    } finally { runtimeConfig.publicOrganizationCode = previous; }
  });
  it('reads all mode history across stable version pages without exposing another school', async () => {
    const admin = await login(fixture.adminEmail);
    const requestId = uuidv7();
    // Explicit history fixtures test the 100-row boundary; they are not actual mode changes.
    await prisma.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at)
      SELECT gen_random_uuid(),${fixture.organizationId}::uuid,'SYSTEM_MODE',${fixture.organizationId}::uuid,'SYSTEM_MODE_CHANGED',
        ${fixture.adminUserId}::uuid,${requestId},n,'{"from":"MAINTENANCE","to":"NORMAL","reason":"Synthetic history page","announcementPublished":false}'::jsonb,now()
      FROM generate_series(1,105) n`;
    await prisma.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at)
      VALUES(gen_random_uuid(),${fixture.isolationOrganizationId}::uuid,'SYSTEM_MODE',${fixture.isolationOrganizationId}::uuid,'SYSTEM_MODE_CHANGED',
      ${fixture.teacherCUserId}::uuid,${requestId},999,'{"from":"MAINTENANCE","to":"NORMAL","reason":"Foreign synthetic history","announcementPublished":false}'::jsonb,now())`;
    const readPage = async (suffix = '') => {
      const result = await request('/api/v1/system-mode/history' + suffix, authenticated(admin));
      assert.equal(result.status, 200);
      return result.body.data as { version: number; actor_id: string }[];
    };
    const first = await readPage();
    assert.equal(first.length, 100);
    assert.equal(first[0]!.version, 105);
    assert.equal(first[99]!.version, 6);
    const second = await readPage('?beforeVersion=6');
    assert.deepEqual(second.map(row => row.version), [5,4,3,2,1]);
    assert.equal((await readPage('?beforeVersion=1')).length, 0);
    assert.equal(new Set([...first, ...second].map(row => row.version)).size, 105);
    assert.ok([...first, ...second].every(row => row.actor_id === fixture.adminUserId));
    for (const value of ['0', '-1', '1.5', 'invalid'])
      assert.equal((await request('/api/v1/system-mode/history?beforeVersion=' + value, authenticated(admin))).status, 422);
  });
  it('changes teacher and administrator passwords while retaining only the current session', async () => {
    for (const [userId, email] of [[fixture.teacherUserId, fixture.teacherEmail], [fixture.adminUserId, fixture.adminEmail]] as const) {
      await prisma.v81AccountSecurity.update({ where: { userId }, data: { mustChangePassword: true } });
      const currentToken = await login(email!);
      const otherToken = await login(email!);
      const security = data(await request('/api/v1/auth/account-security', authenticated(currentToken)));
      assert.equal(security.mustChangePassword, true);
      assert.equal((await request('/api/v1/me', authenticated(currentToken))).status, 403);
      const input = { currentPassword: TEST_PASSWORD, newPassword: `${TEST_PASSWORD}-changed`,
        confirmPassword: `${TEST_PASSWORD}-changed`, expectedVersion: security.version };
      assert.equal((await request('/api/v1/auth/own-password', authenticated(currentToken, 'POST',
        { ...input, confirmPassword: 'mismatch' }, uuidv7()))).status, 422);
      assert.equal((await request('/api/v1/auth/own-password', authenticated(currentToken, 'POST',
        { ...input, currentPassword: 'wrong-synthetic-password' }, uuidv7()))).status, 401);
      const key = uuidv7();
      const changed = data(await request('/api/v1/auth/own-password', authenticated(currentToken, 'POST', input, key)), 201);
      assert.equal(changed.mustChangePassword, false);
      assert.deepEqual(data(await request('/api/v1/auth/own-password', authenticated(currentToken, 'POST', input, key)), 201), changed);
      assert.equal(data(await request('/api/v1/auth/account-security', authenticated(currentToken))).mustChangePassword, false);
      assert.equal((await request('/api/v1/me', authenticated(currentToken))).status, 200);
      assert.equal((await request('/api/v1/me', authenticated(otherToken))).status, 401);
      const passwordLogin = (password: string) => request('/api/v1/auth/password-login', {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
        body: JSON.stringify({ account: email, password }) });
      assert.equal((await passwordLogin(TEST_PASSWORD)).status, 401);
      assert.equal((await passwordLogin(input.newPassword)).status, 200);
      const events = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM v81_events
        WHERE resource_type='ACCOUNT_SECURITY' AND resource_id=${userId}::uuid AND event_type='OWN_PASSWORD_CHANGED'`;
      assert.equal(events[0]!.count, 1);
    }
  });

  it('allows administrator security access in maintenance and rejects teacher and student password operations', async () => {
    const teacher = await login(fixture.teacherEmail);
    const admin = await login(fixture.adminEmail);
    const student = await seedExerciseSessionStudent(prisma, fixture, 'SECURITY');
    const token = await tokenFor(student.userId, 'STUDENT');
    const input = { currentPassword: TEST_PASSWORD, newPassword: `${TEST_PASSWORD}-changed`,
      confirmPassword: `${TEST_PASSWORD}-changed`, expectedVersion: 1 };
    assert.equal((await request('/api/v1/auth/account-security', authenticated(token))).status, 403);
    assert.equal((await request('/api/v1/auth/own-password', authenticated(token, 'POST', input, uuidv7()))).status, 403);
    await prisma.systemPolicy.updateMany({ data: { systemMode: 'MAINTENANCE' } });
    assert.equal((await request('/api/v1/auth/account-security', authenticated(teacher))).status, 503);
    assert.equal((await request('/api/v1/auth/own-password', authenticated(teacher, 'POST', input, uuidv7()))).status, 503);
    const security = data(await request('/api/v1/auth/account-security', authenticated(admin)));
    const changed = data(await request('/api/v1/auth/own-password', authenticated(admin, 'POST',
      { ...input, expectedVersion: security.version }, uuidv7())), 201);
    assert.equal(changed.mustChangePassword, false);
    assert.equal((await request('/api/v1/auth/account-security', authenticated(admin))).status, 200);
  });

  it('publishes immutable approved templates and freezes the teacher course selection', async () => {
    await prisma.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: { kind: 'SUPER', permissions: [] } });
    await prisma.v81AccountSecurity.create({ data: { userId: fixture.teacherCUserId,
      organizationId: fixture.isolationOrganizationId, mustChangePassword: false, passwordChangedAt: new Date() } });
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    const outsider = await login(fixture.teacherCEmail);
    assert.equal((await request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`, authenticated(teacherToken))).status, 404);
    const { probeRuleTemplates } = await import('../../../tools/local-integration/v81-rule-template-probe.mjs');
    await probeRuleTemplates({ prisma, fixture, baseUrl: `${baseUrl}/api/v1`, adminToken, teacherToken,
      otherTeacherTokens: [{ role: 'OTHER_ORGANIZATION', token: outsider }],
      request: async (path: string, token: string, input?: Record<string, unknown>, key = uuidv7()) => {
        const result = await request(`/api/v1${path}`, authenticated(token, input === undefined ? 'GET' : 'POST', input, key));
        assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.body));
        return responseContainer(result.body.data);
      } });
  });

  it('queries immutable audit events with date boundaries, pagination, redaction and tenant isolation', async () => {
    await prisma.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: { kind: 'SUPER', permissions: [] } });
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    const { probeAuditEvents } = await import('../../../tools/local-integration/v81-audit-events-probe.mjs');
    await probeAuditEvents({ prisma, fixture, baseUrl: `${baseUrl}/api/v1`, adminToken, teacherToken,
      request: async (path: string, token: string) => {
        const result = await request(`/api/v1${path}`, authenticated(token));
        assert.equal(result.status, 200, JSON.stringify(result.body));
        return responseContainer(result.body.data);
      } });
  });

});
