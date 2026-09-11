import { createHash } from 'node:crypto';
import sharp from 'sharp';
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

describe('V81 OCR intake and job HTTP E2E', () => {
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

  for (const [closeAfterAcceptance, mimeType] of [[false, 'image/png'], [true, 'image/png'], [true, 'image/webp']] as const) {
  it(`uploads private OCR pages and completes recognition and confirmation with course ${closeAfterAcceptance ? 'closed after acceptance' : 'open'} (${mimeType})`, async () => {
    const teacher = await login(fixture.teacherEmail);
    const other = await login(fixture.teacherBEmail);
    const admin = await login(fixture.adminEmail);
    const emptyBasis = data(await request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}/roster-basis`, authenticated(teacher)));
    assert.equal(emptyBasis.sourceKind, null);
    assert.equal(emptyBasis.confirmedRosterId, null);
    const { syntheticPng } = await import('../../../tools/local-integration/synthetic-png.mjs');
    const bytes = mimeType === 'image/webp' ? await sharp(syntheticPng()).webp({lossless:true}).toBuffer() : syntheticPng();
    const upload = async (purpose: string, access = teacher, key = uuidv7()) => {
      const form = new FormData();
      form.append('pages', new Blob([bytes], { type: mimeType }), mimeType === 'image/webp' ? 'synthetic.webp' : 'synthetic.png');
      return request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}/ocr-${purpose}-batches`, {
        method: 'POST', headers: { authorization: `Bearer ${access}`, 'idempotency-key': key }, body: form,
      });
    };
    const businessRequest = async (route: string, access: string, input?: Record<string, unknown>, key = uuidv7()) => {
      const response = await request(`/api/v1${route}`, authenticated(access, input === undefined ? 'GET' : 'POST', input, key));
      assert.ok(response.status >= 200 && response.status < 300, JSON.stringify(response.body));
      return object(response.body.data);
    };
    const existingMember = closeAfterAcceptance ? await seedExerciseSessionStudent(prisma, fixture, 'OCR-MEM') : undefined;
    const existingOutside = closeAfterAcceptance ? await seedExerciseSessionStudent(prisma, fixture, 'OCR-OUT') : undefined;
    const publishRules = async () => {
    await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: {
      dailyStartTime: new Date('1970-01-01T00:00:00Z'), dailyEndTime: new Date('1970-01-01T23:59:59Z'),
    } });
    const template = await businessRequest('/rule-templates', admin, { displayName: 'Synthetic OCR member rules', expectedVersion: 0 });
    await businessRequest(`/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`, teacher, {
      templateId: template.id, minimumMinutes: 30, weeklyLimit: 3, courseTarget: 600, generalTarget: 600,
      regularDeadline: '2027-01-23T15:59:59Z', closingDeadline: '2027-01-30T15:59:59Z',
      settlementPlannedAt: '2027-01-30T16:00:00Z', publish: true, expectedVersion: 0,
    });
    };
    if (closeAfterAcceptance) await publishRules();
    const key = uuidv7();
    const batch = data(await upload('roster', teacher, key), 201);
    assert.deepEqual(data(await upload('roster', teacher, key), 201), batch);
    const physical = data(await upload('physical'), 201);
    assert.notEqual(physical.id, batch.id);
    assert.equal((await upload('roster', admin)).status, 403);
    assert.equal((await upload('roster', other)).status, 404);
    if (closeAfterAcceptance) {
      const section = data(await request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}`, authenticated(teacher)));
      data(await request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}/close`, authenticated(teacher, 'POST', {
        expectedVersion: section.version, reason: 'Synthetic close after OCR source acceptance',
      }, uuidv7())));
      assert.equal((await upload('roster')).status, 409);
      assert.equal((await upload('physical')).status, 409);
      assert.deepEqual(data(await upload('roster', teacher, key), 201), batch);
      const acceptedSources = await prisma.$queryRaw<{ legal: boolean }[]>`
        SELECT bool_and(b.created_at <= c.closed_at) AS legal FROM v81_ocr_batches b
        JOIN class_sections c ON c.id=b.class_section_id WHERE c.id=${fixture.teacherAActiveSectionId}::uuid`;
      assert.deepEqual(acceptedSources, [{ legal: true }]);
    }

    const page = (batch.pages as Record<string, unknown>[])[0];
    assert.ok(page);
    assert.equal(page.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(page.storageKey, undefined);
    const path = `/api/v1/ocr-batches/${batch.id}`;
    const detail = data(await request(path, authenticated(teacher)));
    assert.equal(detail.id, batch.id);
    assert.equal(detail.classSectionId, fixture.teacherAActiveSectionId);
    const detailPage = (detail.pages as Record<string, unknown>[])[0];
    assert.ok(detailPage);
    assert.equal(detailPage.id, page.id);
    assert.equal(detailPage.sha256, page.sha256);
    assert.equal(detailPage.storageKey, undefined);
    assert.equal(detailPage.latestAttempt, null);
    assert.equal((await request(path, authenticated(admin))).status, 403);
    const recognition = `${path}/pages/${page.id}/recognition`;
    const source = data(await request(`${path}/pages/${page.id}/source`, authenticated(teacher)));
    assert.ok(Buffer.from(String(source.fileBase64), 'base64').equals(bytes));
    assert.equal(data(await request(recognition, authenticated(teacher))).latestAttempt, null);
    const listed = data(await request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}/ocr-batches?limit=1`, authenticated(teacher)));
    assert.equal((listed.items as unknown[]).length, 1);
    assert.ok(listed.nextBeforeId);
    const next = data(await request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}/ocr-batches?limit=1&beforeId=${listed.nextBeforeId}`, authenticated(teacher)));
    assert.equal((next.items as unknown[]).length, 1);
    assert.equal(next.nextBeforeId, null);
    const enqueue = (attempt: number, key = uuidv7()) => request(recognition, authenticated(teacher, 'POST', { expectedAttempt: attempt }, key));
    const jobKey = uuidv7();
    const job = data(await enqueue(0, jobKey), 201);
    assert.equal(job.status, 'QUEUED');
    assert.deepEqual(data(await enqueue(0, jobKey), 201), job);
    assert.equal((await enqueue(0)).status, 409);
    assert.equal((await request(path, authenticated(other))).status, 404);
    const { V81OcrWorker } = await import(compiledModule('modules/v8/v81-ocr.worker.js'));
    const { TencentOcrProvider } = await import(compiledModule('modules/v8/tencent-ocr-provider.js'));
    const configuration = { provider: 'TENCENT_TABLE_V3', region: 'ap-guangzhou', timeoutMs: 1000, workerEnabled: true };
    let calls = 0;
    const provider = new TencentOcrProvider(configuration, { async request(action: string, body: Record<string, unknown>) {
      calls++;
      assert.equal(action, 'RecognizeTableAccurateOCR');
      const sent = Buffer.from(String(body.ImageBase64), 'base64');
      if (mimeType === 'image/webp') {
        assert.equal((await sharp(sent).metadata()).format, 'png');
        assert.deepEqual(await sharp(sent).raw().toBuffer(), await sharp(bytes).raw().toBuffer());
      } else assert.ok(sent.equals(bytes));
      if (calls === 1) throw Object.assign(new Error('Synthetic timeout'), { code: 'ETIMEDOUT' });
      return { RequestId: 'synthetic-recognition', TableDetections: [{ Cells: [{ Text: '000123', RowTl: 1, RowBr: 2, ColTl: 0, ColBr: 1,
        Confidence: 95, Polygon: [{ X: 0, Y: 0 }, { X: 10, Y: 0 }, { X: 10, Y: 10 }, { X: 0, Y: 10 }] },
        ...[['学号', 0, 0], ['姓名', 0, 1], ['Synthetic OCR name', 1, 1]].map(([Text, row, col]) => ({
          Text, RowTl: row, RowBr: Number(row) + 1, ColTl: col, ColBr: Number(col) + 1, Confidence: 95,
          Polygon: [{ X: 0, Y: 0 }, { X: 10, Y: 0 }, { X: 10, Y: 10 }, { X: 0, Y: 10 }],
        }))] }] };
    } });
    const worker = new V81OcrWorker(prisma, { ocr: configuration }, { now: () => new Date() }, provider, storage);
    assert.equal((await worker.processOne(fixture.organizationId)).status, 'FAILED');
    assert.equal(data(await request(`/api/v1/ocr-jobs/${job.id}`, authenticated(teacher))).status, 'FAILED');
    const failed = data(await request(recognition, authenticated(teacher)));
    assert.equal(object(failed.latestAttempt).errorCode, 'OCR_PROVIDER_TIMEOUT');
    const retry = data(await enqueue(1), 201);
    assert.equal((await worker.processOne(fixture.organizationId)).status, 'SUCCEEDED');
    assert.equal(data(await request(`/api/v1/ocr-jobs/${retry.id}`, authenticated(teacher))).resultAttempt, 2);
    const recognized = data(await request(recognition, authenticated(teacher)));
    assert.equal(object(object(recognized.latestAttempt).evidence).requiresTeacherConfirmation, true);
    assert.equal(object(object(recognized.latestAttempt).evidence).sourceSha256, page.sha256);
    const attempts = await prisma.$queryRaw<{ attempt: number; outcome: string }[]>`SELECT attempt,outcome FROM v81_ocr_page_attempts WHERE batch_id=${String(batch.id)}::uuid AND page_id=${String(page.id)}::uuid ORDER BY attempt`;
    assert.deepEqual(attempts, [{ attempt: 1, outcome: 'FAILED' }, { attempt: 2, outcome: 'SUCCEEDED' }]);
    assert.equal(calls, 2);
    const { probeOcrDraftApi } = await import('../../../tools/local-integration/v81-ocr-draft-api-probe.mjs');
    await probeOcrDraftApi({ baseUrl: `${baseUrl}/api/v1`, request: businessRequest, prisma, fixture,
      teacherToken: teacher, adminToken: admin, otherTeacherTokens: [{ token: other }], batchId: String(batch.id), pageId: String(page.id) });
    const { probeOcrRosterHttp } = await import('../../../tools/local-integration/v81-ocr-roster-http-probe.mjs');
    await probeOcrRosterHttp({ baseUrl: `${baseUrl}/api/v1`, request: businessRequest, prisma, fixture,
      teacherToken: teacher, adminToken: admin, otherTeacherTokens: [{ token: other }], batchId: String(batch.id) });
    const confirmed = await businessRequest(`/ocr-batches/${batch.id}/roster-confirmation`, teacher);
    if (!closeAfterAcceptance) {
    const { probeOcrRosterSwitch } = await import('../../../tools/local-integration/v81-ocr-roster-switch-probe.mjs');
    await probeOcrRosterSwitch({ baseUrl: `${baseUrl}/api/v1`, request: businessRequest, prisma, fixture,
      teacherToken: teacher, adminToken: admin, otherTeacherToken: other, confirmed });
    await businessRequest(`/class-sections/${fixture.teacherAActiveSectionId}/roster-basis`, teacher, {
      confirmedRosterId: confirmed.id, expectedVersion: 7, reason: 'Synthetic restore OCR basis for member projections',
    });
    }
    const sourceRow = (confirmed.sourceRows as Record<string, unknown>[])[0];
    assert.ok(sourceRow);
    // Registration is an explicit synthetic fixture; only subsequent projections use real HTTP.
    const member = existingMember ?? await seedExerciseSessionStudent(prisma, fixture, 'OCR-MEM');
    await prisma.studentProfile.update({ where: { id: member.studentId }, data: {
      studentNumber: String(sourceRow.studentNumber), fullName: String(sourceRow.fullName),
    } });
    const outside = existingOutside ?? await seedExerciseSessionStudent(prisma, fixture, 'OCR-OUT');
    const memberToken = await tokenFor(member.userId, 'STUDENT');
    const ownStatus = await businessRequest(`/enrollments/${member.enrollmentId}/roster-status`, memberToken);
    assert.equal(ownStatus.status, 'MATCHED');
    assert.equal(ownStatus.registrationComplete, true);
    assert.equal(ownStatus.rosterVersion, confirmed.version);
    assert.equal((await request(`/api/v1/enrollments/${outside.enrollmentId}/roster-status`, authenticated(memberToken))).status, 404);
    const summary = await businessRequest(`/admin/class-sections/${fixture.teacherAActiveSectionId}/physical-summary`, admin);
    assert.equal(summary.unresolvedRegistrationCount, 0);
    assert.equal(summary.notRecordedCount, 1);
    if (!closeAfterAcceptance) await publishRules();
    const reportPath = `/class-sections/${fixture.teacherAActiveSectionId}/composite-roster`;
    const report = await businessRequest(reportPath, teacher);
    assert.equal(report.sourceKind, 'OCR');
    assert.equal(report.registrationComplete, true);
    assert.equal(report.isSettlementSnapshot, false);
    assert.equal((report.rows as unknown[]).length, 1);
    assert.equal((report.extras as unknown[]).length, 1);
    const exported = await businessRequest(`${reportPath}/export`, teacher);
    const { read, utils } = await import('xlsx');
    const book = read(Buffer.from(String(exported.fileBase64), 'base64'), { type: 'buffer' });
    const metadataSheet = book.Sheets['说明'];
    assert.ok(metadataSheet);
    const metadata = utils.sheet_to_json(metadataSheet, { header: 1 }) as string[][];
    assert.equal(metadata.find(row => row[0] === '来源类型')?.[1], 'OCR');
    assert.equal(metadata.find(row => row[0] === '来源名单标识')?.[1], batch.id);
    await prisma.studentProfile.update({ where: { id: member.studentId }, data: { gender: 'FEMALE' } });
    const physicalPage = (physical.pages as Record<string, unknown>[])[0];
    assert.ok(physicalPage);
    const physicalPath = `/ocr-batches/${physical.id}`;
    await businessRequest(`${physicalPath}/pages/${physicalPage.id}/recognition`, teacher, { expectedAttempt: 0 });
    const physicalProvider = new TencentOcrProvider(configuration, { async request() {
      const values = [['学号', '姓名', '项目', '用时', '测试日期'],
        [String(sourceRow.studentNumber), String(sourceRow.fullName), '800m', '4:30', '2026-09-08']];
      return { RequestId: 'synthetic-physical-recognition', TableDetections: [{ Cells: values.flatMap((row, r) => row.map((Text, c) => ({
        Text, RowTl: r, RowBr: r + 1, ColTl: c, ColBr: c + 1, Confidence: 95,
        Polygon: [{ X: 0, Y: 0 }, { X: 10, Y: 0 }, { X: 10, Y: 10 }, { X: 0, Y: 10 }],
      }))) }] };
    } });
    const physicalWorker = new V81OcrWorker(prisma, { ocr: configuration }, { now: () => new Date() }, physicalProvider, storage);
    assert.equal((await physicalWorker.processOne(fixture.organizationId)).status, 'SUCCEEDED');
    const physicalDraft = await businessRequest(`${physicalPath}/draft`, teacher, { expectedVersion: 0,
      selections: [{ pageId: physicalPage.id, attempt: 1, tableIndex: 0, headerRow: 0,
        columns: { studentNumber: 0, name: 1, runType: 2, elapsed: 3, testedOn: 4 } }] });
    const physicalRow = (physicalDraft.rows as Record<string, unknown>[])[0];
    assert.ok(physicalRow);
    const confirmationPath = `${physicalPath}/physical-confirmations`;
    const selection = { rowId: physicalRow.id, expectedResultVersion: 0 };
    const confirmInput = { expectedDraftVersion: 1, selections: [selection] };
    const confirmPost = (input: Record<string, unknown>, access = teacher, key = uuidv7()) => request(`/api/v1${confirmationPath}`, authenticated(access, 'POST', input, key));
    const pending = await businessRequest(confirmationPath, teacher);
    assert.equal(pending.pendingCount, 1);
    assert.equal((await confirmPost(confirmInput)).status, 422);
    assert.equal((await confirmPost(confirmInput, memberToken)).status, 403);
    assert.equal((await confirmPost(confirmInput, other)).status, 404);
    assert.equal((await request(`/api/v1${confirmationPath}`, authenticated(other))).status, 404);
    const studentPhysicalPath = `/student/enrollments/${member.enrollmentId}/physical-result`;
    assert.equal((await businessRequest(studentPhysicalPath, memberToken)).status, 'NOT_RECORDED');
    await businessRequest(`${physicalPath}/draft/revisions`, teacher, { expectedVersion: 1,
      rows: [{ id: physicalRow.id, values: physicalRow.values, reviewedAgainstSource: true }] });
    assert.equal((await confirmPost(confirmInput)).status, 409);
    const ready = { ...confirmInput, expectedDraftVersion: 2 };
    const confirmKey = uuidv7();
    const accepted = data(await confirmPost(ready, teacher, confirmKey), 201);
    assert.equal(accepted.pendingCount, 0);
    assert.deepEqual(data(await confirmPost(ready, teacher, confirmKey), 201), accepted);
    assert.equal((await confirmPost(ready)).status, 409);
    assert.deepEqual(await businessRequest(studentPhysicalPath, memberToken), { status: 'RECORDED',
      result: { version: 1, runType: '800m', elapsedSeconds: 270, testedOn: '2026-09-08' } });
    const links = await prisma.$queryRaw<{ draft_version: number; result_version: number }[]>`SELECT draft_version,result_version FROM v81_ocr_physical_confirmations WHERE batch_id=${String(physical.id)}::uuid`;
    assert.deepEqual(links, [{ draft_version: 2, result_version: 1 }]);
    assert.equal(await prisma.notification.count({ where: { targetId: member.enrollmentId, notificationType: 'RAW_ENDURANCE_RESULT' } }), 1);
  });
  }
});
