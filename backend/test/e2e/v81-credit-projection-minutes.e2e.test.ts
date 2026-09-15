import { Readable } from 'node:stream';
import type { ObjectStoragePort, PutPrivateObjectInput } from '../../src/common/object-storage/object-storage.port.js';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import { ValidationPipe, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, urlencoded } from 'express';
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
} from '../helpers/test-environment.js';

class MemoryObjectStorage implements ObjectStoragePort {
  checkHealth(): Promise<void> {
    return Promise.resolve();
  }

  readonly objects = new Map<string, Buffer>();

  async putPrivateObject(input: PutPrivateObjectInput): Promise<{ entityTag: string | null }> {
    const chunks: Buffer[] = [];
    for await (const chunk of input.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    this.objects.set(input.storageKey, Buffer.concat(chunks));
    return { entityTag: null };
  }

  getPrivateObject(storageKey: string): Promise<Readable> {
    const value = this.objects.get(storageKey);
    if (value === undefined) return Promise.reject(new Error('Synthetic object not found'));
    return Promise.resolve(Readable.from([value]));
  }

  deletePrivateObject(storageKey: string): Promise<void> {
    this.objects.delete(storageKey);
    return Promise.resolve();
  }
}

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

describe('V81 teacher review above 60 minutes HTTP E2E', () => {
  const storage = new MemoryObjectStorage();
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
    Object.assign(process.env, foundationEnvironment(databaseUrl, port), { REQUEST_BODY_LIMIT_BYTES: '2097152', OCR_PROVIDER: 'TENCENT_TABLE_V3', OCR_TENCENT_REGION: 'ap-guangzhou', OCR_WORKER_ENABLED: 'false' });
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
    const { OBJECT_STORAGE_PORT } = await import(compiledModule('common/object-storage/object-storage.port.js'));
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(OBJECT_STORAGE_PORT).useValue(storage).compile();
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

  const data = (result: HttpResult, status = 200) => {
    assert.equal(result.status, status, JSON.stringify(result.body));
    return object(result.body.data);
  };

  const cases = [
    { minutes: 65, maximum: 120, action: 'VALID', eligible: 65, credited: 65 },
    { minutes: 76, maximum: 120, action: 'VALID', eligible: 76, credited: 76 },
    { minutes: 65, maximum: 120, action: 'RETURN_FOR_SUPPLEMENT', eligible: 65, credited: 0 },
    { minutes: 76, maximum: 120, action: 'RETURN_FOR_SUPPLEMENT', eligible: 76, credited: 0 },
    { minutes: 76, maximum: null, action: 'VALID', eligible: 60, credited: 60 },
    { minutes: 1440, maximum: 1440, action: 'VALID', eligible: 1440, credited: 1200 },
  ] as const;

  for (const scenario of cases) {
    it(scenario.minutes + ' minutes ' + scenario.action + ' snapshot ' + scenario.maximum, async () => {
      const teacher = await login(fixture.teacherEmail);
      const admin = await login(fixture.adminEmail);
      await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: {
        checkInWindowMode: 'AVAILABLE',
        checkInStartDate: new Date('2026-09-01T00:00:00Z'),
        checkInEndDate: new Date('2027-01-22T00:00:00Z'),
        dailyStartTime: new Date('1970-01-01T00:00:00Z'),
        dailyEndTime: new Date('1970-01-01T23:59:59Z'),
      } });
      const post = (route: string, input: Record<string, unknown>, token = teacher, key = uuidv7()) =>
        request('/api/v1' + route, authenticated(token, 'POST', input, key));
      const template = data(await post('/rule-templates', {
        displayName: 'Synthetic extended credit rules', expectedVersion: 0,
      }, admin), 201);
      data(await post('/class-sections/' + fixture.teacherAActiveSectionId + '/v81-rules', {
        templateId: template.id, minimumMinutes: 30, maximumMinutes: 1440,
        weeklyLimit: 3, dailyLimit: 1, courseTarget: 0, generalTarget: 1200, globalTargetVersion: 0,
        regularDeadline: '2027-01-23T15:59:59Z', closingDeadline: '2027-01-30T15:59:59Z',
        settlementPlannedAt: '2027-01-30T16:00:00Z', publish: true, expectedVersion: 0,
      }), 201);
      const record = await seedSubmittedExerciseRecord(prisma, fixture, 'CREDIT-0077', 'PENDING', {
        actualSeconds: scenario.minutes * 60,
        configureCourse: false,
        maximumSeconds: scenario.maximum === null ? null : scenario.maximum * 60,
      });
      await prisma.v81RecordWorkflow.create({ data: {
        recordId: record.recordId, organizationId: fixture.organizationId, stage: 'PENDING_TEACHER',
      } });
      const snapshot = await prisma.$queryRaw<{maximum_minutes: number}[]>`
        SELECT maximum_minutes FROM v81_record_rule_snapshots WHERE record_id=${record.recordId}::uuid`;
      assert.equal(snapshot[0]?.maximum_minutes, scenario.maximum ?? 60);
      const input = {
        action: scenario.action, expectedVersion: 1,
        ...(scenario.action === 'RETURN_FOR_SUPPLEMENT'
          ? { reasonCode: 'MISSING_REQUIRED_EVIDENCE', supplementHours: 24 } : {}),
      };
      const route = '/exercise-records/' + record.recordId + '/v81-reviews';
      const key = uuidv7();
      const reviewed = data(await post(route, input, teacher, key), 201);
      assert.equal(reviewed.stage, scenario.action === 'VALID' ? 'VALID' : 'AWAITING_SUPPLEMENT');
      assert.equal(reviewed.creditedMinutes, scenario.credited);
      assert.deepEqual(data(await post(route, input, teacher, key), 201), reviewed);
      assert.equal((await post(route, input)).status, 409);
      const credit = (await prisma.$queryRaw<{eligible_minutes: number; credited_minutes: number; selected: boolean}[]>`
        SELECT eligible_minutes,credited_minutes,selected FROM v81_credit_projections
        WHERE record_id=${record.recordId}::uuid`)[0]!;
      assert.equal(credit.eligible_minutes, scenario.eligible);
      assert.equal(credit.credited_minutes, scenario.credited);
      assert.equal(credit.selected, scenario.action === 'VALID');
      const workflow = await prisma.v81RecordWorkflow.findUniqueOrThrow({where: {recordId: record.recordId}});
      assert.equal(workflow.stage, reviewed.stage);
      assert.equal(workflow.version, 2);
      assert.equal(workflow.supplementUsed, scenario.action === 'RETURN_FOR_SUPPLEMENT');
      assert.deepEqual(await prisma.$queryRaw`
        SELECT maximum_minutes FROM v81_record_rule_snapshots WHERE record_id=${record.recordId}::uuid`, snapshot);
      assert.equal((await prisma.exerciseRecord.findUniqueOrThrow({where: {id: record.recordId}})).actualDurationSeconds,
        BigInt(scenario.minutes * 60));
      assert.equal(await prisma.notification.count({where: {recipientUserId: record.studentUserId}}), 1);
      // Check the actual database bounds, including credited <= eligible.
      for (const [eligible, credited] of [[-1, 0], [1441, 0], [60, 61], [60, -1]]) {
        await assert.rejects(prisma.$executeRaw`
          UPDATE v81_credit_projections SET eligible_minutes=${eligible!},credited_minutes=${credited!}
          WHERE record_id=${record.recordId}::uuid`);
      }
      assert.deepEqual((await prisma.$queryRaw<Record<string, unknown>[]>`
        SELECT eligible_minutes,credited_minutes,selected FROM v81_credit_projections
        WHERE record_id=${record.recordId}::uuid`)[0], credit);
    });
  }
});
