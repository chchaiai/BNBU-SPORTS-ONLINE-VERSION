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
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return address.port;
}

function compiledModule(relativePath: string): string {
  return pathToFileURL(resolve('dist', relativePath)).href;
}

describe('ExerciseRecord HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let student: ExerciseSessionStudentFixture;
  let sessionId: string;
  let mediaId: string;
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
    student = await seedExerciseSessionStudent(prisma, fixture, 'RECORD-E2E');
    const login = async (account: string) => {
      const response = await request('/api/v1/auth/password-login', {
        method: 'POST', headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
        body: JSON.stringify({ account, password: TEST_PASSWORD }),
      });
      assert.equal(response.status, 200);
      return String(object(response.body.data).accessToken);
    };
    await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: {
      dailyStartTime: new Date('1970-01-01T00:00:00Z'),
      dailyEndTime: new Date('1970-01-01T23:59:59Z'),
    } });
    await prisma.v81AccountSecurity.createMany({ data:
      [fixture.teacherUserId, fixture.adminUserId].map(userId => ({
        userId, organizationId: fixture.organizationId,
        mustChangePassword: false, passwordChangedAt: new Date(),
      })) });
    await prisma.v81AdminAccess.create({ data: {
      userId: fixture.adminUserId, organizationId: fixture.organizationId,
      kind: 'SUPER', permissions: [], mustChangePassword: false,
    } });
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    const template = await request('/api/v1/rule-templates', authenticated(adminToken, 'POST',
      { displayName: 'Synthetic session E2E template', expectedVersion: 0 }, uuidv7()));
    assert.equal(template.status, 201, JSON.stringify(template.body));
    const rules = await request('/api/v1/class-sections/' + fixture.teacherAActiveSectionId + '/v81-rules',
      authenticated(teacherToken, 'POST', {
        templateId: object(template.body.data).id, minimumMinutes: 30, weeklyLimit: 3,
        courseTarget: 600, generalTarget: 600, regularDeadline: '2027-01-23T00:00:00Z',
        closingDeadline: '2027-01-30T00:00:00Z', settlementPlannedAt: '2027-01-30T01:00:00Z',
        publish: true, expectedVersion: 0,
      }, uuidv7()));
    assert.equal(rules.status, 201, JSON.stringify(rules.body));
    const manual = await request('/api/v1/admin/review-services/manual-mode', authenticated(adminToken, 'POST',
      { classSectionId: fixture.teacherAActiveSectionId, enabled: true, reason: 'Synthetic manual verification', expectedVersion: 0 }, uuidv7()));
    assert.equal(manual.status, 201, JSON.stringify(manual.body));

    const now = new Date();
    const businessDate = new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`);
    sessionId = uuidv7();
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
        businessDate,
        completedAt: now,
        endReason: 'USER_COMPLETED',
        actualDurationSeconds: 3600n,
        pausedDurationSeconds: 0n,
        createdAt: now,
        updatedAt: now,
      },
    });
    mediaId = uuidv7();
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
        declaredContentSha256: 'b'.repeat(64),
        verifiedContentSha256: 'b'.repeat(64),
        uploadStatus: 'AVAILABLE',
        storageKey: `media/${fixture.organizationId}/${mediaId}/image`,
        uploadedAt: now,
        boundAt: now,
        processingStartedAt: now,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
        version: 5,
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

  const seedCompletedEvidence = async (actualDurationSeconds: number) => {
    const now = new Date();
    const seededSessionId = uuidv7();
    const seededMediaId = uuidv7();
    await prisma.exerciseSession.create({
      data: {
        id: seededSessionId,
        organizationId: fixture.organizationId,
        studentId: student.studentId,
        enrollmentId: student.enrollmentId,
        classSectionId: fixture.teacherAActiveSectionId,
        semesterId: fixture.semesterId,
        startedByAuthSessionId: student.authSessionId,
        status: 'COMPLETED',
        startedAt: new Date(now.getTime() - actualDurationSeconds * 1000),
        businessDate: new Date(`${now.toISOString().slice(0, 10)}T00:00:00.000Z`),
        completedAt: now,
        endReason: 'USER_COMPLETED',
        actualDurationSeconds: BigInt(actualDurationSeconds),
        pausedDurationSeconds: 0n,
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.mediaEvidence.create({
      data: {
        id: seededMediaId,
        organizationId: fixture.organizationId,
        ownerStudentId: student.studentId,
        sessionId: seededSessionId,
        initiatedByUserId: student.userId,
        businessPurpose: 'EXERCISE_RECORD',
        mediaType: 'IMAGE',
        captureSource: 'IN_APP_CAMERA',
        declaredMimeType: 'image/png',
        verifiedMimeType: 'image/png',
        declaredFileSizeBytes: 45n,
        verifiedFileSizeBytes: 45n,
        declaredContentSha256: 'c'.repeat(64),
        verifiedContentSha256: 'c'.repeat(64),
        uploadStatus: 'AVAILABLE',
        storageKey: `media/${fixture.organizationId}/${seededMediaId}/image`,
        uploadedAt: now,
        boundAt: now,
        processingStartedAt: now,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
        version: 5,
      },
    });
    return { sessionId: seededSessionId, mediaId: seededMediaId };
  };

  it('creates, edits, lists, submits, and replays one immutable evidence chain', async () => {
    const token = await studentToken();
    const createBody = {
      sessionId,
      creditType: 'GENERAL',
      sportType: 'RUNNING',
      description: 'Synthetic full record chain',
      clientRequestId: `android-${uuidv7()}`,
    };
    const createKey = uuidv7();
    const created = await request(
      '/api/v1/exercise-records',
      authenticated(token, 'POST', createBody, createKey),
    );
    const createReplay = await request(
      '/api/v1/exercise-records',
      authenticated(token, 'POST', createBody, createKey),
    );
    assert.equal(created.status, 201);
    assert.deepEqual(createReplay.body.data, created.body.data);
    const draft = object(created.body.data);
    const recordId = String(draft.id);
    assert.equal(draft.status, 'DRAFT');
    assert.equal(draft.actualDurationSeconds, 3600);
    assert.equal(draft.creditedDurationSeconds, 3600);
    assert.equal(draft.currentReview, null);

    const updated = await request(
      `/api/v1/exercise-records/${recordId}`,
      authenticated(
        token,
        'PATCH',
        { description: 'Updated synthetic record', expectedVersion: 1 },
        uuidv7(),
      ),
    );
    assert.equal(updated.status, 200);
    assert.equal(object(updated.body.data).version, 2);

    const submitted = await request(
      `/api/v1/exercise-records/${recordId}/submit`,
      authenticated(token, 'POST', { mediaIds: [mediaId], expectedVersion: 2 }, uuidv7()),
    );
    assert.equal(submitted.status, 200);
    const record = object(submitted.body.data);
    assert.equal(record.status, 'SUBMITTED');
    assert.equal(Object.hasOwn(record, 'studentRemark'), false);
    assert.deepEqual(record.currentReview, {
      result: 'PENDING',
      reasonCode: null,
      publicComment: null,
    });
    assert.equal(Object.hasOwn(record, 'internalNote'), false);
    assert.equal(await prisma.reviewRecord.count({ where: { recordId } }), 1);
    assert.equal(await prisma.exerciseRecordMedia.count({ where: { recordId } }), 1);
    assert.equal(await prisma.exerciseRecordDailySlot.count({ where: { recordId } }), 0);

    const evidenceContext = await request(
      `/api/v1/exercise-records/${recordId}/evidence-context`,
      authenticated(token),
    );
    assert.equal(evidenceContext.status, 200);
    const contextData = object(evidenceContext.body.data);
    assert.equal(contextData.recordId, recordId);
    assert.equal(contextData.sessionId, sessionId);
    assert.equal(typeof contextData.startedAt, 'string');
    assert.equal(typeof contextData.endedAt, 'string');
    assert.deepEqual(contextData.mediaIds, [mediaId]);

    const media = await request(`/api/v1/media/${mediaId}`, authenticated(token));
    assert.equal(media.status, 200);
    assert.equal(object(media.body.data).recordId, recordId);
    assert.equal(Object.hasOwn(object(media.body.data), 'storageKey'), false);
    const listed = await request('/api/v1/exercise-records?limit=20', authenticated(token));
    assert.equal(listed.status, 200);
    assert.equal((listed.body.data as unknown[]).length, 1);
  });

  it('requires the exact complete set of available session media', async () => {
    const token = await studentToken();
    const secondMediaId = uuidv7();
    const now = new Date();
    await prisma.mediaEvidence.create({
      data: {
        id: secondMediaId,
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
        verifiedContentSha256: 'd'.repeat(64),
        uploadStatus: 'AVAILABLE',
        storageKey: `media/${fixture.organizationId}/${secondMediaId}/image`,
        uploadedAt: now,
        boundAt: now,
        processingStartedAt: now,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
        version: 5,
      },
    });
    const created = await request(
      '/api/v1/exercise-records',
      authenticated(
        token,
        'POST',
        {
          sessionId,
          creditType: 'COURSE_RELATED',
          sportType: 'RUNNING',
          clientRequestId: `android-${uuidv7()}`,
        },
        uuidv7(),
      ),
    );
    assert.equal(created.status, 201);
    const createdRecord = object(created.body.data);
    assert.equal(createdRecord.description, null);
    const recordId = String(createdRecord.id);
    const invalidGeneral = await request(
      `/api/v1/exercise-records/${recordId}`,
      authenticated(token, 'PATCH', { creditType: 'GENERAL', expectedVersion: 1 }, uuidv7()),
    );
    assert.equal(invalidGeneral.status, 422);
    assert.equal(invalidGeneral.body.code, 'VALIDATION_FAILED');
    const incomplete = await request(
      `/api/v1/exercise-records/${recordId}/submit`,
      authenticated(token, 'POST', { mediaIds: [mediaId], expectedVersion: 1 }, uuidv7()),
    );
    assert.equal(incomplete.status, 422);
    assert.equal(incomplete.body.code, 'EXERCISE_RECORD_MEDIA_INCOMPLETE');

    const submitted = await request(
      `/api/v1/exercise-records/${recordId}/submit`,
      authenticated(
        token,
        'POST',
        { mediaIds: [mediaId, secondMediaId].sort(), expectedVersion: 1 },
        uuidv7(),
      ),
    );
    assert.equal(submitted.status, 200);
    assert.equal(await prisma.exerciseRecordMedia.count({ where: { recordId } }), 2);
  });

  it('does not let an unselected processing upload block valid evidence submission', async () => {
    const token = await studentToken();
    const processingMediaId = uuidv7();
    const now = new Date();
    await prisma.mediaEvidence.create({
      data: {
        id: processingMediaId,
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
        verifiedContentSha256: 'e'.repeat(64),
        uploadStatus: 'PROCESSING',
        storageKey: `media/${fixture.organizationId}/${processingMediaId}/image`,
        uploadedAt: now,
        boundAt: now,
        processingStartedAt: now,
        createdAt: now,
        updatedAt: now,
        version: 4,
      },
    });
    const created = await request(
      '/api/v1/exercise-records',
      authenticated(
        token,
        'POST',
        {
          sessionId,
          creditType: 'GENERAL',
          sportType: 'RUNNING',
          description: 'Processing proof session',
          clientRequestId: `android-${uuidv7()}`,
        },
        uuidv7(),
      ),
    );
    assert.equal(created.status, 201);
    const recordId = String(object(created.body.data).id);
    const denied = await request(
      `/api/v1/exercise-records/${recordId}/submit`,
      authenticated(
        token,
        'POST',
        { mediaIds: [mediaId, processingMediaId].sort(), expectedVersion: 1 },
        uuidv7(),
      ),
    );
    assert.equal(denied.status, 422);
    assert.equal(denied.body.code, 'EXERCISE_RECORD_MEDIA_INCOMPLETE');

    const submitted = await request(
      `/api/v1/exercise-records/${recordId}/submit`,
      authenticated(token, 'POST', { mediaIds: [mediaId], expectedVersion: 1 }, uuidv7()),
    );
    assert.equal(submitted.status, 200);
    assert.equal(object(submitted.body.data).status, 'SUBMITTED');
  });

  it('returns a stable conflict when a second draft is created for one session', async () => {
    const token = await studentToken();
    const body = {
      sessionId,
      creditType: 'GENERAL',
      sportType: 'RUNNING',
      description: 'Synthetic duplicate draft',
      clientRequestId: `android-${uuidv7()}`,
    };
    const first = await request(
      '/api/v1/exercise-records',
      authenticated(token, 'POST', body, uuidv7()),
    );
    assert.equal(first.status, 201);
    const duplicate = await request(
      '/api/v1/exercise-records',
      authenticated(token, 'POST', { ...body, clientRequestId: `android-${uuidv7()}` }, uuidv7()),
    );
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, 'EXERCISE_RECORD_ALREADY_EXISTS_FOR_SESSION');
  });

  it('discards a draft atomically with append-only evidence', async () => {
    const token = await studentToken();
    const created = await request(
      '/api/v1/exercise-records',
      authenticated(
        token,
        'POST',
        {
          sessionId,
          creditType: 'GENERAL',
          sportType: 'RUNNING',
          description: 'Synthetic discard path',
          clientRequestId: `android-${uuidv7()}`,
        },
        uuidv7(),
      ),
    );
    assert.equal(created.status, 201);
    const draft = object(created.body.data);
    const recordId = String(draft.id);
    const discarded = await request(
      `/api/v1/exercise-records/${recordId}/discard`,
      authenticated(
        token,
        'POST',
        { reason: 'Synthetic student discard', expectedVersion: draft.version },
        uuidv7(),
      ),
    );
    assert.equal(discarded.status, 200, JSON.stringify(discarded.body));
    assert.equal(object(discarded.body.data).status, 'CANCELLED');
    assert.equal(
      await prisma.exerciseRecordEvent.count({ where: { recordId, eventType: 'DISCARDED' } }),
      1,
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { targetId: recordId, actionType: 'EXERCISE_RECORD_DISCARDED' },
      }),
      1,
    );
  });

  it('routes withdrawal to stable default deny with zero domain side effects', async () => {
    const token = await studentToken();
    const created = await request(
      '/api/v1/exercise-records',
      authenticated(
        token,
        'POST',
        {
          sessionId,
          creditType: 'GENERAL',
          sportType: 'RUNNING',
          description: 'Synthetic withdrawal denial',
          clientRequestId: `android-${uuidv7()}`,
        },
        uuidv7(),
      ),
    );
    const draft = object(created.body.data);
    const recordId = String(draft.id);
    const before = {
      version: draft.version,
      events: await prisma.exerciseRecordEvent.count({ where: { recordId } }),
      audits: await prisma.auditLog.count({ where: { targetId: recordId } }),
      outbox: await prisma.outboxEvent.count({ where: { aggregateId: recordId } }),
    };
    const denied = await request(
      `/api/v1/exercise-records/${recordId}/withdraw`,
      authenticated(token, 'POST', { reason: 'Synthetic request', expectedVersion: 1 }, uuidv7()),
    );
    assert.equal(denied.status, 409);
    assert.equal(denied.body.code, 'EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED');
    assert.equal(
      (await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: recordId } })).version,
      before.version,
    );
    assert.equal(await prisma.exerciseRecordEvent.count({ where: { recordId } }), before.events);
    assert.equal(await prisma.auditLog.count({ where: { targetId: recordId } }), before.audits);
    assert.equal(
      await prisma.outboxEvent.count({ where: { aggregateId: recordId } }),
      before.outbox,
    );
  });

  it('retains below-threshold submissions with zero credited duration', async () => {
    const token = await studentToken();
    const evidence = await seedCompletedEvidence(1799);
    const created = await request(
      '/api/v1/exercise-records',
      authenticated(
        token,
        'POST',
        {
          sessionId: evidence.sessionId,
          creditType: 'GENERAL',
          sportType: 'RUNNING',
          description: 'Synthetic short session',
          clientRequestId: `android-${uuidv7()}`,
        },
        uuidv7(),
      ),
    );
    assert.equal(created.status, 201);
    const draft = object(created.body.data);
    assert.equal(draft.creditedDurationSeconds, 0);
    const submitted = await request(
      `/api/v1/exercise-records/${String(draft.id)}/submit`,
      authenticated(token, 'POST', { mediaIds: [evidence.mediaId], expectedVersion: 1 }, uuidv7()),
    );
    assert.equal(submitted.status, 200);
    assert.equal(object(submitted.body.data).creditedDurationSeconds, 0);
    assert.equal(object(submitted.body.data).status, 'SUBMITTED');
    assert.equal(await prisma.exerciseRecordDailySlot.count(), 0);
    assert.equal(await prisma.exerciseRecordMedia.count(), 1);
    assert.equal(await prisma.reviewRecord.count({ where: { result: 'PENDING' } }), 1);
  });

  it('accepts same-day submissions for review without reserving legacy daily slots', async () => {
    const token = await studentToken();
    const createDraft = async (candidateSessionId: string) => {
      const created = await request(
        '/api/v1/exercise-records',
        authenticated(
          token,
          'POST',
          {
            sessionId: candidateSessionId,
            creditType: 'GENERAL',
            sportType: 'RUNNING',
            description: 'Synthetic daily reservation',
            clientRequestId: `android-${uuidv7()}`,
          },
          uuidv7(),
        ),
      );
      assert.equal(created.status, 201);
      return String(object(created.body.data).id);
    };
    const submit = async (recordId: string, candidateMediaId: string) =>
      request(
        `/api/v1/exercise-records/${recordId}/submit`,
        authenticated(
          token,
          'POST',
          { mediaIds: [candidateMediaId], expectedVersion: 1 },
          uuidv7(),
        ),
      );
    const second = await seedCompletedEvidence(3600);
    const candidates = [
      { recordId: await createDraft(sessionId), mediaId },
      { recordId: await createDraft(second.sessionId), mediaId: second.mediaId },
    ];
    const results = await Promise.all(
      candidates.map(async (candidate) => ({
        ...candidate,
        response: await submit(candidate.recordId, candidate.mediaId),
      })),
    );
    assert.deepEqual(results.map(r => r.response.status), [200, 200]);
    for (const candidate of results) {
      const record = await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: candidate.recordId } });
      assert.equal(record.status, 'SUBMITTED');
      assert.equal(record.version, 2);
      assert.equal(await prisma.reviewRecord.count({ where: { recordId: candidate.recordId, result: 'PENDING' } }), 1);
      assert.equal(await prisma.exerciseRecordMedia.count({ where: { recordId: candidate.recordId } }), 1);
      const workflows = await prisma.$queryRaw<{ stage: string }[]>`SELECT stage FROM v81_record_workflows WHERE record_id=${candidate.recordId}::uuid`;
      assert.equal(workflows[0]?.stage, 'PENDING_TEACHER');
    }
    assert.equal(await prisma.exerciseRecordDailySlot.count(), 0);
  });
  it('returns for one supplement then credits a replayable teacher decision in student progress', async () => {
    const token = await studentToken();
    const login = await request('/api/v1/auth/password-login', authenticated('', 'POST',
      { account: fixture.teacherEmail, password: TEST_PASSWORD }, uuidv7()));
    assert.equal(login.status, 200);
    const teacher = String(object(login.body.data).accessToken);
    const adminLogin = await request('/api/v1/auth/password-login', authenticated('', 'POST',
      { account: fixture.adminEmail, password: TEST_PASSWORD }, uuidv7()));
    assert.equal(adminLogin.status, 200);
    const admin = String(object(adminLogin.body.data).accessToken);
    const isolatedSection = await prisma.classSection.findFirstOrThrow({ where: { courseId: fixture.isolationCourseId } });
    const directoryPath = '/api/v1/admin/course-directory';
    assert.equal((await request(directoryPath, authenticated(teacher))).status, 403);
    assert.equal((await request(directoryPath, authenticated(token))).status, 403);
    const directoryMetrics = async () => {
      const response = await request(directoryPath, authenticated(admin));
      assert.equal(response.status, 200, JSON.stringify(response.body));
      const directory = object(response.body.data);
      assert.equal(object(directory.semester).id, fixture.semesterId);
      const rows = directory.rows as Record<string, unknown>[];
      assert.ok(!rows.some(row => row.id === fixture.teacherBArchivedSectionId || row.id === isolatedSection.id));
      assert.doesNotMatch(JSON.stringify(directory), /studentNumber|ownerStudentId|internalNote|studentRemark/);
      const row = object(rows.find(item => item.id === fixture.teacherAActiveSectionId));
      return object(row.currentMembers);
    };
    assert.equal((await directoryMetrics()).totalRecords, 0);
    const manualStatus = await request(`/api/v1/admin/review-services/manual-mode/${fixture.teacherAActiveSectionId}`, authenticated(admin));
    assert.equal(manualStatus.status, 200, JSON.stringify(manualStatus.body));
    assert.equal(object(manualStatus.body.data).enabled, true);
    assert.equal(object(manualStatus.body.data).version, 1);

    const readProgress = async () => {
      const result = await request('/api/v1/student-progress', authenticated(token));
      assert.equal(result.status, 200);
      const own = object((result.body.data as Record<string, unknown>[]).find(row => row.enrollmentId === student.enrollmentId));
      const teacherResult = await request('/api/v1/teacher-progress', authenticated(teacher));
      assert.equal(teacherResult.status, 200);
      assert.deepEqual((teacherResult.body.data as Record<string, unknown>[]).find(row => row.enrollmentId === student.enrollmentId), own);
      return own;
    };
    assert.equal((await readProgress()).totalEffectiveSeconds, 0);
    const created = await request('/api/v1/exercise-records', authenticated(token, 'POST', {
      sessionId, creditType: 'GENERAL', sportType: 'RUNNING',
      description: 'Synthetic manual supplement chain', clientRequestId: uuidv7(),
    }, uuidv7()));
    assert.equal(created.status, 201);
    const draft = object(created.body.data);
    const path = `/api/v1/exercise-records/${draft.id}`;
    const submitted = await request(`${path}/submit`, authenticated(token, 'POST',
      { mediaIds: [mediaId], expectedVersion: draft.version }, uuidv7()));
    assert.equal(submitted.status, 200);
    const pending = object(submitted.body.data);
    assert.equal(pending.workflowStage, 'PENDING_TEACHER');
    assert.equal((await directoryMetrics()).pendingTeacher, 1);
    assert.equal((await readProgress()).totalEffectiveSeconds, 0);
    const returned = await request(`${path}/v81-reviews`, authenticated(teacher, 'POST', {
      action: 'RETURN_FOR_SUPPLEMENT', reasonCode: 'UNCLEAR_EVIDENCE',
      supplementHours: 24, expectedVersion: pending.workflowVersion,
    }, uuidv7()));
    assert.equal(returned.status, 201, JSON.stringify(returned.body));
    const awaiting = object(returned.body.data);
    assert.equal(awaiting.stage, 'AWAITING_SUPPLEMENT');
    assert.equal((await directoryMetrics()).pendingSupplement, 1);
    const todos = await request('/api/v1/student/proof-todos', authenticated(token));
    assert.equal(todos.status, 200);
    assert.ok((object(todos.body.data).items as Record<string, unknown>[]).some(row => row.recordId === draft.id));
    const clock = await request(`${path}/supplement-clock`, authenticated(token));
    assert.equal(clock.status, 200);
    assert.ok(Number(object(object(clock.body.data).supplement).remainingMs) > 0);
    const policy = await prisma.systemPolicy.findUniqueOrThrow({ where: { organizationId: fixture.organizationId } });
    const maintenance = await request('/api/v1/system-mode/changes', authenticated(admin, 'POST', {
      mode: 'MAINTENANCE', expectedVersion: policy.version, reason: 'Synthetic supplement pause check',
      titleZh: '补证暂停测试', titleEn: 'Supplement pause test', bodyZh: '测试维护', bodyEn: 'Synthetic maintenance',
      estimatedRecoveryAt: new Date(Date.now() + 3600000).toISOString(),
    }, uuidv7()));
    assert.equal(maintenance.status, 201);
    const readPaused = async () => {
      const response = await request('/api/v1/student/proof-todos', authenticated(token));
      assert.equal(response.status, 200);
      return (object(response.body.data).items as Record<string, unknown>[]).find(row => row.recordId === draft.id)!;
    };
    const pausedFirst = await readPaused();
    assert.equal(pausedFirst.paused, true);
    assert.equal(pausedFirst.expired, false);
    await new Promise(resolve => setTimeout(resolve, 250));
    const pausedSecond = await readPaused();
    assert.equal(pausedSecond.remainingSeconds, pausedFirst.remainingSeconds);
    assert.equal((await request('/api/v1/system-mode/changes', authenticated(admin, 'POST', {
      mode: 'NORMAL', expectedVersion: object(maintenance.body.data).policyVersion, reason: 'Synthetic supplement clock resume',
    }, uuidv7()))).status, 201);
    const resumedClock = await readPaused();
    assert.equal(resumedClock.paused, false);
    assert.ok(Date.parse(String(resumedClock.deadlineAt)) > Date.parse(String((object(todos.body.data).items as Record<string, unknown>[]).find(row => row.recordId === draft.id)!.deadlineAt)));
    const supplementInput = { mediaIds: [mediaId], expectedVersion: awaiting.version };
    const supplementKey = uuidv7();
    const supplemented = await request(`${path}/supplements`, authenticated(token, 'POST', supplementInput, supplementKey));
    assert.equal(supplemented.status, 201, JSON.stringify(supplemented.body));
    assert.deepEqual((await request(`${path}/supplements`, authenticated(token, 'POST', supplementInput, supplementKey))).body.data, supplemented.body.data);
    const ready = object(supplemented.body.data);
    assert.equal(ready.stage, 'PENDING_TEACHER');
    assert.equal(ready.materialVersion, 2);
    const secondReturn = await request(`${path}/v81-reviews`, authenticated(teacher, 'POST', {
      action: 'RETURN_FOR_SUPPLEMENT', reasonCode: 'UNCLEAR_EVIDENCE',
      supplementHours: 24, expectedVersion: ready.version,
    }, uuidv7()));
    assert.equal(secondReturn.status, 422);
    const decisionInput = { action: 'VALID', expectedVersion: ready.version };
    assert.equal((await request(`${path}/v81-reviews`, authenticated(token, 'POST', decisionInput, uuidv7()))).status, 403);
    const key = uuidv7();
    const decision = await request(`${path}/v81-reviews`, authenticated(teacher, 'POST', decisionInput, key));
    assert.equal(decision.status, 201);
    assert.equal(object(decision.body.data).creditedMinutes, 60);
    assert.deepEqual((await request(`${path}/v81-reviews`, authenticated(teacher, 'POST', decisionInput, key))).body.data, decision.body.data);
    assert.equal((await readProgress()).totalEffectiveSeconds, 3600);
    assert.equal((await directoryMetrics()).validRecords, 1);
    assert.equal((await directoryMetrics()).creditedSeconds, 3600);
    const workflow = await request(`${path}/workflow`, authenticated(token));
    assert.equal(workflow.status, 200);
    const state = object(workflow.body.data);
    assert.equal(state.stage, 'VALID');
    assert.equal(state.supplementUsed, true);
    assert.equal((state.materials as unknown[]).length, 2);
    const target = await request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}/progress-target`, authenticated(token));
    assert.equal(target.status, 200);
    assert.equal(object(target.body.data).totalTargetSeconds, 72000);
    assert.equal((await request('/api/v1/student-progress', authenticated(teacher))).status, 403);
    assert.equal((await request('/api/v1/teacher-progress', authenticated(token))).status, 403);
    assert.equal((await request('/api/v1/teacher-progress', authenticated(admin))).status, 403);
    const secondStudent = await seedExerciseSessionStudent(prisma, fixture, 'PROGRESS-PAGE', 'ACTIVE', false);
    const pageOne = await request('/api/v1/teacher-progress?limit=1', authenticated(teacher));
    assert.equal(pageOne.status, 200);
    const pagination = object(object(pageOne.body.meta).pagination);
    assert.equal(pagination.hasMore, true);
    const cursor = encodeURIComponent(String(pagination.nextCursor));
    const pageTwo = await request(`/api/v1/teacher-progress?limit=1&cursor=${cursor}`, authenticated(teacher));
    assert.equal(pageTwo.status, 200);
    assert.equal(object(object(pageTwo.body.meta).pagination).hasMore, false);
    assert.deepEqual(new Set([...(pageOne.body.data as Record<string, unknown>[]), ...(pageTwo.body.data as Record<string, unknown>[])].map(row => row.enrollmentId)), new Set([student.enrollmentId, secondStudent.enrollmentId]));
    assert.equal((await request(`/api/v1/teacher-progress?limit=2&cursor=${cursor}`, authenticated(teacher))).status, 422);
    assert.equal((await request('/api/v1/teacher-progress?limit=101', authenticated(teacher))).status, 422);

    await prisma.v81AccountSecurity.createMany({ data: [
      { userId: fixture.teacherBUserId, organizationId: fixture.organizationId, mustChangePassword: false, passwordChangedAt: new Date() },
      { userId: fixture.teacherCUserId, organizationId: fixture.isolationOrganizationId, mustChangePassword: false, passwordChangedAt: new Date() },
    ] });
    for (const account of [fixture.teacherBEmail, fixture.teacherCEmail]) {
      const otherLogin = await request('/api/v1/auth/password-login', authenticated('', 'POST',
        { account, password: TEST_PASSWORD }, uuidv7()));
      assert.equal(otherLogin.status, 200);
      const otherProgress = await request('/api/v1/teacher-progress', authenticated(String(object(otherLogin.body.data).accessToken)));
      assert.equal(otherProgress.status, 200);
      assert.equal((await request(`/api/v1/teacher-progress?limit=1&cursor=${cursor}`, authenticated(String(object(otherLogin.body.data).accessToken)))).status, 422);
      assert.ok(!(otherProgress.body.data as Record<string, unknown>[]).some(row => row.enrollmentId === student.enrollmentId));
    }
    const events = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM v81_events WHERE resource_id=${String(draft.id)}::uuid AND event_type='VALID'`;
    assert.equal(required(events[0]).count, 1);
    const correctionPath = `${path}/corrections`;
    const correctionInput = { action: 'INVALID', reasonCode: 'INCONSISTENT_EVIDENCE',
      correctionReason: 'Synthetic teacher recheck found inconsistent evidence', expectedVersion: state.version };
    const missingReason = { ...correctionInput, correctionReason: ' ' };
    assert.equal((await request(correctionPath, authenticated(teacher, 'POST', missingReason, uuidv7()))).status, 422);
    assert.equal((await request(correctionPath, authenticated(token, 'POST', correctionInput, uuidv7()))).status, 403);
    assert.equal((await readProgress()).totalEffectiveSeconds, 3600);
    const correctionKey = uuidv7();
    const corrected = await request(correctionPath, authenticated(teacher, 'POST', correctionInput, correctionKey));
    assert.equal(corrected.status, 201, JSON.stringify(corrected.body));
    assert.equal(object(corrected.body.data).stage, 'INVALID');
    const correctedMetrics = await directoryMetrics();
    assert.equal(correctedMetrics.invalidRecords, 1);
    assert.equal(correctedMetrics.validRecords, 0);
    assert.equal(correctedMetrics.creditedSeconds, 0);
    assert.deepEqual((await request(correctionPath, authenticated(teacher, 'POST', correctionInput, correctionKey))).body.data, corrected.body.data);
    assert.equal((await request(correctionPath, authenticated(teacher, 'POST', correctionInput, uuidv7()))).status, 409);
    assert.equal((await readProgress()).totalEffectiveSeconds, 0);
    const correctedRecord = await request(path, authenticated(token));
    assert.equal(correctedRecord.status, 200);
    assert.equal(object(correctedRecord.body.data).creditedDurationSeconds, 0);
    assert.equal(object(correctedRecord.body.data).actualDurationSeconds, 3600);
    assert.doesNotMatch(JSON.stringify(correctedRecord.body.data), /correctionReason|Synthetic teacher recheck/);
    const corrections = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM v81_events WHERE resource_id=${String(draft.id)}::uuid AND event_type='FACT_CORRECTED'`;
    assert.equal(required(corrections[0]).count, 1);
    assert.equal(await prisma.reviewRecord.count({ where: { recordId: String(draft.id) } }), 3);
  });
  it('approves, adjusts and revokes activity recognition with matching student progress and history', async () => {
    const token = await studentToken();
    const login = await request('/api/v1/auth/password-login', authenticated('', 'POST',
      { account: fixture.teacherEmail, password: TEST_PASSWORD }, uuidv7()));
    assert.equal(login.status, 200);
    const teacher = String(object(login.body.data).accessToken);
    const source = await prisma.mediaEvidence.findUniqueOrThrow({ where: { id: mediaId } });
    const proofId = uuidv7();
    await prisma.mediaEvidence.create({ data: { ...source, id: proofId, sessionId: null, enrollmentId: student.enrollmentId,
      businessPurpose: 'EXEMPTION_APPLICATION', captureSource: 'FILE_PICKER', storageKey: `synthetic/certification/${proofId}.png` } });
    const created = await request('/api/v1/exemption-applications', authenticated(token, 'POST', {
      enrollmentId: student.enrollmentId, applicationType: 'EXERCISE_CHECK_IN', applicationSubtype: 'SCHOOL_TEAM',
      organizationName: 'Synthetic team', reason: 'Synthetic participation', mediaIds: [proofId],
    }, uuidv7()));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const draft = object(created.body.data);
    const path = `/api/v1/exemption-applications/${draft.id}`;
    const submitted = await request(`${path}/submit`, authenticated(token, 'POST', { expectedVersion: draft.version }, uuidv7()));
    assert.equal(submitted.status, 200);
    const approved = await request(`${path}/review`, authenticated(teacher, 'POST', {
      decision: 'APPROVE', publicComment: 'Synthetic verified participation', courseMinutes: 120, generalMinutes: 0,
      expectedVersion: object(submitted.body.data).version,
    }, uuidv7()));
    assert.equal(approved.status, 200, JSON.stringify(approved.body));
    assert.equal(object(approved.body.data).status, 'APPROVED');
    const progress = async () => {
      const response = await request('/api/v1/student-progress', authenticated(token));
      assert.equal(response.status, 200);
      const own = object((response.body.data as Record<string, unknown>[]).find(row => row.enrollmentId === student.enrollmentId));
      const teacherResponse = await request('/api/v1/teacher-progress', authenticated(teacher));
      assert.equal(teacherResponse.status, 200);
      assert.deepEqual((teacherResponse.body.data as Record<string, unknown>[]).find(row => row.enrollmentId === student.enrollmentId), own);
      return own;
    };
    assert.equal(object((await progress()).courseRelated).recognizedSeconds, 7200);
    const listing = await request('/api/v1/activity-certification-applications', authenticated(token));
    assert.equal(listing.status, 200);
    assert.ok((listing.body.data as Record<string, unknown>[]).some(row => row.id === draft.id && row.status === 'APPROVED'));
    const historyPath = `/api/v1/activity-certification-applications/${draft.id}/recognition-allocation-revisions`;
    const history = await request(historyPath, authenticated(token));
    assert.equal(history.status, 200);
    assert.equal((history.body.data as Record<string, unknown>[]).length, 1);
    assert.equal(required((history.body.data as Record<string, unknown>[])[0]).courseSeconds, 7200);
    const adjustPath = `/api/v1/activity-certification-applications/${draft.id}/recognition-allocation-revisions`;
    const adjustment = { expectedVersion: object(approved.body.data).version, reason: 'Synthetic corrected recognized minutes', courseMinutes: 90, generalMinutes: 15 };
    assert.equal((await request(adjustPath, authenticated(token, 'POST', adjustment, uuidv7()))).status, 403);
    const otherLogin = await request('/api/v1/auth/password-login', authenticated('', 'POST', {account:fixture.teacherBEmail,password:TEST_PASSWORD}, uuidv7()));
    assert.equal(otherLogin.status,200);
    const otherToken=String(object(otherLogin.body.data).accessToken),security=await request('/api/v1/auth/account-security',authenticated(otherToken));
    assert.equal(security.status,200);
    if(object(security.body.data).mustChangePassword){const password=TEST_PASSWORD+'Changed1!';assert.equal((await request('/api/v1/auth/own-password',authenticated(otherToken,'POST',{
      currentPassword:TEST_PASSWORD,newPassword:password,confirmPassword:password,expectedVersion:object(security.body.data).version},uuidv7()))).status,201);}
    assert.equal((await request(adjustPath, authenticated(otherToken,'POST',adjustment,uuidv7()))).status,404);
    for(const invalid of [{...adjustment,reason:' '},{...adjustment,courseMinutes:1.5},{...adjustment,courseMinutes:1200,generalMinutes:1}])
      assert.equal((await request(adjustPath,authenticated(teacher,'POST',invalid,uuidv7()))).status,422);
    const section=await prisma.classSection.findUniqueOrThrow({where:{id:fixture.teacherAActiveSectionId}});
    assert.equal((await request(`/api/v1/class-sections/${section.id}/close`,authenticated(teacher,'POST',{reason:'Synthetic existing certification adjustment after closure',expectedVersion:section.version},uuidv7()))).status,200);
    const adjustKey=uuidv7(),adjusted=await request(adjustPath,authenticated(teacher,'POST',adjustment,adjustKey));
    assert.equal(adjusted.status,201,JSON.stringify(adjusted.body));
    assert.equal(object(adjusted.body.data).version,Number(adjustment.expectedVersion)+1);
    assert.deepEqual((await request(adjustPath,authenticated(teacher,'POST',adjustment,adjustKey))).body.data,adjusted.body.data);
    assert.equal((await request(adjustPath,authenticated(teacher,'POST',adjustment,uuidv7()))).status,409);
    assert.equal(object((await progress()).courseRelated).recognizedSeconds,5400);
    assert.equal(object((await progress()).general).recognizedSeconds,900);
    const adjustedHistory=await request(historyPath,authenticated(token));
    assert.equal((adjustedHistory.body.data as unknown[]).length,2);
    assert.deepEqual((adjustedHistory.body.data as unknown[])[1],(history.body.data as unknown[])[0]);
    await assert.rejects(prisma.exemptionApplication.update({where:{id:String(draft.id)},data:{reason:'Forbidden rewrite',version:{increment:1}}}));
    const revokePath = `/api/v1/activity-certification-applications/${draft.id}/revoke`;
    const input = { expectedVersion: object(adjusted.body.data).version, reason: 'Synthetic corrected participation' };
    assert.equal((await request(revokePath, authenticated(token, 'POST', input, uuidv7()))).status, 403);
    const key = uuidv7();
    const revoked = await request(revokePath, authenticated(teacher, 'POST', input, key));
    assert.equal(revoked.status, 201, JSON.stringify(revoked.body));
    assert.equal(object(revoked.body.data).status, 'REVOKED');
    assert.deepEqual((await request(revokePath, authenticated(teacher, 'POST', input, key))).body.data, revoked.body.data);
    assert.equal((await request(revokePath, authenticated(teacher, 'POST', input, uuidv7()))).status, 409);
    assert.equal(object((await progress()).courseRelated).recognizedSeconds, 0);
    const after = await request(historyPath, authenticated(token));
    assert.equal(after.status, 200);
    assert.deepEqual((after.body.data as Record<string, unknown>[]).map(row => row.active), [false, true, true]);
    assert.equal((await request(adjustPath,authenticated(teacher,'POST',{...adjustment,expectedVersion:object(revoked.body.data).version},uuidv7()))).status,409);
    for (const reader of [token, teacher]) {
      const structured = await request('/api/v1/exemption-application-details?limit=100', authenticated(reader));
      assert.equal(structured.status, 200);
      const retained = (structured.body.data as Record<string, unknown>[]).find(row => row.id === draft.id);
      assert.ok(retained);
      assert.equal(retained.status, 'REVOKED');
      assert.equal(retained.publicComment, input.reason);
    }
    const credits = await prisma.$queryRaw<{ active: boolean }[]>`SELECT active FROM v81_certification_credits WHERE application_id=${String(draft.id)}::uuid`;
    assert.deepEqual(credits, [{ active: false }]);
  });
  it('locks swimming before and after evidence once and exposes the transfer clock', async () => {
    const token = await studentToken();
    const login = async (account: string) => {
      const result = await request('/api/v1/auth/password-login', authenticated('', 'POST',
        { account, password: TEST_PASSWORD }, uuidv7()));
      assert.equal(result.status, 200, JSON.stringify(result.body));
      return String(object(result.body.data).accessToken);
    };
    const teacher = await login(fixture.teacherEmail);
    const admin = await login(fixture.adminEmail);
    const original = await prisma.mediaEvidence.findUniqueOrThrow({ where: { id: mediaId } });
    const afterId = uuidv7();
    await prisma.mediaEvidence.create({ data: { ...original, id: afterId,
      storageKey: `synthetic/swim/${afterId}`, declaredContentSha256: 'c'.repeat(64),
      verifiedContentSha256: 'c'.repeat(64) } });
    const created = await request('/api/v1/exercise-records', authenticated(token, 'POST', {
      sessionId, creditType: 'GENERAL', sportType: 'SWIMMING',
      description: 'Synthetic swim intake', clientRequestId: `web-${uuidv7()}`,
    }, uuidv7()));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const record = object(created.body.data);
    const path = `/api/v1/exercise-records/${record.id}/swim-intake`;
    const body = { expectedVersion: record.version, items: [
      { mediaId, phase: 'BEFORE' }, { mediaId: afterId, phase: 'AFTER' },
    ] };
    assert.equal((await request(path, authenticated(token))).status, 404);
    assert.equal((await request(path, authenticated(teacher, 'POST', body, uuidv7()))).status, 403);
    assert.equal((await request(path, authenticated(admin, 'POST', body, uuidv7()))).status, 403);
    assert.equal((await request(path, authenticated(token, 'POST', { ...body,
      items: [{ mediaId, phase: 'BEFORE' }, { mediaId, phase: 'AFTER' }] }, uuidv7()))).status, 422);
    assert.equal((await request(path, authenticated(token, 'POST', { ...body,
      items: [{ mediaId, phase: 'BEFORE' }, { mediaId: afterId, phase: 'OTHER' }] }, uuidv7()))).status, 422);
    const key = uuidv7();
    const accepted = await request(path, authenticated(token, 'POST', body, key));
    assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
    assert.deepEqual((await request(path, authenticated(token, 'POST', body, key))).body.data, accepted.body.data);
    assert.equal((await request(path, authenticated(token, 'POST', body, uuidv7()))).status, 409);
    const intake = object(accepted.body.data);
    assert.equal(intake.intakeKind, 'ON_TIME');
    assert.deepEqual(intake.items, body.items);
    assert.equal(new Date(String(intake.transferDeadline)).getTime() - new Date(String(intake.acceptedAt)).getTime(), 1800000);
    const status = await request(path, authenticated(token));
    assert.equal(status.status, 200, JSON.stringify(status.body));
    const clock = object(status.body.data);
    assert.equal(clock.readyForReview, false);
    assert.equal(clock.completedAt, null);
    assert.equal(clock.transferLate, false);
    assert.ok(Number(clock.remainingMs) > 0 && Number(clock.remainingMs) <= 1800000);
    assert.equal((clock.items as unknown[]).length, 2);
    const rows = await prisma.$queryRaw<{ total: bigint }[]>`SELECT count(*) AS total FROM v81_swim_intake_items WHERE record_id=${String(record.id)}::uuid`;
    assert.equal(Number(required(rows[0]).total), 2);
  });

});
