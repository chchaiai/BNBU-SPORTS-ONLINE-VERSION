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
import { seedSubmittedExerciseRecord } from '../helpers/exercise-review.js';
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

describe('ExerciseReview HTTP E2E', () => {
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
    await prisma.v81AccountSecurity.createMany({ data: [
      fixture.teacherUserId, fixture.teacherBUserId, fixture.adminUserId,
    ].map(userId => ({
      userId, organizationId: fixture.organizationId,
      mustChangePassword: false, passwordChangedAt: new Date(),
    })) });
    await prisma.v81AccountSecurity.create({ data: {
      userId: fixture.teacherCUserId, organizationId: fixture.isolationOrganizationId,
      mustChangePassword: false, passwordChangedAt: new Date(),
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
    assert.equal(response.status, 200);
    return String(object(response.body.data).accessToken);
  };

  const studentToken = async (userId: string): Promise<string> => {
    const session = await prisma.authSession.findFirstOrThrow({ where: { userId } });
    const seconds = Math.floor(Date.now() / 1000);
    return new SignJWT({
      organizationId: session.organizationId,
      role: 'STUDENT',
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

  it('lets the responsible teacher append INVALID to a system-valid submission', async () => {
    const seeded = await seedSubmittedExerciseRecord(prisma, fixture, 'AUTO-VALID', 'VALID');
    const teacher = await login(fixture.teacherEmail);

    const invalid = await request(
      `/api/v1/exercise-records/${seeded.recordId}/reviews`,
      authenticated(
        teacher,
        'POST',
        {
          result: 'INVALID',
          reasonCode: 'INVALID_MEDIA',
          reason: 'Synthetic media mismatch',
          publicComment: '凭证存在问题',
          internalNote: null,
          creditedDurationOverrideSeconds: null,
          expectedReviewVersion: 1,
          expectedVersion: 2,
        },
        uuidv7(),
      ),
    );

    assert.equal(invalid.status, 201, JSON.stringify(invalid.body));
    assert.equal(object(invalid.body.data).result, 'INVALID');
    const record = await prisma.exerciseRecord.findUniqueOrThrow({
      where: { id: seeded.recordId },
    });
    assert.equal(record.status, 'REVIEWED');
    assert.equal(record.version, 3);
    const reviews = await prisma.reviewRecord.findMany({
      where: { recordId: seeded.recordId },
      orderBy: { reviewVersion: 'asc' },
    });
    assert.deepEqual(
      reviews.map(({ result, teacherId }) => ({ result, teacherId })),
      [
        { result: 'VALID', teacherId: null },
        { result: 'INVALID', teacherId: fixture.teacherProfileId },
      ],
    );
  });

  it('appends VALID, lists history, reopens, and appends INVALID without changing duration facts', async () => {
    const seeded = await seedSubmittedExerciseRecord(prisma, fixture, 'FLOW');
    const teacher = await login(fixture.teacherEmail);
    const now = new Date();
    const mediaId = uuidv7();
    const scoreRule = await prisma.scoreRule.create({
      data: {
        id: uuidv7(),
        organizationId: fixture.organizationId,
        classSectionId: fixture.teacherAActiveSectionId,
        semesterId: fixture.semesterId,
        ruleCode: 'REVIEW_FLOW_20H',
        ruleVersion: 1,
        displayName: 'Synthetic review flow 20 hour rule',
        totalRequiredSeconds: 72_000n,
        calculationDefinition: {
          formulaType: 'LINEAR_CAPPED',
          maximumScore: 100,
          categoryAllocationMode: 'TOTAL_ONLY',
        },
        roundingMode: 'HALF_UP',
        roundingScale: 2,
        status: 'ACTIVE',
        createdBy: fixture.adminUserId,
        submittedAt: now,
        activatedAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    await prisma.mediaEvidence.create({
      data: {
        id: mediaId,
        organizationId: fixture.organizationId,
        ownerStudentId: seeded.studentId,
        sessionId: seeded.sessionId,
        initiatedByUserId: seeded.studentUserId,
        businessPurpose: 'EXERCISE_RECORD',
        mediaType: 'IMAGE',
        captureSource: 'IN_APP_CAMERA',
        declaredMimeType: 'image/png',
        verifiedMimeType: 'image/png',
        declaredFileSizeBytes: 45n,
        verifiedFileSizeBytes: 45n,
        verifiedContentSha256: '0'.repeat(64),
        uploadStatus: 'AVAILABLE',
        storageKey: `media/${fixture.organizationId}/${mediaId}/image`,
        uploadedAt: now,
        boundAt: now,
        processingStartedAt: now,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
        version: 4,
      },
    });
    await prisma.exerciseRecordMedia.create({
      data: {
        organizationId: fixture.organizationId,
        recordId: seeded.recordId,
        mediaId,
        sessionId: seeded.sessionId,
        ownerStudentId: seeded.studentId,
        position: 1,
        createdAt: now,
      },
    });
    const originalMedia = await request(
      `/api/v1/media/${mediaId}/access-url`,
      authenticated(teacher, 'POST', { purpose: 'VIEW_ORIGINAL' }, uuidv7()),
    );
    assert.equal(originalMedia.status, 200, JSON.stringify(originalMedia.body));
    assert.equal(object(originalMedia.body.data).mediaId, mediaId);
    assert.equal(Object.hasOwn(object(originalMedia.body.data), 'storageKey'), false);
    const hiddenNote = await request(
      `/api/v1/exercise-records/${seeded.recordId}/reviews`,
      authenticated(
        teacher,
        'POST',
        {
          result: 'VALID',
          publicComment: 'Synthetic accepted evidence',
          internalNote: 'Synthetic teacher-only note',
          expectedReviewVersion: 1,
          expectedVersion: 2,
        },
        uuidv7(),
      ),
    );
    assert.equal(hiddenNote.status, 422);
    assert.equal(hiddenNote.body.code, 'VALIDATION_FAILED');
    assert.equal(await prisma.reviewRecord.count({ where: { recordId: seeded.recordId } }), 1);
    assert.equal((await prisma.exerciseRecord.findUniqueOrThrow({ where: { id: seeded.recordId } })).version, 2);
    const valid = await request('/api/v1/exercise-records/' + seeded.recordId + '/reviews',
      authenticated(teacher, 'POST', { result: 'VALID', publicComment: 'Synthetic accepted evidence',
        expectedReviewVersion: 1, expectedVersion: 2 }, uuidv7()));
    assert.equal(valid.status, 201, JSON.stringify(valid.body));
    assert.equal(object(valid.body.data).reviewVersion, 2);
    const createdScore = await prisma.studentScore.findFirstOrThrow({
      where: { studentId: seeded.studentId },
      include: { currentWorkingRevision: true },
    });
    assert.equal(createdScore.currentWorkingRevision?.scoreRuleId, scoreRule.id);
    assert.equal(createdScore.currentWorkingRevision?.totalValidCreditedSeconds, 3600n);

    const history = await request(
      `/api/v1/exercise-records/${seeded.recordId}/reviews?limit=10`,
      authenticated(teacher),
    );
    assert.equal(history.status, 200);
    assert.equal((history.body.data as unknown[]).length, 2);
    assert.equal(
      object((history.body.data as unknown[])[0]).internalNote,
      null,
    );

    const reopened = await request(
      `/api/v1/exercise-records/${seeded.recordId}/reviews/reopen`,
      authenticated(
        teacher,
        'POST',
        { reason: 'Synthetic correction', expectedReviewVersion: 2, expectedVersion: 3 },
        uuidv7(),
      ),
    );
    assert.equal(reopened.status, 201);
    assert.equal(object(reopened.body.data).result, 'PENDING');
    assert.equal(object(reopened.body.data).teacherId, null);

    const invalid = await request(
      `/api/v1/exercise-records/${seeded.recordId}/reviews`,
      authenticated(
        teacher,
        'POST',
        {
          result: 'INVALID',
          reasonCode: 'INVALID_MEDIA',
          publicComment: 'Synthetic replacement rejected',
          internalNote: null,
          expectedReviewVersion: 3,
          expectedVersion: 4,
        },
        uuidv7(),
      ),
    );
    assert.equal(invalid.status, 201);
    const record = await prisma.exerciseRecord.findUniqueOrThrow({
      where: { id: seeded.recordId },
    });
    assert.equal(record.status, 'REVIEWED');
    assert.equal(record.version, 5);
    assert.equal(record.actualDurationSeconds, 3600n);
    assert.equal(record.creditedDurationSeconds, 3600n);
    const recalculatedScore = await prisma.studentScore.findFirstOrThrow({
      where: { studentId: seeded.studentId },
      include: { currentWorkingRevision: true },
    });
    assert.equal(recalculatedScore.currentWorkingRevision?.totalValidCreditedSeconds, 0n);

    const student = await studentToken(seeded.studentUserId);
    const studentProjection = await request(
      `/api/v1/exercise-records/${seeded.recordId}`,
      authenticated(student),
    );
    const currentReview = object(object(studentProjection.body.data).currentReview);
    assert.equal(currentReview.result, 'INVALID');
    assert.equal(Object.hasOwn(currentReview, 'internalNote'), false);
    assert.equal(Object.hasOwn(currentReview, 'teacherId'), false);
  });

  it('replays one decision and permits only one concurrent stale decision', async () => {
    const first = await seedSubmittedExerciseRecord(prisma, fixture, 'IDEMPOTENT');
    const teacher = await login(fixture.teacherEmail);
    const key = uuidv7();
    const body = { result: 'VALID', expectedReviewVersion: 1, expectedVersion: 2 };
    const one = await request(
      `/api/v1/exercise-records/${first.recordId}/reviews`,
      authenticated(teacher, 'POST', body, key),
    );
    const replay = await request(
      `/api/v1/exercise-records/${first.recordId}/reviews`,
      authenticated(teacher, 'POST', body, key),
    );
    assert.deepEqual(replay.body.data, one.body.data);

    const second = await seedSubmittedExerciseRecord(prisma, fixture, 'RACE');
    const results = await Promise.all([
      request(
        `/api/v1/exercise-records/${second.recordId}/reviews`,
        authenticated(teacher, 'POST', body, uuidv7()),
      ),
      request(
        `/api/v1/exercise-records/${second.recordId}/reviews`,
        authenticated(
          teacher,
          'POST',
          { ...body, result: 'INVALID', reasonCode: 'INVALID_MEDIA' },
          uuidv7(),
        ),
      ),
    ]);
    assert.deepEqual(results.map((result) => result.status).sort(), [201, 409]);
    assert.equal(await prisma.reviewRecord.count({ where: { recordId: second.recordId } }), 2);
  });

  it('returns ordered partial batch outcomes and exact replay', async () => {
    const accepted = await seedSubmittedExerciseRecord(prisma, fixture, 'BATCH-A');
    const rejected = await seedSubmittedExerciseRecord(prisma, fixture, 'BATCH-B');
    const teacher = await login(fixture.teacherEmail);
    const key = uuidv7();
    const body = {
      items: [
        {
          itemKey: 'accepted',
          recordId: accepted.recordId,
          result: 'VALID',
          expectedReviewVersion: 1,
          expectedVersion: 2,
        },
        {
          itemKey: 'override-denied',
          recordId: rejected.recordId,
          result: 'VALID',
          creditedDurationOverrideSeconds: 3600,
          expectedReviewVersion: 1,
          expectedVersion: 2,
        },
      ],
    };
    const batch = await request(
      '/api/v1/exercise-reviews/batch',
      authenticated(teacher, 'POST', body, key),
    );
    assert.equal(batch.status, 200);
    const items = object(batch.body.data).items as Record<string, unknown>[];
    assert.deepEqual(
      items.map((item) => item.status),
      ['SUCCEEDED', 'FAILED'],
    );
    assert.equal(object(items[1]?.error).code, 'REVIEW_CREDIT_OVERRIDE_NOT_APPROVED');
    const replay = await request(
      '/api/v1/exercise-reviews/batch',
      authenticated(teacher, 'POST', body, key),
    );
    assert.deepEqual(replay.body.data, batch.body.data);
    assert.equal(await prisma.reviewRecord.count({ where: { recordId: accepted.recordId } }), 2);
    assert.equal(await prisma.reviewRecord.count({ where: { recordId: rejected.recordId } }), 1);
  });

  it('denies STUDENT and ADMIN review operations before business mutation', async () => {
    const seeded = await seedSubmittedExerciseRecord(prisma, fixture, 'DENY');
    const student = await studentToken(seeded.studentUserId);
    const admin = await login(fixture.adminEmail);
    const foreignTeacher = await login(fixture.teacherBEmail);
    const crossOrganizationTeacher = await login(fixture.teacherCEmail);
    const body = { result: 'VALID', expectedReviewVersion: 1, expectedVersion: 2 };
    for (const denied of [student, admin]) {
      const response = await request(
        `/api/v1/exercise-records/${seeded.recordId}/reviews`,
        authenticated(denied, 'POST', body, uuidv7()),
      );
      assert.equal(response.status, 403);
    }
    for (const denied of [foreignTeacher, crossOrganizationTeacher]) {
      const response = await request(
        `/api/v1/exercise-records/${seeded.recordId}/reviews`,
        authenticated(denied, 'POST', body, uuidv7()),
      );
      assert.equal(response.status, 404);
    }
    const batch = await request(
      '/api/v1/exercise-reviews/batch',
      authenticated(
        foreignTeacher,
        'POST',
        { items: [{ itemKey: 'foreign', recordId: seeded.recordId, ...body }] },
        uuidv7(),
      ),
    );
    assert.equal(batch.status, 200);
    const item = (object(batch.body.data).items as Record<string, unknown>[])[0];
    assert.equal(item?.status, 'FAILED');
    assert.equal(object(item?.error).code, 'EXERCISE_RECORD_NOT_FOUND');
    assert.equal(await prisma.reviewRecord.count({ where: { recordId: seeded.recordId } }), 1);
  });
});
