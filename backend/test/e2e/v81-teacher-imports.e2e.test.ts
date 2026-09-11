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

describe('V81 teacher account import HTTP E2E', () => {
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

  it('previews custom-email accounts, confirms once and requires personal passwords before business access', async () => {
    const admin = await login(fixture.adminEmail);
    const teacher = await login(fixture.teacherEmail);
    const post = (path: string, body: Record<string, unknown>, access = admin, key = uuidv7()) => request(`/api/v1${path}`, authenticated(access, 'POST', body, key));
    const csv = 'employee_id,name,email,college\nNEW001,First Teacher,first@custom.example,Sports\nNEW002,Second Teacher,second@another.example,';
    const count = await prisma.teacherProfile.count({ where: { organizationId: fixture.organizationId } });
    const preview = data(await post('/admin/teacher-imports/preview', { csv }), 201);
    assert.equal(preview.canCreate, true);
    assert.doesNotMatch(JSON.stringify(preview), /password/i);
    assert.equal(await prisma.teacherProfile.count({ where: { organizationId: fixture.organizationId } }), count);
    const overlapCsv = 'employee_id,name,email\nNEW003,Third Teacher,third@custom.example\nNEW001,First Teacher,first@custom.example';
    const overlap = data(await post('/admin/teacher-imports/preview', { csv: overlapCsv }), 201);
    assert.equal(overlap.canCreate, true);
    const initialPassword = 'Synthetic-Initial-123!';
    const input = { csv, previewToken: preview.previewToken, initialPassword };
    assert.equal((await post('/admin/teacher-imports/preview', { csv }, teacher)).status, 403);
    assert.equal((await post('/admin/teacher-imports/confirm', input, teacher)).status, 403);
    assert.equal((await post('/admin/teacher-imports/confirm', { ...input, csv: overlapCsv })).status, 422);
    assert.equal((await post('/admin/teacher-imports/confirm', { ...input, initialPassword: 'weak' })).status, 422);
    const key = uuidv7();
    const created = data(await post('/admin/teacher-imports/confirm', input, admin, key), 201);
    assert.equal(created.createdCount, 2);
    assert.deepEqual(data(await post('/admin/teacher-imports/confirm', input, admin, key), 201), created);
    assert.doesNotMatch(JSON.stringify(created), /password/i);
    assert.equal((await post('/admin/teacher-imports/confirm', input)).status, 409);
    assert.equal((await post('/admin/teacher-imports/confirm', { csv: overlapCsv, previewToken: overlap.previewToken, initialPassword })).status, 409);
    assert.equal(await prisma.teacherProfile.count({ where: { organizationId: fixture.organizationId, employeeNumber: 'NEW003' } }), 0);
    assert.equal(await prisma.teacherProfile.count({ where: { organizationId: fixture.organizationId } }), count + 2);
    const listed = data(await request('/api/v1/admin/teacher-accounts', authenticated(admin)));
    assert.equal((await request('/api/v1/admin/teacher-accounts', authenticated(teacher))).status, 403);
    for (const account of created.accounts as Record<string, string>[]) {
      assert.ok((listed.items as Record<string, unknown>[]).some(row => row.id === account.teacherProfileId));
      const stored = await prisma.user.findUniqueOrThrow({ where: { id: required(account.userId) } });
      assert.ok(stored.passwordHash!.startsWith('$argon2id$'));
      assert.notEqual(stored.passwordHash, initialPassword);
      const signedIn = data(await post('/auth/password-login', { account: account.email, password: initialPassword }), 200);
      const token = String(signedIn.accessToken);
      const security = data(await request('/api/v1/auth/account-security', authenticated(token)));
      assert.equal(security.mustChangePassword, true);
      const classesPath = `/api/v1/teachers/${account.teacherProfileId}/class-sections`;
      assert.equal((await request(classesPath, authenticated(token))).status, 403);
      data(await post('/auth/own-password', { currentPassword: initialPassword, newPassword: 'x', confirmPassword: 'x', expectedVersion: security.version }, token), 201);
      const personal = data(await post('/auth/password-login', { account: account.email, password: 'x' }), 200);
      assert.equal((await request(classesPath, authenticated(String(personal.accessToken)))).status, 200);
      assert.equal((await post('/auth/password-login', { account: account.email, password: initialPassword })).status, 401);
    }
    const events = await prisma.$queryRaw<{ facts: Record<string, unknown> }[]>`SELECT facts FROM v81_events WHERE resource_type='TEACHER_IMPORT' AND resource_id=${String(created.batchId)}::uuid`;
    assert.equal(events.length, 1);
    assert.equal(required(events[0]).facts.count, 2);
    assert.ok(!JSON.stringify(events).includes(initialPassword));
  });
});
