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
import { ApplicationError } from '../../src/common/errors/application-error.js';
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

class MemoryMediaStorage implements MediaStoragePort {
  checkHealth(): Promise<void> {
    return Promise.resolve();
  }

  readonly objects = new Map<string, { body: Buffer; contentType: string; entityTag: string }>();
  readonly uploads = new Map<string, string>();

  createUploadUrl(input: {
    storageKey: string;
    contentType: string;
    contentLength: number;
    expiresInSeconds: number;
  }): Promise<{ url: string; method: 'PUT'; requiredHeaders: Record<string, string> }> {
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

function webm(durationSeconds: number): Buffer {
  const elementId = (hex: string): Buffer => Buffer.from(hex, 'hex');
  const size = (value: number): Buffer => {
    if (value <= 0x7e) return Buffer.from([0x80 | value]);
    if (value <= 0x3ffe) return Buffer.from([0x40 | (value >> 8), value & 0xff]);
    throw new Error('Synthetic WebM element is too large');
  };
  const element = (id: string, payload: Buffer): Buffer =>
    Buffer.concat([elementId(id), size(payload.length), payload]);
  const duration = Buffer.alloc(8);
  duration.writeDoubleBE(durationSeconds * 1000, 0);
  const info = element(
    '1549a966',
    Buffer.concat([element('2ad7b1', Buffer.from([0x0f, 0x42, 0x40])), element('4489', duration)]),
  );
  const track = (type: number): Buffer => element('ae', element('83', Buffer.from([type])));
  const tracks = element('1654ae6b', Buffer.concat([track(1), track(2)]));
  const cluster = element('1f43b675', Buffer.alloc(16));
  const header = element('1a45dfa3', element('4282', Buffer.from('webm', 'ascii')));
  return Buffer.concat([header, element('18538067', Buffer.concat([info, tracks, cluster]))]);
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

  before(async () => {
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
    const module = await Test.createTestingModule({ imports: [AppModule] })
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
    const capability = object(initiated.body.data);
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

  it('accepts a byte-verified 15-second audible WebM upload', async () => {
    const token = await studentToken();
    const body = webm(15);
    const digest = createHash('sha256').update(body).digest('hex');
    const initiated = await request(
      '/api/v1/media-uploads',
      authenticated(
        token,
        'POST',
        {
          sessionId,
          businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'VIDEO',
          mimeType: 'video/webm',
          fileSizeBytes: body.length,
          captureSource: 'IN_APP_CAMERA',
          declaredContentSha256: digest,
          durationSeconds: 15,
        },
        uuidv7(),
      ),
    );
    assert.equal(initiated.status, 201);
    const capability = object(initiated.body.data);
    const entityTag = storage.upload(String(capability.uploadUrl), body, 'video/webm');
    const confirmed = await request(
      `/api/v1/media-uploads/${String(capability.uploadSessionId)}/confirm`,
      authenticated(token, 'POST', { etag: entityTag }, uuidv7()),
    );
    assert.equal(confirmed.status, 200);
    const uploaded = object(confirmed.body.data);
    assert.equal(uploaded.verifiedMimeType, 'video/webm');
    assert.equal(uploaded.verifiedDurationSeconds, 15);
    assert.equal(uploaded.verifiedContentSha256, digest);
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
