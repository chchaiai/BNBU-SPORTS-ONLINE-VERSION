import { responseContainer } from '../helpers/required.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { get } from 'node:http';
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

describe('V81 subadministrator SMTP identity HTTP E2E', () => {
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
    Object.assign(process.env, foundationEnvironment(databaseUrl, port), {
      EMAIL_DELIVERY_PROVIDER: 'SMTP', EMAIL_DELIVERY_REQUIRED: 'true',
      SMTP_HOST: 'mailpit', SMTP_PORT: '1025', SMTP_FROM_ADDRESS: 'test@bnbu.invalid', SMTP_SECURE: 'false',
    });
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

  it('creates an administrator-attested subadministrator sharing a student email without an OTP or identity crossover', async () => {
    const adminToken = await login(fixture.adminEmail), teacherToken = await login(fixture.teacherEmail);
    const student = await seedExerciseSessionStudent(prisma, fixture, 'SHAREDMAIL');
    const studentBefore = await prisma.user.findUniqueOrThrow({where:{id:student.userId}});
    const input = {email:student.email,identityVerifiedByAdmin:true,account:'shared-'+uuidv7(),name:'Shared email subadmin',
      department:'Synthetic',permissions:['AUDIT_QUERY'],initialPassword:TEST_PASSWORD,confirmPassword:TEST_PASSWORD};
    const post = (body:Record<string,unknown>,token=adminToken,key=uuidv7()) => request('/api/v1/admin/subadmins',authenticated(token,'POST',body,key));
    assert.equal((await post(input,teacherToken)).status,403);
    assert.equal((await post({...input,identityVerifiedByAdmin:false})).status,422);
    const key=uuidv7(),created=data(await post(input,adminToken,key),201);
    assert.deepEqual(data(await post(input,adminToken,key),201),created);
    const id=String(created.id),user=await prisma.user.findUniqueOrThrow({where:{id}});
    assert.equal(user.emailIdentityScope,'SUBADMIN');assert.equal(user.emailVerifiedAt,null);
    assert.equal(user.role,'ADMIN');assert.equal(user.primaryEmailNormalized,student.email);
    assert.deepEqual(await prisma.user.findUniqueOrThrow({where:{id:student.userId}}),studentBefore);
    assert.equal((await post({...input,account:'duplicate-'+uuidv7()})).status,409);
    assert.equal(await prisma.user.count({where:{organizationId:fixture.organizationId,primaryEmailNormalized:student.email}}),2);
    const events=await prisma.$queryRaw<{facts:Record<string,unknown>}[]>`SELECT facts FROM v81_events WHERE resource_id=${id}::uuid AND event_type='CREATED'`;
    assert.equal(events.length,1);assert.equal(events[0]?.facts.identityVerificationMethod,'SUPER_ADMIN_ATTESTATION');
    const loggedIn=data(await request('/api/v1/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':uuidv7()},body:JSON.stringify({account:input.account,password:TEST_PASSWORD})}));
    assert.equal(object(loggedIn.user).id,id);
    const emailLogin=await request('/api/v1/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':uuidv7()},body:JSON.stringify({account:student.email,password:TEST_PASSWORD})});
    assert.equal(emailLogin.status,401);
    const organization=await prisma.organization.findUniqueOrThrow({where:{id:fixture.organizationId}});
    const publicPost=(path:string,body:Record<string,unknown>)=>request('/api/v1'+path,{method:'POST',headers:{'content-type':'application/json','idempotency-key':uuidv7()},body:JSON.stringify(body)});
    const contact={organizationCode:organization.organizationCode,account:student.email,channel:'EMAIL',locale:'en'};
    const signIn=data(await publicPost('/auth/student-sign-in-codes',contact),202);
    assert.equal((await prisma.studentSignInChallenge.findUniqueOrThrow({where:{id:String(signIn.challengeId)}})).userId,student.userId);
    const recovery=data(await publicPost('/auth/account-recovery-requests',{...contact,requestedRole:'ADMIN'}),202);
    assert.equal((await prisma.accountRecoveryChallenge.findUniqueOrThrow({where:{id:String(recovery.recoveryId)}})).userId,id);
  });

  it('deletes only completed teacher accounts and preserves historical subjects with replay', async () => {
    const adminToken=await login(fixture.adminEmail),teacherToken=await login(fixture.teacherEmail);
    const original=await prisma.teacherProfile.findUniqueOrThrow({where:{userId:fixture.teacherUserId}});
    const source=await prisma.user.findUniqueOrThrow({where:{id:fixture.teacherUserId}});
    const userId=uuidv7(),id=uuidv7(),email=`deleted-${userId}@bnbu.invalid`,employeeNumber='DELETE'+id.replaceAll('-','').slice(0,20);
    await prisma.user.create({data:{...source,id:userId,primaryEmail:email,primaryEmailNormalized:email,version:1}});
    await prisma.teacherProfile.create({data:{...original,id,userId,employeeNumber,fullName:'Synthetic deletion teacher',version:1}});
    await prisma.v81AccountSecurity.create({data:{userId,organizationId:fixture.organizationId,mustChangePassword:false}});
    const oldToken=await login(email);
    const body={expectedVersion:1,confirmationEmployeeNumber:employeeNumber,reason:'Synthetic completed teacher account acceptance'};
    const post=(target:string,input=body,token=adminToken,key=uuidv7())=>request(`/api/v1/admin/teachers/${target}/delete`,authenticated(token,'POST',input,key));
    assert.equal((await post(id,body,teacherToken)).status,403);
    assert.equal((await post(id,{...body,expectedVersion:2})).status,409);
    assert.equal((await post(id,{...body,confirmationEmployeeNumber:'incorrect'})).status,422);
    assert.equal((await post(original.id,{...body,expectedVersion:original.version,confirmationEmployeeNumber:original.employeeNumber})).status,409);
    assert.ok(await prisma.teacherProfile.findUnique({where:{id:original.id}}));
    await prisma.v81AdminAccess.update({where:{userId:fixture.adminUserId},data:{kind:'SUB',permissions:[]}});
    assert.equal((await post(id)).status,403);
    await prisma.v81AdminAccess.update({where:{userId:fixture.adminUserId},data:{kind:'SUPER'}});
    const before=await prisma.auditLog.count({where:{actorUserId:userId}}),key=uuidv7();
    const first=await post(id,body,adminToken,key);assert.equal(first.status,201,JSON.stringify(first.body));
    const replay=await post(id,body,adminToken,key);assert.equal(replay.status,201);assert.deepEqual(replay.body.data,first.body.data);
    assert.equal(await prisma.user.count({where:{id:userId}}),0);assert.equal(await prisma.teacherProfile.count({where:{id}}),0);
    assert.equal(await prisma.authSession.count({where:{userId}}),0);assert.equal(await prisma.v81AccountSecurity.count({where:{userId}}),0);
    assert.equal(await prisma.auditLog.count({where:{actorUserId:userId}}),before);
    const subjects=await prisma.$queryRaw<{retired_at:Date|null}[]>`SELECT retired_at FROM v81_teacher_subjects WHERE id=${id}::uuid`;
    assert.ok(subjects[0]?.retired_at);
    assert.equal((await request('/api/v1/me',authenticated(oldToken))).status,401);
    const events=await prisma.$queryRaw<{count:bigint}[]>`SELECT count(*) AS count FROM v81_events WHERE resource_id=${id}::uuid AND event_type='ACCOUNT_DELETED'`;
    assert.equal(Number(events[0]?.count),1);
  });
  it('verifies email OTP before creating and managing a subadministrator', async () => {
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    const { probeSubadminIdentity } = await import('../../../tools/local-integration/v81-subadmin-identity-probe.mjs');
    // Mailpit is a fixture service, not a business OpenAPI endpoint.
    const readMailboxJson = (url: string) => new Promise((resolve, reject) => {
      const incoming = get(url, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error(`Mailbox HTTP ${response.statusCode}`)); return; }
        let text = ''; response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('error', reject);
        response.on('end', () => { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } });
      });
      incoming.setTimeout(5000, () => incoming.destroy(new Error('Mailbox request timed out')));
      incoming.on('error', reject);
    });
    await probeSubadminIdentity({ prisma, fixture, baseUrl: `${baseUrl}/api/v1`, adminToken, teacherToken, readMailboxJson,
      request: async (path: string, token: string | null, input?: Record<string, unknown>, key = uuidv7()) => {
        const init = authenticated(token ?? '', input === undefined ? 'GET' : 'POST', input, key);
        if (token === null) delete (init.headers as Record<string, string>).authorization;
        const result = await request(`/api/v1${path}`, init);
        assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.body));
        return responseContainer(result.body.data);
      } });
  });
  it('enforces permission changes and revocation against an already authenticated subadministrator session', async () => {
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    const { probeSubadminPermissions } = await import('../../../tools/local-integration/v81-subadmin-permissions-probe.mjs');
    await probeSubadminPermissions({ prisma, fixture, baseUrl: `${baseUrl}/api/v1`, adminToken, teacherToken,
      request: async (path: string, token: string | null, input?: Record<string, unknown>, key = uuidv7()) => {
        const init = authenticated(token ?? '', input === undefined ? 'GET' : 'POST', input, key);
        if (token === null) delete (init.headers as Record<string, string>).authorization;
        const result = await request(`/api/v1${path}`, init);
        assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.body));
        return responseContainer(result.body.data);
      } });
  });
});
