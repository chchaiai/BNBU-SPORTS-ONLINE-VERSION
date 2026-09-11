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

describe('V81 help and feedback HTTP E2E', () => {
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
      kind: 'SUB', permissions: ['HELP_CENTER', 'STUDENT_FEEDBACK'], mustChangePassword: false,
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

  it('publishes bilingual help, replays writes and removes archived content from student reads', async () => {
    const seeded = await seedExerciseSessionStudent(prisma, fixture, 'HELP');
    const student = await tokenFor(seeded.userId, 'STUDENT');
    const admin = await login(fixture.adminEmail);
    const teacher = await login(fixture.teacherEmail);
    const base = '/api/v1/admin/help-articles';
    const input = { titleZh: '登录帮助', titleEn: 'Login help', bodyZh: '请使用邮箱验证码登录。',
      bodyEn: 'Use your email verification code.', keywords: ['login'], category: 'login',
      status: 'draft', sortWeight: 0, expectedVersion: 0 };
    const key = uuidv7();
    let article = data(await request(base, authenticated(admin, 'POST', input, key)), 201);
    assert.deepEqual(data(await request(base, authenticated(admin, 'POST', input, key)), 201), article);
    const path = `${base}/${article.id}`;
    assert.deepEqual(data(await request(path, authenticated(admin))), article);
    const page = data(await request(base, authenticated(admin)));
    assert.equal(page.total, 1);
    assert.deepEqual(page.items, [article]);
    const studentBase = '/api/v1/student/help-articles';
    const studentPath = `${studentBase}/${article.id}`;
    assert.equal((await request(studentPath, authenticated(student))).status, 404);
    for (const status of ['published', 'archived', 'published']) {
      article = data(await request(path, authenticated(admin, 'POST',
        { ...input, status, expectedVersion: article.version }, uuidv7())), 201);
      for (const locale of ['zh-CN', 'en']) {
        const listing = await request(`${studentBase}?locale=${locale}`, authenticated(student));
        assert.equal(listing.status, 200);
        const entries = listing.body.data as Record<string, unknown>[];
        assert.equal(entries.length, status === 'published' ? 1 : 0);
        const detail = await request(`${studentPath}?locale=${locale}`, authenticated(student));
        if (status === 'archived') assert.equal(detail.status, 404);
        else {
          const item = data(detail);
          assert.equal(item.title, locale === 'en' ? input.titleEn : input.titleZh);
          assert.equal(item.bodyMarkdown, locale === 'en' ? input.bodyEn : input.bodyZh);
          assert.equal(Object.hasOwn(item, 'keywords'), false);
          assert.equal(item.version, article.version);
        }
      }
    }
    assert.equal((await request(path, authenticated(admin, 'POST',
      { ...input, status: 'published', expectedVersion: 1 }, uuidv7()))).status, 409);
    assert.deepEqual(data(await request(path, authenticated(admin))), article);
    for (const token of [student, teacher]) {
      assert.equal((await request(base, authenticated(token))).status, 403);
      assert.equal((await request(path, authenticated(token))).status, 403);
      assert.equal((await request(base, authenticated(token, 'POST', input, uuidv7()))).status, 403);
      assert.equal((await request(path, authenticated(token, 'POST', input, uuidv7()))).status, 403);
    }
    assert.equal((await request(studentBase, authenticated(teacher))).status, 403);
    assert.equal((await request(studentPath, authenticated(admin))).status, 403);
  });

  it('paginates help without omissions, serializes edits and applies revoked admin permissions immediately', async () => {
    const admin = await login(fixture.adminEmail);
    const base = '/api/v1/admin/help-articles';
    const input = { titleZh: '分页帮助', titleEn: 'Paged help', bodyZh: '中文正文', bodyEn: 'English body',
      keywords: ['pagination'], category: 'login', status: 'published', sortWeight: 0, expectedVersion: 0 };
    const ids: string[] = [];
    for (let index = 0; index < 6; index++) {
      const article = data(await request(base, authenticated(admin, 'POST',
        { ...input, titleEn: `Paged help ${index}` }, uuidv7())), 201);
      ids.push(String(article.id));
    }
    const first = data(await request(`${base}?page=1&status=published`, authenticated(admin)));
    const second = data(await request(`${base}?page=2&status=published`, authenticated(admin)));
    assert.equal(first.total, 6); assert.equal(second.total, 6);
    assert.equal((first.items as unknown[]).length, 5); assert.equal((second.items as unknown[]).length, 1);
    assert.deepEqual([...(first.items as Record<string, unknown>[]), ...(second.items as Record<string, unknown>[])]
      .map(item => item.id).sort(), ids.sort());
    const missing = `${base}/${uuidv7()}`;
    assert.equal((await request(missing, authenticated(admin))).status, 404);
    assert.equal((await request(missing, authenticated(admin, 'POST', input, uuidv7()))).status, 404);
    const path = `${base}/${ids[0]}`;
    const competing = await Promise.all(['First edit', 'Second edit'].map(titleEn => request(path,
      authenticated(admin, 'POST', { ...input, titleEn, expectedVersion: 1 }, uuidv7()))));
    assert.deepEqual(competing.map(result => result.status).sort(), [201, 409]);
    assert.equal(data(await request(path, authenticated(admin))).version, 2);
    await prisma.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: { permissions: ['STUDENT_FEEDBACK'] } });
    assert.equal((await request(base, authenticated(admin))).status, 403);
    assert.equal((await request(path, authenticated(admin, 'POST',
      { ...input, expectedVersion: 2 }, uuidv7()))).status, 403);
    const revisions = await prisma.$queryRaw<{ version: number }[]>`SELECT version FROM v81_help_article_revisions
      WHERE article_id=${ids[0]}::uuid ORDER BY version`;
    assert.deepEqual(revisions.map(row => row.version), [1, 2]);
  });

  it('delivers feedback handling history and notifications once, with owner isolation and version conflicts', async () => {
    const seeded = await seedExerciseSessionStudent(prisma, fixture, 'FDBK');
    const other = await seedExerciseSessionStudent(prisma, fixture, 'FDBK2');
    const student = await tokenFor(seeded.userId, 'STUDENT');
    const otherStudent = await tokenFor(other.userId, 'STUDENT');
    const admin = await login(fixture.adminEmail);
    const teacher = await login(fixture.teacherEmail);
    const created = data(await request('/api/v1/feedback', authenticated(student, 'POST',
      { category: 'BUG', content: 'Synthetic feedback lifecycle' }, uuidv7())), 201);
    const base = '/api/v1/admin/feedback';
    const path = `${base}/${created.id}`;
    const missing = `${base}/${uuidv7()}`;
    assert.equal((await request(missing, authenticated(admin))).status, 404);
    assert.equal((await request(`${missing}/handling`, authenticated(admin, 'POST',
      { status: 'IN_PROGRESS', publicReply: 'Synthetic reply', expectedVersion: 1 }, uuidv7()))).status, 404);
    let version = Number(created.version);
    for (const status of ['IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED', 'IN_PROGRESS']) {
      const input = { status, publicReply: `Synthetic reply: ${status}`, expectedVersion: version };
      const key = uuidv7();
      const result = data(await request(`${path}/handling`, authenticated(admin, 'POST', input, key)), 201);
      assert.deepEqual(data(await request(`${path}/handling`, authenticated(admin, 'POST', input, key)), 201), result);
      version = Number(result.version);
    }
    const detail = data(await request(path, authenticated(admin)));
    const history = detail.history as Record<string, unknown>[];
    assert.equal(history.length, 5);
    const historyPath = `/api/v1/student/feedback/${created.id}/history`;
    const ownHistory = data(await request(historyPath, authenticated(student)));
    const ownItems = ownHistory.items as Record<string, unknown>[];
    assert.deepEqual(ownItems.map(item => item.publicReply), history.map(item => item.publicReply));
    assert.ok(ownItems.every(item => !Object.hasOwn(item, 'actorUserId') && !Object.hasOwn(item, 'actorName')));
    assert.equal((await request(historyPath, authenticated(otherStudent))).status, 404);
    assert.equal((await request(historyPath, authenticated(teacher))).status, 403);
    const listed = data(await request(`${base}?category=BUG&status=IN_PROGRESS`, authenticated(admin)));
    assert.equal(listed.total, 1);
    assert.equal((listed.items as Record<string, unknown>[])[0]!.id, created.id);
    const notifications = await prisma.notification.findMany({ where: { targetId: String(created.id),
      recipientUserId: seeded.userId, notificationType: 'FEEDBACK_UPDATED' } });
    assert.equal(notifications.length, 5);
    assert.equal((await request(path, authenticated(teacher))).status, 403);
    assert.equal((await request(base, authenticated(student))).status, 403);
    const input = { status: 'RESOLVED', publicReply: 'Synthetic follow-up', expectedVersion: version };
    assert.equal((await request(`${path}/handling`, authenticated(teacher, 'POST', input, uuidv7()))).status, 403);
    const competing = await Promise.all([1, 2].map(index => request(`${path}/handling`, authenticated(admin, 'POST',
      { ...input, publicReply: `Concurrent reply ${index}` }, uuidv7()))));
    assert.deepEqual(competing.map(result => result.status).sort(), [201, 409]);
    const final = data(await request(path, authenticated(admin)));
    assert.equal((final.history as unknown[]).length, 6);
    assert.equal(await prisma.notification.count({ where: { targetId: String(created.id),
      notificationType: 'FEEDBACK_UPDATED' } }), 6);
  });
});
