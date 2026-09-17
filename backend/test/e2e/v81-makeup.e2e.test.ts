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
import { S3Client, CreateBucketCommand } from '@aws-sdk/client-s3';

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

describe('V81 makeup window HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let baseUrl: string;
  let processMedia: () => Promise<boolean>;
  let clockOffsetMs=0;

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
      // This suite waits a real minute to verify the exercise minimum.
      ACCESS_TOKEN_TTL: '900',
      REFRESH_TOKEN_IDLE_TTL: '1800',
      REFRESH_TOKEN_ABSOLUTE_TTL: '3600',
      EMAIL_DELIVERY_PROVIDER: 'SMTP', EMAIL_DELIVERY_REQUIRED: 'true',
      SMTP_HOST: process.env.TEST_SMTP_HOST ?? 'mailpit', SMTP_PORT: process.env.TEST_SMTP_PORT ?? '1025', SMTP_FROM_ADDRESS: 'test@bnbu.invalid', SMTP_SECURE: 'false',
    });
    assert.ok(process.env.TEST_MEDIA_ENDPOINT && process.env.TEST_MEDIA_ACCESS_KEY && process.env.TEST_MEDIA_SECRET_KEY,
      'Makeup evidence E2E requires the isolated Compose MinIO service');
    Object.assign(process.env, { MEDIA_STORAGE_ENDPOINT: process.env.TEST_MEDIA_ENDPOINT,
      MEDIA_STORAGE_ACCESS_KEY: process.env.TEST_MEDIA_ACCESS_KEY, MEDIA_STORAGE_SECRET_KEY: process.env.TEST_MEDIA_SECRET_KEY,
      MEDIA_STORAGE_BUCKET: 'makeup-' + uuidv7() });
    const storage = new S3Client({endpoint: process.env.TEST_MEDIA_ENDPOINT, region:'us-east-1',forcePathStyle:true,
      credentials:{accessKeyId:process.env.TEST_MEDIA_ACCESS_KEY,secretAccessKey:process.env.TEST_MEDIA_SECRET_KEY}});
    try { await storage.send(new CreateBucketCommand({Bucket:process.env.MEDIA_STORAGE_BUCKET})); }
    finally { storage.destroy(); }
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
    const {Clock}=await import(compiledModule('common/time/clock.js'));
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock).useValue({now:()=>new Date(Date.now()+clockOffsetMs)}).compile();
    const { MediaProcessingWorker } = await import(compiledModule('modules/media/application/media-processing.worker.js'));
    const mediaWorker = module.get<{processOne(): Promise<boolean>}>(MediaProcessingWorker);
    processMedia = () => mediaWorker.processOne();
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
    clockOffsetMs=0;
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

  it('creates and revokes makeup windows with student OTP readback and notifications', async () => {
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    await prisma.v81AccountSecurity.create({ data: { userId: fixture.teacherCUserId, organizationId: fixture.isolationOrganizationId,
      mustChangePassword: false, passwordChangedAt: new Date() } });
    const otherTeacherTokens = [{ token: await login(fixture.teacherBEmail) }, { token: await login(fixture.teacherCEmail) }];
    const { probeMakeupHttp } = await import('../../../tools/local-integration/v81-makeup-http-probe.mjs');
    // Mailpit is a fixture service, not a business OpenAPI endpoint.
    const readMailboxJson = (url: string) => new Promise((resolve, reject) => {
      const mailboxUrl = new URL(url);
      const localUrl = process.env.TEST_MAILPIT_HTTP_ORIGIN ? new URL(mailboxUrl.pathname + mailboxUrl.search, process.env.TEST_MAILPIT_HTTP_ORIGIN).href : url;
      const incoming = get(localUrl, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error(`Mailbox HTTP ${response.statusCode}`)); return; }
        let text = ''; response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('error', reject);
        response.on('end', () => { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } });
      });
      incoming.setTimeout(5000, () => incoming.destroy(new Error('Mailbox request timed out')));
      incoming.on('error', reject);
    });
    await probeMakeupHttp({ prisma, fixture, otherTeacherTokens, baseUrl: `${baseUrl}/api/v1`, adminToken, teacherToken, readMailboxJson,
      request: async (path: string, token: string | null, input?: Record<string, unknown>, key = uuidv7()) => {
        const init = authenticated(token ?? '', input === undefined ? 'GET' : 'POST', input, key);
        if (token === null) delete (init.headers as Record<string, string>).authorization;
        const result = await request(`/api/v1${path}`, init);
        assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.body));
        return responseContainer(result.body.data);
      } });
  });
  it('authorizes exercise within course dates during a paused daily window and preserves the active session after revocation', async () => {
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    await prisma.v81AccountSecurity.create({ data: { userId: fixture.teacherCUserId, organizationId: fixture.isolationOrganizationId,
      mustChangePassword: false, passwordChangedAt: new Date() } });
    const otherTeacherTokens = [{ token: await login(fixture.teacherBEmail) }, { token: await login(fixture.teacherCEmail) }];
    const { probeMakeupSession } = await import('../../../tools/local-integration/v81-makeup-session-probe.mjs');
    // Mailpit is a fixture service, not a business OpenAPI endpoint.
    const readMailboxJson = (url: string) => new Promise((resolve, reject) => {
      const mailboxUrl = new URL(url);
      const localUrl = process.env.TEST_MAILPIT_HTTP_ORIGIN ? new URL(mailboxUrl.pathname + mailboxUrl.search, process.env.TEST_MAILPIT_HTTP_ORIGIN).href : url;
      const incoming = get(localUrl, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error(`Mailbox HTTP ${response.statusCode}`)); return; }
        let text = ''; response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('error', reject);
        response.on('end', () => { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } });
      });
      incoming.setTimeout(5000, () => incoming.destroy(new Error('Mailbox request timed out')));
      incoming.on('error', reject);
    });
    await probeMakeupSession({ prisma, fixture, otherTeacherTokens, baseUrl: `${baseUrl}/api/v1`, adminToken, teacherToken, readMailboxJson, processMedia,
      afterUploaded:async({upload,etag,studentToken,recordId}:{upload:{mediaId:string;uploadSessionId:string;expiresAt:string};etag:string;studentToken:string;recordId:string})=>{
        const policy=await prisma.systemPolicy.findUniqueOrThrow({where:{organizationId:fixture.organizationId}});
        const maintenance=await request('/api/v1/system-mode/changes',authenticated(adminToken,'POST',
          {mode:'MAINTENANCE',reason:'Synthetic interrupted upload',expectedVersion:policy.version,
            titleZh:'合成维护测试',titleEn:'Synthetic maintenance',bodyZh:'本地恢复验证',bodyEn:'Local recovery verification',
            estimatedRecoveryAt:new Date(Date.now()+600000).toISOString()},uuidv7()));
        assert.equal(maintenance.status,201,JSON.stringify(maintenance.body));
        clockOffsetMs+=301000;
        assert.ok(Date.now()+clockOffsetMs>Date.parse(upload.expiresAt));
        const denied=await request(`/api/v1/media-uploads/${upload.uploadSessionId}/confirm`,authenticated(studentToken,'POST',{etag},uuidv7()));
        assert.equal(denied.status,503,JSON.stringify(denied.body));
        assert.equal(denied.body.code,'SYSTEM_MAINTENANCE');
        assert.equal((await prisma.mediaEvidence.findUniqueOrThrow({where:{id:upload.mediaId}})).uploadStatus,'PENDING_UPLOAD');
        assert.equal((await prisma.exerciseRecord.findUniqueOrThrow({where:{id:recordId}})).status,'DRAFT');
        const updated=await prisma.systemPolicy.findUniqueOrThrow({where:{organizationId:fixture.organizationId}});
        const restored=await request('/api/v1/system-mode/changes',authenticated(adminToken,'POST',
          {mode:'NORMAL',reason:'Synthetic recovery',expectedVersion:updated.version},uuidv7()));
        assert.equal(restored.status,201,JSON.stringify(restored.body));
      },
      request: async (path: string, token: string | null, input?: Record<string, unknown>, key = uuidv7()) => {
        const init = authenticated(token ?? '', input === undefined ? 'GET' : 'POST', input, key);
        if (token === null) delete (init.headers as Record<string, string>).authorization;
        const result = await request(`/api/v1${path}`, init);
        assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.body));
        return responseContainer(result.body.data);
      } });
  });
});
