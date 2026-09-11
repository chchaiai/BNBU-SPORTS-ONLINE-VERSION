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

describe('V81 semester administration HTTP E2E', () => {
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

  it('creates and edits an upcoming semester, checks blockers and atomically switches an empty current semester', async () => {
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    const businessRequest = async (path: string, token: string, input?: Record<string, unknown>, key = uuidv7()) => {
      const result = await request(`/api/v1${path}`, authenticated(token, input === undefined ? 'GET' : 'POST', input, key));
      assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.body));
      return object(result.body.data);
    };
    const input = { academicYear: '2027-2028', termCode: 'FIRST', displayName: 'Synthetic future semester',
      startDate: '2027-08-01', endDate: '2028-01-31' };
    const key = uuidv7();
    let target = await businessRequest('/admin/semesters', adminToken, input, key);
    assert.deepEqual(await businessRequest('/admin/semesters', adminToken, input, key), target);
    assert.equal(target.status, 'UPCOMING');
    const path = `/admin/semesters/${target.id}`;
    const update = { ...input, displayName: 'Edited synthetic semester', expectedVersion: target.version };
    const updateKey = uuidv7();
    target = await businessRequest(path, adminToken, update, updateKey);
    assert.deepEqual(await businessRequest(path, adminToken, update, updateKey), target);
    assert.equal(target.version, 2);
    const listed = await businessRequest('/admin/semesters', adminToken);
    assert.ok((listed.items as Record<string, unknown>[]).some(row => row.id === target.id && row.displayName === update.displayName));
    assert.equal((await request('/api/v1/teacher/semesters')).status,401);
    assert.equal((await request('/api/v1/teacher/semesters',authenticated(adminToken))).status,403);
    assert.equal((await request('/api/v1/teacher/semesters?limit=101',authenticated(teacherToken))).status,422);
    assert.equal((await request('/api/v1/teacher/semesters?after=invalid',authenticated(teacherToken))).status,422);
    const teacherSemesters:Record<string,unknown>[]=[],seen=new Set<string>();let after:string|null=null;
    do{const page=await businessRequest('/teacher/semesters?limit=1'+(after?'&after='+after:''),teacherToken);
      teacherSemesters.push(...page.items as Record<string,unknown>[]);after=page.nextCursor as string|null;
      if(after){assert.ok(!seen.has(after));seen.add(after);}
    }while(after);
    assert.ok(teacherSemesters.length>0);assert.ok(!teacherSemesters.some(row=>row.id===target.id));
    assert.equal(new Set(teacherSemesters.map(row=>row.id)).size,teacherSemesters.length);
    for(const row of teacherSemesters){assert.deepEqual(Object.keys(row).sort(),['id','academicYear','termCode','displayName','status','startDate','endDate','version'].sort());}
    assert.equal((await request(`/api/v1${path}`, authenticated(adminToken, 'POST', update, uuidv7()))).status, 409);
    assert.equal((await request('/api/v1/admin/semesters', authenticated(teacherToken))).status, 403);
    assert.equal((await request('/api/v1/admin/semesters', authenticated(teacherToken, 'POST', input, uuidv7()))).status, 403);
    assert.equal((await request(`/api/v1${path}`, authenticated(teacherToken, 'POST', update, uuidv7()))).status, 403);
    assert.equal((await request(`/api/v1/admin/semesters/${uuidv7()}`, authenticated(adminToken, 'POST', update, uuidv7()))).status, 404);
    const context = { prisma, fixture, request: businessRequest, baseUrl: `${baseUrl}/api/v1`,
      adminToken, teacherToken, targetId: String(target.id), targetVersion: target.version };
    const { probeSemesterSwitchCheck } = await import('../../../tools/local-integration/v81-semester-switch-check-probe.mjs');
    await probeSemesterSwitchCheck(context);
    const { probeSemesterSwitch } = await import('../../../tools/local-integration/v81-semester-switch-probe.mjs');
    await probeSemesterSwitch(context);
  });
});
