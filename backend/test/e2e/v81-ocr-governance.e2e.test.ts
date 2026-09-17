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

describe('V81 OCR governance HTTP E2E', () => {
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

  it('governs OCR configuration with super-admin scope, immutable history and versioned replay', async () => {
    const admin = await login(fixture.adminEmail);
    const teacher = await login(fixture.teacherEmail);
    const student = await seedExerciseSessionStudent(prisma, fixture, 'OCR-CFG');
    const own = await tokenFor(student.userId, 'STUDENT');
    const path = '/api/v1/admin/review-services/ocr';
    const input = { provider: 'TENCENT_TABLE_V3', region: 'ap-shanghai', timeoutMs: 1500,
      enabled: false, reason: 'Synthetic OCR governance', expectedVersion: 0 };
    const post = (body: Record<string, unknown>, access = admin, key = uuidv7()) => request(`${path}/revisions`, authenticated(access, 'POST', body, key));
    const initial = data(await request(path, authenticated(admin)));
    assert.equal(initial.configurationSource, 'DEPLOYMENT_ENVIRONMENT');
    assert.equal(object(initial.configuration).version, 0);
    assert.equal(initial.executionEnabled, false);
    assert.equal(initial.credentialSource, 'CVM_ROLE');
    for (const access of [teacher, own]) {
      assert.equal((await request(path, authenticated(access))).status, 403);
      assert.equal((await request(`${path}/revisions`, authenticated(access))).status, 403);
      assert.equal((await post(input, access)).status, 403);
    }
    await prisma.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: { kind: 'SUB', permissions: ['SYSTEM_MODE', 'GLOBAL_RULES'] } });
    assert.equal((await post(input)).status, 403);
    assert.equal((await request(path, authenticated(admin))).status, 403);
    await prisma.v81AdminAccess.update({ where: { userId: fixture.adminUserId }, data: { kind: 'SUPER', permissions: [] } });
    for (const bad of [{ ...input, provider: 'UNAPPROVED' }, { ...input, secret: 'SYNTHETIC_REJECTED' },
      { ...input, endpoint: 'http://unapproved.invalid' }, { ...input, region: null },
      { ...input, provider: 'DISABLED', region: null, enabled: true }]) assert.equal((await post(bad)).status, 422);
    const key = uuidv7();
    const first = data(await post(input, admin, key), 201);
    assert.deepEqual(data(await post(input, admin, key), 201), first);
    const race = await Promise.all([post({ ...input, expectedVersion: 1 }), post({ ...input, expectedVersion: 1, reason: 'Concurrent revision' })]);
    assert.deepEqual(race.map(result => result.status).sort(), [201, 409]);
    const status = data(await request(path, authenticated(admin)));
    assert.equal(status.configurationSource, 'ADMIN_REVISION');
    assert.equal(object(status.configuration).version, 2);
    assert.equal(status.executionEnabled, false);
    assert.equal(status.providerConnectivity, 'UNVERIFIED');
    assert.equal(status.automaticPassValidation, 'NOT_PROVIDED');
    assert.equal(status.formalFactsRequireTeacherConfirmation, true);
    assert.doesNotMatch(JSON.stringify(status), /secretId|secretKey|SYNTHETIC_REJECTED|sessionToken/);
    const history = data(await request(`${path}/revisions?limit=1`, authenticated(admin)));
    assert.equal(required((history.items as Record<string, unknown>[])[0]).version, 2);
    assert.equal(history.nextBeforeVersion, 2);
    const old = data(await request(`${path}/revisions?limit=1&beforeVersion=2`, authenticated(admin)));
    assert.deepEqual(old.items, [first]);
    assert.equal(old.nextBeforeVersion, null);
    await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_service_revisions SET enabled=true WHERE id=${String(first.id)}::uuid`);
    await assert.rejects(prisma.$executeRaw`DELETE FROM v81_ocr_service_revisions WHERE id=${String(first.id)}::uuid`);
    const events = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM v81_events WHERE resource_type='OCR_SERVICE' AND organization_id=${fixture.organizationId}::uuid`;
    assert.equal(required(events[0]).count, 2);
  });
  it('executes current profile, membership, history, goal and deletion contracts over HTTP', async () => {
    const admin = await login(fixture.adminEmail), teacher = await login(fixture.teacherEmail);
    const student = await seedExerciseSessionStudent(prisma, fixture, 'CURRENT-CONTRACT');
    await prisma.studentProfile.update({where:{id:student.studentId},data:{gender:'MALE',version:{increment:1}}});
    const own = await tokenFor(student.userId, 'STUDENT');
    const get = async (path: string, token = teacher) => data(await request('/api/v1' + path, authenticated(token)));
    const post = async (path: string, body: Record<string, unknown>, token = teacher, status = 201, key = uuidv7()) =>
      data(await request('/api/v1' + path, authenticated(token, 'POST', body, key)), status);
    const me = await get('/me', own);
    const profile = {collegeName:'SCC',majorName:'JC',dateOfBirth:'2004-02-29',
      regionCode:'OTHER',otherRegionName:'Japan',expectedVersion:object(me.studentProfile).version};
    const profileKey = uuidv7();
    const completed = await post('/me/student-profile', profile, own, 200, profileKey);
    assert.equal(object(completed.studentProfile).otherRegionName, 'Japan');
    assert.deepEqual(await post('/me/student-profile', profile, own, 200, profileKey), completed);
    const goal = await get('/admin/exercise-goal', admin);
    const goalKey = uuidv7(), goalInput = {totalTargetMinutes:1800,expectedVersion:goal.version};
    const changed = await post('/admin/exercise-goal', goalInput, admin, 201, goalKey);
    assert.deepEqual(await post('/admin/exercise-goal', goalInput, admin, 201, goalKey), changed);
    assert.equal(changed.totalTargetMinutes,1800);
    const template=await post('/rule-templates',{displayName:'Synthetic current contracts',expectedVersion:0},admin);
    await prisma.classSection.update({where:{id:fixture.teacherAActiveSectionId},data:{
      dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:59Z')}});
    await post(`/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`,{templateId:template.id,minimumMinutes:1,
      weeklyLimit:3,courseTarget:1200,generalTarget:600,regularDeadline:'2027-01-23T00:00:00Z',
      closingDeadline:'2027-01-30T00:00:00Z',settlementPlannedAt:'2027-01-30T01:00:00Z',publish:true,
      globalTargetVersion:changed.version,expectedVersion:0});
    const invite = await post(`/class-sections/${fixture.teacherAActiveSectionId}/course-invites`, {});
    const currentProfile = await prisma.studentProfile.findUniqueOrThrow({where:{id:student.studentId}});
    const capability = await post(`/course-invites/${invite.inviteToken}/join-capabilities/member`, {
      fullName:currentProfile.fullName,studentNumber:currentProfile.studentNumber,gender:currentProfile.gender,gradeYear:currentProfile.gradeYear}, own);
    assert.equal(typeof capability.joinCapability, 'string');
    const settingsPath=`/class-sections/${fixture.teacherAActiveSectionId}/history-settings`;
    const settings=await get(settingsPath,own);
    await post(settingsPath,{enabled:true,earliestDate:'2026-08-01',latestDate:'2027-01-23',expectedVersion:settings.version});
    const session=await post(`/enrollments/${student.enrollmentId}/historical-sessions`,{
      startedAt:'2026-09-08T12:00:00+08:00',durationSeconds:120},own);
    assert.equal(session.recordOrigin,'HISTORICAL');
    const course=await get(`/class-sections/${fixture.teacherAActiveSectionId}`);
    const retired=await post(`/class-sections/${course.id}/delete`,{expectedVersion:course.version,
      confirmationCourseName:course.displayName,confirmCourseRetirement:true,reason:'Synthetic history preservation acceptance'});
    assert.equal(retired.deleted,true);
    assert.ok(await prisma.exerciseSession.findUnique({where:{id:String(session.id)}}));
    assert.ok(await prisma.studentProfile.findUnique({where:{id:student.studentId}}));
    const target=await prisma.studentProfile.findUniqueOrThrow({where:{id:student.studentId}});
    const deleted=await post(`/admin/students/${student.studentId}/delete`,{expectedVersion:target.version,
      confirmationStudentNumber:target.studentNumber,reason:'Synthetic standalone erasure acceptance'},admin);
    assert.equal(deleted.deleted,true);
    assert.equal(await prisma.exerciseSession.findUnique({where:{id:String(session.id)}}),null);
    assert.equal(await prisma.studentProfile.findUnique({where:{id:student.studentId}}),null);
  });

});
