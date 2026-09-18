import {execFileSync} from 'node:child_process';
import {createServer as createHttpServer} from 'node:http';
import {readFileSync} from 'node:fs';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { after, before, beforeEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import { ValidationPipe, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import { importPKCS8, SignJWT } from 'jose';
import { v7 as uuidv7 } from 'uuid';
import sharp from 'sharp';

import type { RuntimeConfig } from '../../src/common/config/environment.js';
import type { ApplicationError as ApplicationErrorType } from '../../src/common/errors/application-error.js';
import type { BodyParserErrorMiddleware as BodyParserErrorMiddlewareType } from '../../src/common/http/body-parser-error.middleware.js';
import type { RequestIdMiddleware as RequestIdMiddlewareType } from '../../src/common/http/request-id.js';
import type { validationException as ValidationExceptionFactory } from '../../src/common/http/validation.js';
import type {
  MediaObjectMetadata,
  MediaStoragePort,
} from '../../src/common/object-storage/media-storage.port.js';
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
  headers: Headers;
}

let ApplicationError: typeof ApplicationErrorType;

class MemoryMediaStorage implements MediaStoragePort {
  async copyPrivateObject(source: string, destination: string): Promise<void> {
    const object = this.objects.get(source);
    if (!object) throw new ApplicationError("MEDIA_OBJECT_NOT_FOUND",404);
    this.objects.set(destination,{...object,body:Buffer.from(object.body)});
  }

  checkHealth(): Promise<void> {
    return Promise.resolve();
  }

  normalizedUploadUrl: string | null = null;
  readonly objects = new Map<string, { body: Buffer; contentType: string; entityTag: string }>();
  readonly uploads = new Map<string, string>();

  createUploadUrl(input: {
    storageKey: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; method: 'PUT'; requiredHeaders: Record<string, string> }> {
    if (input.storageKey.endsWith('/normalized.mp4') && this.normalizedUploadUrl) return Promise.resolve({url:this.normalizedUploadUrl,method:'PUT',requiredHeaders:{'content-type':input.contentType}});
    const url = `https://upload.synthetic.invalid/${encodeURIComponent(input.storageKey)}?signature=redacted`;
    this.uploads.set(url, input.storageKey);
    return Promise.resolve({
      url,
      method: 'PUT' as const,
      requiredHeaders: {
        'content-type': input.contentType,
        'content-length': String(input.contentLength),
      },
    });
  }

  upload(url: string, body: Buffer, contentType: string): string {
    const key = this.uploads.get(url);
    if (key === undefined) throw new Error('Synthetic upload capability not found');
    const entityTag = createHash('md5').update(body).digest('hex');
    this.objects.set(key, { body, contentType, entityTag });
    return entityTag;
  }

  headPrivateObject(storageKey: string): Promise<MediaObjectMetadata> {
    const object = this.objects.get(storageKey);
    if (object === undefined) throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
    return Promise.resolve({
      entityTag: object.entityTag,
      contentLength: object.body.length,
      contentType: object.contentType,
    });
  }

  getPrivateObject(storageKey: string): Promise<Readable> {
    const object = this.objects.get(storageKey);
    if (object === undefined) throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
    return Promise.resolve(Readable.from(object.body));
  }

  createAccessUrl(input: {
    storageKey: string;
    contentType: string;
    expiresInSeconds: number;
  }): Promise<string> {
    if (!this.objects.has(input.storageKey))
      throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
    return Promise.resolve(
      `https://access.synthetic.invalid/object?signature=redacted&ttl=${input.expiresInSeconds}`,
    );
  }
}

async function png(): Promise<Buffer> {
  return sharp({ create: { width: 2, height: 3, channels: 3, background: '#237fa8' } }).png().toBuffer();
}

function object(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  const port = address.port;
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return port;
}

function compiledModule(relativePath: string): string {
  return pathToFileURL(resolve('dist', relativePath)).href;
}

describe('MediaEvidence HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let student: ExerciseSessionStudentFixture;
  let sessionId: string;
  let storage: MemoryMediaStorage;
  let worker: { processOne(): Promise<boolean> };
  let baseUrl: string;

  const request = async (path: string, init: RequestInit = {}): Promise<HttpResult> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
      headers: response.headers,
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

  let clockOffsetMs = 0;
  before(async () => {
    ({ ApplicationError } = await import(compiledModule('common/errors/application-error.js')));
    const databaseUrl = requireTestDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    const port = await availablePort();
    Object.assign(process.env, foundationEnvironment(databaseUrl, port));
    storage = new MemoryMediaStorage();
    const { AppModule } = (await import(compiledModule('app.module.js'))) as {
      AppModule: Type<unknown>;
    };
    const { RUNTIME_CONFIG } = (await import(
      compiledModule('common/config/runtime-config.module.js')
    )) as { RUNTIME_CONFIG: symbol };
    const { MEDIA_STORAGE_PORT } = (await import(
      compiledModule('common/object-storage/media-storage.port.js')
    )) as { MEDIA_STORAGE_PORT: symbol };
    const { MediaProcessingWorker } = (await import(
      compiledModule('modules/media/application/media-processing.worker.js')
    )) as { MediaProcessingWorker: Type<{ processOne(): Promise<boolean> }> };
    const { RequestIdMiddleware } = (await import(compiledModule('common/http/request-id.js'))) as {
      RequestIdMiddleware: Type<RequestIdMiddlewareType>;
    };
    const { BodyParserErrorMiddleware } = (await import(
      compiledModule('common/http/body-parser-error.middleware.js')
    )) as { BodyParserErrorMiddleware: Type<BodyParserErrorMiddlewareType> };
    const { validationException } = (await import(compiledModule('common/http/validation.js'))) as {
      validationException: typeof ValidationExceptionFactory;
    };
    const { Clock } = await import(compiledModule('common/time/clock.js')) as {
      Clock: Type<{ now(): Date }>;
    };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(Clock).useValue({ now: () => new Date(Date.now() + clockOffsetMs) })
      .overrideProvider(MEDIA_STORAGE_PORT)
      .useValue(storage)
      .compile();
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
    worker = app.get(MediaProcessingWorker);
    baseUrl = `http://127.0.0.1:${port}`;
  });

  beforeEach(async () => {
    clockOffsetMs = 0;
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
    await prisma.v81AccountSecurity.create({ data: {
      userId: fixture.teacherUserId, organizationId: fixture.organizationId,
      mustChangePassword: false, passwordChangedAt: new Date(),
    } });
    student = await seedExerciseSessionStudent(prisma, fixture, 'MEDIA-E2E');
    storage.objects.clear();
    storage.uploads.clear();
    sessionId = uuidv7();
    const now = new Date();
    await prisma.exerciseSession.create({
      data: {
        id: sessionId,
        organizationId: fixture.organizationId,
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        classSectionId: fixture.teacherAActiveSectionId,
        semesterId: fixture.semesterId,
        startedByAuthSessionId: student.authSessionId,
        status: 'COMPLETED',
        startedAt: new Date(now.getTime() - 3_600_000),
        businessDate: now,
        completedAt: now,
        endReason: 'USER_COMPLETED',
        actualDurationSeconds: 3600n,
        pausedDurationSeconds: 0n,
        createdAt: now,
        updatedAt: now,
      },
    });
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

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

  const teacherToken = async (): Promise<string> => {
    const login = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account: fixture.teacherEmail, password: TEST_PASSWORD }),
    });
    assert.equal(login.status, 200);
    return String(object(login.body.data).accessToken);
  };

  it('runs idempotent initiate, verified confirm, same-Session bind, worker, and private access', async () => {
    const token = await studentToken();
    const body = await png();
    const digest = createHash('sha256').update(body).digest('hex');
    const initiateBody = {
      sessionId,
      businessPurpose: 'EXERCISE_RECORD',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      fileSizeBytes: body.length,
      captureSource: 'IN_APP_CAMERA',
      declaredContentSha256: digest,
      durationSeconds: null,
    };
    const key = uuidv7();
    const initiated = await request(
      '/api/v1/media-uploads',
      authenticated(token, 'POST', initiateBody, key),
    );
    const replay = await request(
      '/api/v1/media-uploads',
      authenticated(token, 'POST', initiateBody, key),
    );
    assert.equal(initiated.status, 201);
    assert.deepEqual(replay.body.data, initiated.body.data);
    assert.equal(initiated.headers.get('cache-control'), 'no-store');
    assert.equal(initiated.headers.get('referrer-policy'), 'no-referrer');
    const resumed = await request('/api/v1/media-uploads', authenticated(token, 'POST', initiateBody, uuidv7()));
    assert.equal(resumed.status, 201);
    assert.equal(object(resumed.body.data).mediaId, object(initiated.body.data).mediaId);
    const capability = object(resumed.body.data);
    const mediaId = String(capability.mediaId);
    const uploadSessionId = String(capability.uploadSessionId);
    const etag = storage.upload(String(capability.uploadUrl), body, 'image/png');

    const confirmed = await request(
      `/api/v1/media-uploads/${uploadSessionId}/confirm`,
      authenticated(token, 'POST', { etag }, uuidv7()),
    );
    assert.equal(confirmed.status, 200, JSON.stringify(confirmed.body));
    const uploaded = object(confirmed.body.data);
    assert.equal(uploaded.id, mediaId);
    assert.equal(uploaded.uploadStatus, 'UPLOADED');
    assert.equal(uploaded.verifiedContentSha256, digest);
    assert.equal(uploaded.recordId, null);
    assert.equal(Object.hasOwn(uploaded, 'storageKey'), false);

    const bound = await request(
      `/api/v1/media/${mediaId}/bind`,
      authenticated(token, 'POST', { sessionId, expectedVersion: 2 }, uuidv7()),
    );
    assert.equal(bound.status, 200);
    assert.equal(object(bound.body.data).uploadStatus, 'BOUND');
    assert.equal(await worker.processOne(), true);

    const available = await request(`/api/v1/media/${mediaId}`, authenticated(token));
    assert.equal(available.status, 200);
    assert.equal(object(available.body.data).uploadStatus, 'AVAILABLE');
    assert.equal(object(available.body.data).version, 5);

    const access = await request(
      `/api/v1/media/${mediaId}/access-url`,
      authenticated(token, 'POST', { purpose: 'VIEW_ORIGINAL' }, uuidv7()),
    );
    assert.equal(access.status, 200);
    assert.match(
      String(object(access.body.data).accessUrl),
      /^https:\/\/access\.synthetic\.invalid/,
    );
    assert.equal(access.headers.get('cache-control'), 'no-store');

    const teacher = await teacherToken();
    assert.equal((await request(`/api/v1/media/${mediaId}`, authenticated(teacher))).status, 200);
    assert.equal(
      (
        await request(
          `/api/v1/media/${mediaId}/access-url`,
          authenticated(teacher, 'POST', { purpose: 'VIEW_ORIGINAL' }, uuidv7()),
        )
      ).status,
      403,
    );
    assert.equal(await prisma.mediaStatusEvent.count({ where: { mediaId } }), 5);
    assert.equal(await prisma.mediaProcessingAttempt.count({ where: { mediaId } }), 2);
    assert.equal(await prisma.auditLog.count({ where: { targetId: mediaId } }), 6);
    assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: mediaId } }), 5);
  });

  const videoDeclaration = (digest = 'a'.repeat(64)) => ({
    sessionId, businessPurpose: 'EXERCISE_RECORD', mediaType: 'VIDEO', mimeType: 'video/mp4',
    fileSizeBytes: 1024, captureSource: 'IN_APP_CAMERA', declaredContentSha256: digest, durationSeconds: 5,
  });

  it('recovers a pending video under fresh concurrent keys without consuming another slot', async () => {
    const token = await studentToken(), declaration = videoDeclaration();
    const first = await request('/api/v1/media-uploads', authenticated(token, 'POST', declaration, uuidv7()));
    assert.equal(first.status, 201);
    const recovered = await Promise.all([1, 2, 3].map(() =>
      request('/api/v1/media-uploads', authenticated(token, 'POST', declaration, uuidv7()))));
    for (const result of recovered) {
      assert.equal(result.status, 201, JSON.stringify(result.body));
      assert.equal(object(result.body.data).mediaId, object(first.body.data).mediaId);
      assert.equal(object(result.body.data).expiresAt, object(first.body.data).expiresAt);
    }
    assert.equal(await prisma.mediaEvidence.count({ where: { sessionId } }), 1);
    assert.equal(await prisma.mediaUploadSession.count({ where: { media: { sessionId } } }), 1);
    const different = await request('/api/v1/media-uploads', authenticated(token, 'POST', videoDeclaration('b'.repeat(64)), uuidv7()));
    assert.equal(different.body.code, 'MEDIA_COUNT_LIMIT_EXCEEDED');
    const changedFacts = await request('/api/v1/media-uploads', authenticated(token, 'POST', {...declaration, fileSizeBytes: 2048}, uuidv7()));
    assert.equal(changedFacts.body.code, 'MEDIA_COUNT_LIMIT_EXCEEDED');
  });

  it('renews expired credentials for the same pending file without replacing its media identity',async()=>{
    const token=await studentToken(),body=videoDeclaration();
    const first=await request('/api/v1/media-uploads',authenticated(token,'POST',body,uuidv7()));
    assert.equal(first.status,201);
    clockOffsetMs=301_000;
    const resumed=await request('/api/v1/media-uploads',authenticated(token,'POST',body,uuidv7()));
    assert.equal(resumed.status,201,JSON.stringify(resumed.body));
    assert.equal(object(resumed.body.data).mediaId,object(first.body.data).mediaId);
    assert.equal(object(resumed.body.data).uploadSessionId,object(first.body.data).uploadSessionId);
    assert.ok(String(object(resumed.body.data).expiresAt)>String(object(first.body.data).expiresAt));
  });

  it('preserves stored evidence through maintenance beyond PUT expiry and confirms the original upload',async()=>{
    const token=await studentToken(),bytes=await png();
    const body={sessionId,businessPurpose:'EXERCISE_RECORD',mediaType:'IMAGE',mimeType:'image/png',fileSizeBytes:bytes.length,captureSource:'IN_APP_CAMERA',declaredContentSha256:createHash('sha256').update(bytes).digest('hex'),durationSeconds:null};
    const initiated=await request('/api/v1/media-uploads',authenticated(token,'POST',body,uuidv7()));
    assert.equal(initiated.status,201);
    const upload=object(initiated.body.data),etag=storage.upload(String(upload.uploadUrl),bytes,'image/png');
    await prisma.systemPolicy.update({where:{organizationId:fixture.organizationId},data:{systemMode:'MAINTENANCE',version:{increment:1}}});
    const path=`/api/v1/media-uploads/${String(upload.uploadSessionId)}/confirm`;
    assert.equal((await request(path,authenticated(token,'POST',{etag},uuidv7()))).status,503);
    clockOffsetMs=301_000;
    await prisma.systemPolicy.update({where:{organizationId:fixture.organizationId},data:{systemMode:'NORMAL',version:{increment:1}}});
    const another=await request('/api/v1/media-uploads',authenticated(token,'POST',{...body,declaredContentSha256:'b'.repeat(64)},uuidv7()));
    assert.equal(another.status,201,JSON.stringify(another.body));
    const confirmed=await request(path,authenticated(token,'POST',{etag},uuidv7()));
    assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));
    assert.equal(object(confirmed.body.data).id,upload.mediaId);
    const bound=await request(`/api/v1/media/${String(upload.mediaId)}/bind`,authenticated(token,'POST',{sessionId,expectedVersion:object(confirmed.body.data).version},uuidv7()));
    assert.equal(bound.status,200,JSON.stringify(bound.body));
  });

  it('releases an expired video reservation and recovers after a stored quota failure using a fresh key', async () => {
    const token = await studentToken();
    const first = await request('/api/v1/media-uploads', authenticated(token, 'POST', videoDeclaration(), uuidv7()));
    assert.equal(first.status, 201);
    const failedKey = uuidv7(), changed = videoDeclaration('b'.repeat(64));
    assert.equal((await request('/api/v1/media-uploads', authenticated(token, 'POST', changed, failedKey))).status, 422);
    clockOffsetMs = 301_000;
    assert.equal((await request('/api/v1/media-uploads', authenticated(token, 'POST', changed, failedKey))).status, 422);
    const recovered = await request('/api/v1/media-uploads', authenticated(token, 'POST', changed, uuidv7()));
    assert.equal(recovered.status, 201, JSON.stringify(recovered.body));
    assert.notEqual(object(recovered.body.data).mediaId, object(first.body.data).mediaId);
    const old = await prisma.mediaEvidence.findUniqueOrThrow({ where: { id: String(object(first.body.data).mediaId) } });
    assert.equal(old.uploadStatus, 'FAILED');
    assert.equal(old.failureCode, 'MEDIA_UPLOAD_SESSION_EXPIRED');
    assert.equal(await prisma.mediaEvidence.count({ where: { sessionId, uploadStatus: 'PENDING_UPLOAD' } }), 1);
  });

  it('server video confirms raw bytes, normalizes asynchronously and preserves original identity', async () => {
    const token=await studentToken();
    await prisma.studentProfile.update({where:{id:student.studentId},data:{studentNumber:'2000000123',fullName:'Synthetic Video Student',collegeName:'FST',majorName:'CST',dateOfBirth:new Date('2005-01-01'),regionCode:'CN-44',version:{increment:1}}});
    assert.equal((await prisma.exerciseSession.findUniqueOrThrow({where:{id:sessionId}})).status,'COMPLETED');
    const templateId=uuidv7();
    await prisma.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind,must_change_password) VALUES(${fixture.adminUserId}::uuid,${fixture.organizationId}::uuid,'SUPER',false)`;
    await prisma.$executeRaw`INSERT INTO v81_rule_templates(id,organization_id,version,display_name,rules,actor_id,request_id,published_at) VALUES(${templateId}::uuid,${fixture.organizationId}::uuid,1,'Synthetic video rules','{"ruleSet":"V8_1","totalTargetMinutes":1200,"minimumMinutesOptions":[30,45,60],"defaultMinimumMinutes":30,"weeklyLimitOptions":[2,3,4],"defaultWeeklyLimit":3,"maximumCreditedMinutes":60,"dailyLimit":1,"creditedUnit":"WHOLE_MINUTE","supplementHours":24,"specialSupplementHours":72,"closingDays":7}'::jsonb,${fixture.adminUserId}::uuid,${uuidv7()},now())`;
    await prisma.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,template_id) VALUES(${fixture.teacherAActiveSectionId}::uuid,${fixture.organizationId}::uuid,30,4,600,600,'2027-01-23','2027-01-30','2027-02-01',now(),${templateId}::uuid)`;
    const recordResult=await request('/api/v1/exercise-records',authenticated(token,'POST',{sessionId,clientRequestId:uuidv7(),creditType:'GENERAL',sportType:'SWIMMING',description:'Synthetic swimming uses shared evidence rules'},uuidv7()));
    assert.equal(recordResult.status,201,JSON.stringify(recordResult.body));
    const record=object(recordResult.body.data);
    const body=readFileSync(resolve('test/fixtures/v81-media/media-recorder-fragmented.mp4'));
    const declaration={...videoDeclaration(createHash('sha256').update(body).digest('hex')),fileSizeBytes:body.length,durationSeconds:null};
    const initiated=await request('/api/v1/media-uploads',authenticated(token,'POST',declaration,uuidv7()));
    assert.equal(initiated.status,201,JSON.stringify(initiated.body));
    const capability=object(initiated.body.data),mediaId=String(capability.mediaId);
    const rawKey=`media/${fixture.organizationId}/${mediaId}/video`;
    const etag=storage.upload(String(capability.uploadUrl),body,'video/mp4');
    const confirmed=await request(`/api/v1/media-uploads/${String(capability.uploadSessionId)}/confirm`,authenticated(token,'POST',{etag},uuidv7()));
    assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));
    assert.equal(object(confirmed.body.data).verifiedDurationSeconds,null);
    const bound=await request(`/api/v1/media/${mediaId}/bind`,authenticated(token,'POST',{sessionId,expectedVersion:object(confirmed.body.data).version},uuidv7()));
    assert.equal(bound.status,200,JSON.stringify(bound.body));
    const premature=await request(`/api/v1/exercise-records/${String(record.id)}/submit`,authenticated(token,'POST',{mediaIds:[mediaId],expectedVersion:record.version},uuidv7()));
    assert.ok(premature.status>=400,JSON.stringify(premature.body));
    assert.equal((await prisma.exerciseRecord.findUniqueOrThrow({where:{id:String(record.id)}})).status,'DRAFT');
    const sink=createHttpServer(async(req,res)=>{
      const chunks:Buffer[]=[];for await(const chunk of req)chunks.push(Buffer.from(chunk as Uint8Array));
      const bytes=Buffer.concat(chunks);
      storage.objects.set(rawKey+'/normalized.mp4',{body:bytes,contentType:'video/mp4',entityTag:'synthetic'});
      res.writeHead(200);res.end();
    });
    await new Promise<void>(resolve=>sink.listen(0,'127.0.0.1',resolve));
    storage.normalizedUploadUrl=`http://127.0.0.1:${(sink.address() as {port:number}).port}/processed`;
    try {assert.equal(await worker.processOne(),true);} finally {await new Promise<void>(resolve=>sink.close(()=>resolve()));storage.normalizedUploadUrl=null;}
    const media=await prisma.mediaEvidence.findUniqueOrThrow({where:{id:mediaId}});
    assert.equal(media.uploadStatus,'AVAILABLE',JSON.stringify({failureCode:media.failureCode}));
    assert.equal(media.storageKey,rawKey);assert.equal(media.declaredContentSha256,declaration.declaredContentSha256);
    assert.equal((media.safeMetadata as Record<string,unknown>).normalized,1);
    assert.ok(media.verifiedDurationSeconds!<=10);
    assert.deepEqual(storage.objects.get(rawKey)?.body,body);
    assert.ok(storage.objects.has(rawKey+'/normalized.mp4'));
    const submitted=await request(`/api/v1/exercise-records/${String(record.id)}/submit`,authenticated(token,'POST',{mediaIds:[mediaId],expectedVersion:record.version},uuidv7()));
    assert.equal(submitted.status,200,JSON.stringify(submitted.body));
    assert.equal(object(submitted.body.data).status,'SUBMITTED');
    assert.equal(await prisma.$queryRaw`SELECT 1 FROM v81_swim_intakes WHERE record_id=${String(record.id)}::uuid`.then(rows=>(rows as unknown[]).length),0);

    await assert.rejects(prisma.mediaEvidence.update({where:{id:mediaId},data:{verifiedContentSha256:'0'.repeat(64),version:{increment:1}}}));
  });

  it('server video processing failure releases its quota for replacement',async()=>{
    const token=await studentToken();
    const body=execFileSync('ffmpeg',['-v','error','-f','lavfi','-i','color=size=64x64:rate=30','-t','2','-an','-c:v','libx264','-threads','1','-f','mp4','-movflags','frag_keyframe+empty_moov','pipe:1'],{timeout:30000});
    const declaration={...videoDeclaration(createHash('sha256').update(body).digest('hex')),fileSizeBytes:body.length,durationSeconds:null};
    const result=await request('/api/v1/media-uploads',authenticated(token,'POST',declaration,uuidv7()));
    assert.equal(result.status,201,JSON.stringify(result.body));
    const capability=object(result.body.data),mediaId=String(capability.mediaId);
    const etag=storage.upload(String(capability.uploadUrl),body,'video/mp4');
    const confirmation=await request(`/api/v1/media-uploads/${String(capability.uploadSessionId)}/confirm`,authenticated(token,'POST',{etag},uuidv7()));
    assert.equal(confirmation.status,200,JSON.stringify(confirmation.body));
    const bound=await request(`/api/v1/media/${mediaId}/bind`,authenticated(token,'POST',{sessionId,expectedVersion:object(confirmation.body.data).version},uuidv7()));
    assert.equal(bound.status,200,JSON.stringify(bound.body));
    await worker.processOne();
    const failed=await prisma.mediaEvidence.findUniqueOrThrow({where:{id:mediaId}});
    assert.equal(failed.uploadStatus,'FAILED');assert.equal(failed.failureCode,'MEDIA_AUDIO_TRACK_REQUIRED');
    const replacement=await request('/api/v1/media-uploads',authenticated(token,'POST',videoDeclaration('b'.repeat(64)),uuidv7()));
    assert.equal(replacement.status,201,JSON.stringify(replacement.body));
  });

  it('server video enforces new declaration limits before reserving a slot',async()=>{
    const token=await studentToken();
    for(const fields of [{durationSeconds:11},{fileSizeBytes:200*1024*1024+1}]) {
      const result=await request('/api/v1/media-uploads',authenticated(token,'POST',{...videoDeclaration(),...fields},uuidv7()));
      assert.ok([413,422].includes(result.status),JSON.stringify(result.body));
    }
    assert.equal(await prisma.mediaEvidence.count({where:{sessionId}}),0);
  });

  it('fails spoofed MIME without partial verified facts and rejects cross-Session binding', async () => {
    const token = await studentToken();
    const body = await png();
    const initiated = await request(
      '/api/v1/media-uploads',
      authenticated(
        token,
        'POST',
        {
          sessionId,
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'IMAGE',
          mimeType: 'image/jpeg',
          fileSizeBytes: body.length,
          captureSource: 'IN_APP_CAMERA',
          durationSeconds: null,
        },
        uuidv7(),
      ),
    );
    const capability = object(initiated.body.data);
    const mediaId = String(capability.mediaId);
    const etag = storage.upload(String(capability.uploadUrl), body, 'image/jpeg');
    const confirmed = await request(
      `/api/v1/media-uploads/${String(capability.uploadSessionId)}/confirm`,
      authenticated(token, 'POST', { etag }, uuidv7()),
    );
    assert.equal(confirmed.status, 422);
    assert.equal(confirmed.body.code, 'MEDIA_INTEGRITY_MISMATCH');
    const failed = await prisma.mediaEvidence.findUniqueOrThrow({ where: { id: mediaId } });
    assert.equal(failed.uploadStatus, 'FAILED');
    assert.equal(failed.verifiedMimeType, null);
    assert.equal(failed.verifiedContentSha256, null);
    const bind = await request(
      `/api/v1/media/${mediaId}/bind`,
      authenticated(token, 'POST', { sessionId: uuidv7(), expectedVersion: 2 }, uuidv7()),
    );
    assert.equal(bind.status, 422);
  });

  it('rejects new or newly bound evidence after the session record is submitted', async () => {
    const token = await studentToken();
    const now = new Date();
    await prisma.exerciseRecord.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        semesterId: fixture.semesterId,
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        classSectionId: fixture.teacherAActiveSectionId,
        courseId: fixture.activeCourseId,
        teacherId: fixture.teacherProfileId,
        sessionId,
        businessDate: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`),
        creditType: 'GENERAL',
        sportType: 'RUNNING',
        description: 'Submitted record closes its proof set',
        actualDurationSeconds: 3600n,
        pausedDurationSeconds: 0n,
        creditedDurationSeconds: 3600n,
        status: 'SUBMITTED',
        submittedAt: now,
        clientRequestId: `submitted-${uuidv7()}`,
        version: 2,
        createdAt: now,
        updatedAt: now,
      },
    });

    const initiated = await request(
      '/api/v1/media-uploads',
      authenticated(
        token,
        'POST',
        {
          sessionId,
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'IMAGE',
          mimeType: 'image/png',
          fileSizeBytes: (await png()).length,
          captureSource: 'IN_APP_CAMERA',
          durationSeconds: null,
        },
        uuidv7(),
      ),
    );
    assert.equal(initiated.status, 422);
    assert.equal(initiated.body.code, 'MEDIA_BIND_TARGET_INVALID');

    const mediaId = uuidv7();
    await prisma.mediaEvidence.create({
      data: {
        id: mediaId,
        organizationId: fixture.organizationId,
        ownerStudentId: student.studentId,
        sessionId,
        initiatedByUserId: student.userId,
        businessPurpose: 'EXERCISE_RECORD',
        mediaType: 'IMAGE',
        captureSource: 'IN_APP_CAMERA',
        declaredMimeType: 'image/png',
        verifiedMimeType: 'image/png',
        declaredFileSizeBytes: 45n,
        verifiedFileSizeBytes: 45n,
        verifiedContentSha256: 'f'.repeat(64),
        uploadStatus: 'UPLOADED',
        storageKey: `media/${fixture.organizationId}/${mediaId}/image`,
        uploadedAt: now,
        createdAt: now,
        updatedAt: now,
        version: 2,
      },
    });
    const bound = await request(
      `/api/v1/media/${mediaId}/bind`,
      authenticated(token, 'POST', { sessionId, expectedVersion: 2 }, uuidv7()),
    );
    assert.equal(bound.status, 422);
    assert.equal(bound.body.code, 'MEDIA_BIND_TARGET_INVALID');
  });
});
