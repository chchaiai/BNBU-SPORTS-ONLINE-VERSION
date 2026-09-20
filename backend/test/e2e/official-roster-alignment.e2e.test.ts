import { utils, write } from 'xlsx';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { Readable } from 'node:stream';
import { after, before, beforeEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import { json, urlencoded } from 'express';
import { importPKCS8, SignJWT } from 'jose';
import { ValidationPipe, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { v7 as uuidv7 } from 'uuid';

import type { RuntimeConfig } from '../../src/common/config/environment.js';
import type { BodyParserErrorMiddleware as BodyParserErrorMiddlewareType } from '../../src/common/http/body-parser-error.middleware.js';
import type { RequestIdMiddleware as RequestIdMiddlewareType } from '../../src/common/http/request-id.js';
import type { validationException as ValidationExceptionFactory } from '../../src/common/http/validation.js';
import type {
  ObjectStoragePort,
  PutPrivateObjectInput,
} from '../../src/common/object-storage/object-storage.port.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
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

function object(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function array(value: unknown): Record<string, unknown>[] {
  assert.equal(Array.isArray(value), true);
  return value as Record<string, unknown>[];
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');
  const port = (address as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

const FIELD_MAPPING = {
  studentNumber: 'studentNumber',
  fullName: 'fullName',
  gender: 'gender',
  gradeYear: 'gradeYear',
  collegeName: null,
  majorName: null,
  administrativeClassName: null,
};

function rosterForm(lines: string[]): FormData {
  const form = new FormData();
  form.set('source', 'FILE');
  form.set('fileFormat', 'CSV');
  form.set('fieldMappingSnapshot', JSON.stringify(FIELD_MAPPING));
  form.set('file', new Blob([lines.join('\n')], { type: 'text/csv' }), `synthetic-${uuidv7()}.csv`);
  return form;
}

function compiledModule(relativePath: string): string {
  return pathToFileURL(resolve('dist', relativePath)).href;
}

describe('Official Roster Import and Alignment HTTP E2E', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let app: INestApplication;
  let baseUrl: string;
  let storage: MemoryObjectStorage;

  const request = async (path: string, init: RequestInit = {}): Promise<HttpResult> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
      headers: response.headers,
    };
  };

  const login = async (account: string): Promise<string> => {
    const result = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account, password: TEST_PASSWORD }),
    });
    assert.equal(result.status, 200);
    const token = object(result.body.data).accessToken;
    assert.equal(typeof token, 'string');
    return token as string;
  };

  const authenticated = (
    token: string,
    method = 'GET',
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): RequestInit => ({
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const upload = (
    token: string,
    classSectionId: string,
    lines: string[],
    idempotencyKey = uuidv7(),
  ): Promise<HttpResult> =>
    request(`/api/v1/class-sections/${classSectionId}/roster-imports`, {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'idempotency-key': idempotencyKey },
      body: rosterForm(lines),
    });

  before(async () => {
    const databaseUrl = requireTestDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    const port = await availablePort();
    Object.assign(process.env, foundationEnvironment(databaseUrl, port));
    storage = new MemoryObjectStorage();
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
    const { OBJECT_STORAGE_PORT } = (await import(
      compiledModule('common/object-storage/object-storage.port.js')
    )) as { OBJECT_STORAGE_PORT: symbol };
    const module = await Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(OBJECT_STORAGE_PORT)
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
      kind: 'SUB', permissions: ['COURSE_VIEW'], mustChangePassword: false,
    } });
    storage.objects.clear();
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  async function createStudentToken(studentNumber = '00999999'): Promise<string> {
    const userId = uuidv7();
    const profileId = uuidv7();
    const sessionId = uuidv7();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3_600_000);
    await prisma.$transaction(async (transaction) => {
      await transaction.user.create({
        data: {
          id: userId,
          organizationId: fixture.organizationId,
          role: 'STUDENT',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.studentProfile.create({
        data: {
          id: profileId,
          organizationId: fixture.organizationId,
          userId,
          studentNumber,
          fullName: 'Synthetic E2E Roster Student',
          gender: 'OTHER',
          gradeYear: 2026,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.authSession.create({
        data: {
          id: sessionId,
          organizationId: fixture.organizationId,
          userId,
          status: 'ACTIVE',
          tokenFamilyId: uuidv7(),
          createdAt: now,
          lastSeenAt: now,
          absoluteExpiresAt: expiresAt,
          idleExpiresAt: expiresAt,
        },
      });
    });
    const seconds = Math.floor(now.getTime() / 1_000);
    return new SignJWT({
      organizationId: fixture.organizationId,
      role: 'STUDENT',
      sessionId,
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
  }

  async function createPlatformStudent(input: {
    studentNumber: string;
    fullName: string;
    classSectionId: string;
  }): Promise<{ profileId: string; enrollmentId: string }> {
    const now = new Date();
    const userId = uuidv7();
    const profileId = uuidv7();
    const enrollmentId = uuidv7();
    await prisma.$transaction(async (transaction) => {
      await transaction.user.create({
        data: {
          id: userId,
          organizationId: fixture.organizationId,
          role: 'STUDENT',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.studentProfile.create({
        data: {
          id: profileId,
          organizationId: fixture.organizationId,
          userId,
          studentNumber: input.studentNumber,
          fullName: input.fullName,
          gender: 'OTHER',
          gradeYear: 2026,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.enrollment.create({
        data: {
          id: enrollmentId,
          organizationId: fixture.organizationId,
          semesterId: fixture.semesterId,
          classSectionId: input.classSectionId,
          studentId: profileId,
          source: 'MANUAL',
          status: 'ACTIVE',
          joinedAt: now,
          createdBy: fixture.teacherUserId,
          updatedBy: fixture.teacherUserId,
          createdAt: now,
          updatedAt: now,
        },
      });
    });
    return { profileId, enrollmentId };
  }

  it('teacher and admin mobile shells work with real authenticated sessions', { skip: process.env.PORTAL_MOBILE_BROWSER !== '1' }, async () => {
    const { portalMobileRealBrowser } = await import('../../../tools/local-integration/portal-mobile-real-browser.mjs');
    await portalMobileRealBrowser({ baseUrl, teacherEmail: fixture.teacherEmail, adminEmail: fixture.adminEmail, password: TEST_PASSWORD });
  });

  it('intuitive roster browser imports maps checks and refreshes real membership', { skip: process.env.ROSTER_UI_BROWSER !== '1' }, async () => {
    await createPlatformStudent({ studentNumber: '000101', fullName: '已进班同学', classSectionId: fixture.teacherAActiveSectionId });
    await createPlatformStudent({ studentNumber: '000103', fullName: '其他班同学', classSectionId: fixture.teacherBActiveSectionId });
    await createPlatformStudent({ studentNumber: '000104', fullName: '信息待核实同学', classSectionId: fixture.teacherAActiveSectionId });
    await createPlatformStudent({ studentNumber: '000105', fullName: '名单外同学', classSectionId: fixture.teacherAActiveSectionId });
    const { rosterIntuitiveBrowser } = await import('../../../tools/local-integration/roster-intuitive-browser.mjs');
    await rosterIntuitiveBrowser({ baseUrl, sectionId: fixture.teacherAActiveSectionId, email: fixture.teacherEmail, password: TEST_PASSWORD,
      joinMissing: async () => { await createPlatformStudent({ studentNumber: '000102', fullName: '未进班同学', classSectionId: fixture.teacherAActiveSectionId }); } });
    assert.equal(await prisma.officialRosterImport.count(), 1);
    const confirmed = await prisma.$queryRaw<{count: bigint}[]>`SELECT count(*) FROM v81_confirmed_rosters`;
    assert.equal(confirmed[0]?.count, 1n);
  });

  it('uploads and confirms original XLS/XLSX/CSV dotted-name files through HTTP and PostgreSQL', async () => {
    const teacher = await login(fixture.teacherEmail);
    for (const extension of ['xls', 'xlsx', 'csv'] as const) {
      const book = utils.book_new();
      utils.book_append_sheet(book, utils.aoa_to_sheet([['studentNumber', 'fullName', 'gender', 'gradeYear'], ['000123', '测试学生', 'OTHER', '2026']]), '名单');
      const bytes = write(book, { type: 'buffer', bookType: extension }) as Buffer;
      const form = new FormData();
      form.set('source', 'FILE'); form.set('fileFormat', extension.toUpperCase());
      form.set('fieldMappingSnapshot', JSON.stringify(FIELD_MAPPING));
      if (extension !== 'csv') form.set('sheetName', '名单');
      form.set('file', new Blob([Uint8Array.from(bytes)], {type: extension === 'csv' ? 'text/csv' : extension === 'xls' ? 'application/vnd.ms-excel' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'}), `课程.2026.09.${extension}`);
      const imported = await request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}/roster-imports`, {
        method: 'POST', headers: {authorization: `Bearer ${teacher}`, 'idempotency-key': uuidv7()}, body: form,
      });
      assert.equal(imported.status, 201, JSON.stringify(imported.body));
      const source = object(imported.body.data);
      assert.equal(source.status, 'VALIDATED');
      const stored = await prisma.officialRosterImport.findUniqueOrThrow({where: {id: String(source.id)}});
      assert.equal(stored.sourceFormat, extension.toUpperCase());
      assert.ok(storage.objects.get(stored.sourceFileStorageKey!)?.equals(bytes));
      const confirmed = await request(`/api/v1/roster-imports/${source.id}/confirmation`, authenticated(teacher, 'POST', {expectedVersion: source.version}, uuidv7()));
      assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body));
      const entry = await prisma.officialRosterEntry.findFirstOrThrow({where: {rosterImportId: String(source.id)}});
      assert.equal(entry.normalizedStudentNumber, '000123');
      assert.equal(entry.fullName, '测试学生');
    }
  });

  it('continues an accepted electronic roster after closing while rejecting new imports without side effects', async () => {
    const teacher = await login(fixture.teacherEmail);
    const other = await login(fixture.teacherBEmail);
    const admin = await login(fixture.adminEmail);
    const sectionId = fixture.teacherAActiveSectionId;
    const rows = ['studentNumber,fullName,gender,gradeYear', '000123,Synthetic Closed Roster,OTHER,2026'];
    const key = uuidv7();
    const result = await upload(teacher, sectionId, rows, key);
    assert.equal(result.status, 201, JSON.stringify(result.body));
    const accepted = object(result.body.data);
    const sourcePath = `/api/v1/roster-imports/${accepted.id}/source`;
    const source = object((await request(sourcePath, authenticated(teacher))).body.data);
    const identities = { users: await prisma.user.count(), members: await prisma.enrollment.count() };
    const objects = [...storage.objects.entries()];
    const section = object((await request(`/api/v1/class-sections/${sectionId}`, authenticated(teacher))).body.data);
    const closed = await request(`/api/v1/class-sections/${sectionId}/close`, authenticated(teacher, 'POST', {
      expectedVersion: section.version, reason: 'Synthetic close after electronic roster acceptance',
    }, uuidv7()));
    assert.equal(closed.status, 200, JSON.stringify(closed.body));
    const rejected = await upload(teacher, sectionId, rows);
    assert.equal(rejected.status, 409, JSON.stringify(rejected.body));
    const replay = await upload(teacher, sectionId, rows, key);
    assert.equal(replay.status, 201, JSON.stringify(replay.body));
    assert.deepEqual(replay.body.data, accepted);
    assert.equal(await prisma.officialRosterImport.count(), 1);
    assert.deepEqual([...storage.objects.entries()], objects);
    assert.deepEqual(object((await request(sourcePath, authenticated(teacher))).body.data), source);
    const path = `/api/v1/roster-imports/${accepted.id}/confirmation`;
    const input = { expectedVersion: accepted.version };
    for (const [access, expected] of [[other, 404], [admin, 403]] as const) {
      assert.equal((await request(path, authenticated(access, 'POST', input, uuidv7()))).status, expected);
    }
    const confirmationKey = uuidv7();
    const confirmed = await request(path, authenticated(teacher, 'POST', input, confirmationKey));
    assert.equal(confirmed.status, 201, JSON.stringify(confirmed.body));
    const snapshot = object(confirmed.body.data);
    assert.equal(snapshot.sourceSha256, source.sourceSha256);
    assert.deepEqual((await request(path, authenticated(teacher))).body.data, snapshot);
    assert.deepEqual((await request(path, authenticated(teacher, 'POST', input, confirmationKey))).body.data, snapshot);
    assert.equal((await request(path, authenticated(teacher, 'POST', input, uuidv7()))).status, 409);
    const current = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM v81_current_confirmed_rosters WHERE class_section_id=${sectionId}::uuid`;
    assert.deepEqual(current, [{ id: snapshot.id }]);
    const events = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM v81_events WHERE resource_type='ROSTER_CONFIRMATION' AND resource_id=${String(snapshot.id)}::uuid`;
    assert.deepEqual(events, [{ count: 1n }]);
    assert.deepEqual({ users: await prisma.user.count(), members: await prisma.enrollment.count() }, identities);
  });

  it('uploads private immutable versions and enforces Teacher/Admin/Student projections and scope', async () => {
    const teacherToken = await login(fixture.teacherEmail);
    const teacherBToken = await login(fixture.teacherBEmail);
    const adminToken = await login(fixture.adminEmail);
    const studentToken = await createStudentToken();
    const baseline = {
      users: await prisma.user.count(),
      profiles: await prisma.studentProfile.count(),
      enrollments: await prisma.enrollment.count(),
    };

    const unsupported = new FormData();
    unsupported.set('source', 'OFFICIAL_API');
    unsupported.set('fileFormat', 'CSV');
    const unsupportedResult = await request(
      `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/roster-imports`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${teacherToken}`, 'idempotency-key': uuidv7() },
        body: unsupported,
      },
    );
    assert.equal(unsupportedResult.status, 409);
    assert.equal(unsupportedResult.body.code, 'ROSTER_IMPORT_SOURCE_UNSUPPORTED');
    assert.equal(await prisma.officialRosterImport.count(), 0);

    const rows = [
      'studentNumber,fullName,gender,gradeYear',
      '0001,Synthetic Valid,OTHER,2026',
      '0002,Synthetic Second Valid,OTHER,2026',
      'dup1,Synthetic Duplicate A,OTHER,2026',
      'DUP1,Synthetic Duplicate B,OTHER,2026',
    ];
    const deniedTeacher = await upload(teacherBToken, fixture.teacherAActiveSectionId, rows);
    assert.equal(deniedTeacher.status, 404);
    const deniedAdmin = await upload(adminToken, fixture.teacherAActiveSectionId, rows);
    assert.equal(deniedAdmin.status, 403);
    assert.equal(await prisma.officialRosterImport.count(), 0);

    const failedRows = ['studentNumber,fullName,gender,gradeYear', '=formula,Synthetic Invalid,OTHER,2026'];
    const failedKey = uuidv7();
    const failedUpload = await upload(
      teacherToken,
      fixture.teacherAActiveSectionId,
      failedRows,
      failedKey,
    );
    const failedReplay = await upload(
      teacherToken,
      fixture.teacherAActiveSectionId,
      failedRows,
      failedKey,
    );
    assert.equal(failedUpload.status, 422);
    assert.equal(failedReplay.status, 422);
    assert.equal(failedUpload.body.code, 'ROSTER_IMPORT_FAILED');
    assert.equal(failedReplay.body.code, 'ROSTER_IMPORT_FAILED');
    assert.deepEqual(failedReplay.body.details, failedUpload.body.details);
    const failedImport = await prisma.officialRosterImport.findFirstOrThrow({
      where: { status: 'FAILED' },
    });
    assert.equal(failedImport.versionNumber, 1);
    assert.equal(failedImport.isCurrent, false);
    assert.deepEqual(
      await prisma.officialRosterEntry.findMany({
        where: { rosterImportId: failedImport.id }, select: { rowValidationStatus: true },
      }),
      [{ rowValidationStatus: 'INVALID' }],
    );
    assert.equal(storage.objects.has(failedImport.sourceFileStorageKey ?? ''), true);
    assert.equal(storage.objects.size, 1);
    assert.equal(
      await prisma.outboxEvent.count({
        where: {
          aggregateId: failedImport.id,
          eventType: { in: ['ROSTER_IMPORT_RECEIVED_V1', 'ROSTER_IMPORT_FAILED_V1'] },
        },
      }),
      2,
    );

    const key = uuidv7();
    const created = await upload(teacherToken, fixture.teacherAActiveSectionId, rows, key);
    const replay = await upload(teacherToken, fixture.teacherAActiveSectionId, rows, key);
    assert.equal(created.status, 201);
    assert.equal(replay.status, 201);
    const first = object(created.body.data);
    assert.equal(object(replay.body.data).id, first.id);
    assert.equal(first.versionNumber, 2);
    assert.equal(first.validRowCount, 2);
    assert.equal(first.invalidRowCount, 0);
    assert.equal(first.duplicatedRowCount, 2);
    assert.equal('sourceFileStorageKey' in first, false);
    assert.equal('fileChecksumSha256' in first, false);
    assert.equal('fileName' in first, false);
    const fetched = await request(
      `/api/v1/roster-imports/${String(first.id)}`,
      authenticated(teacherToken),
    );
    assert.equal(fetched.status, 200);
    assert.equal(object(fetched.body.data).id, first.id);
    assert.equal(storage.objects.size, 2);
    const keyConflict = await upload(
      teacherToken,
      fixture.teacherAActiveSectionId,
      ['studentNumber,fullName,gender,gradeYear', '0888,Synthetic Conflict,OTHER,2026'],
      key,
    );
    assert.equal(keyConflict.status, 409);
    assert.equal(keyConflict.body.code, 'CONFLICT_IDEMPOTENCY_KEY_REUSED');
    assert.equal(storage.objects.size, 2);

    const current = await request(
      `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/roster-imports/current`,
      authenticated(teacherToken),
    );
    assert.equal(current.status, 200);
    assert.equal(object(current.body.data).id, first.id);
    const listed = await request(
      `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/roster-imports?limit=20&sort=versionNumber`,
      authenticated(adminToken),
    );
    assert.equal(listed.status, 200);
    assert.equal(array(listed.body.data).length, 2);
    const teacherEntries = await request(
      `/api/v1/roster-imports/${String(first.id)}/entries?limit=20`,
      authenticated(teacherToken),
    );
    assert.equal(teacherEntries.status, 200);
    assert.equal(array(teacherEntries.body.data).length, 4);
    assert.ok(array(teacherEntries.body.data).some((entry) => entry.studentNumber === '0001'));
    const adminEntries = await request(
      `/api/v1/roster-imports/${String(first.id)}/entries?limit=20`,
      authenticated(adminToken),
    );
    assert.equal(adminEntries.status, 200);
    assert.ok(
      array(adminEntries.body.data).every(
        (entry) => entry.studentNumber === null && entry.fullName === null,
      ),
    );
    const teacherBRead = await request(
      `/api/v1/roster-imports/${String(first.id)}`,
      authenticated(teacherBToken),
    );
    assert.equal(teacherBRead.status, 404);
    const studentRead = await request(
      `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/roster-imports?limit=20`,
      authenticated(studentToken),
    );
    assert.equal(studentRead.status, 403);

    const secondCreated = await upload(teacherToken, fixture.teacherAActiveSectionId, [
      'studentNumber,fullName,gender,gradeYear',
      '0099,Synthetic Second Version,OTHER,2026',
    ]);
    assert.equal(secondCreated.status, 201);
    const second = object(secondCreated.body.data);
    assert.equal(second.versionNumber, 3);
    assert.equal(second.isCurrent, true);
    const exactReplayAfterMutation = await upload(
      teacherToken,
      fixture.teacherAActiveSectionId,
      rows,
      key,
    );
    assert.equal(exactReplayAfterMutation.status, 201);
    assert.deepEqual(exactReplayAfterMutation.body.data, created.body.data);
    const mutatedFirst = await prisma.officialRosterImport.findUniqueOrThrow({
      where: { id: String(first.id) },
    });
    assert.equal(mutatedFirst.isCurrent, false);
    assert.notEqual(mutatedFirst.version, first.version);
    assert.equal(storage.objects.size, 3);
    assert.equal(
      object(
        (
          await request(
            `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/roster-imports/current`,
            authenticated(adminToken),
          )
        ).body.data,
      ).id,
      second.id,
    );
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        profiles: await prisma.studentProfile.count(),
        enrollments: await prisma.enrollment.count(),
      },
      baseline,
    );
  });

  it('aligns a frozen current snapshot and appends confirm/resolve/reopen while ignore is side-effect free', async () => {
    const teacherToken = await login(fixture.teacherEmail);
    const adminToken = await login(fixture.adminEmail);
    const matched = await createPlatformStudent({
      studentNumber: '0001',
      fullName: 'Synthetic Matched',
      classSectionId: fixture.teacherAActiveSectionId,
    });
    await createPlatformStudent({
      studentNumber: '0003',
      fullName: 'Synthetic Wrong Course',
      classSectionId: fixture.teacherBActiveSectionId,
    });
    const identityConflictStudent = await createPlatformStudent({
      studentNumber: '0004',
      fullName: 'Different Platform Name',
      classSectionId: fixture.teacherAActiveSectionId,
    });
    await createPlatformStudent({
      studentNumber: '0005',
      fullName: 'Synthetic Extra',
      classSectionId: fixture.teacherAActiveSectionId,
    });
    const immutableCounts = {
      users: await prisma.user.count(),
      profiles: await prisma.studentProfile.count(),
      enrollments: await prisma.enrollment.count(),
    };
    const imported = await upload(teacherToken, fixture.teacherAActiveSectionId, [
      'studentNumber,fullName,gender,gradeYear',
      '0001,Synthetic Matched,OTHER,2026',
      '0002,Synthetic Missing,OTHER,2026',
      '0003,Synthetic Wrong Course,OTHER,2026',
      '0004,Synthetic Official Name,OTHER,2026',
      'dup7,Synthetic Duplicate Official A,OTHER,2026',
      'DUP7,Synthetic Duplicate Official B,OTHER,2026',
    ]);
    assert.equal(imported.status, 201);
    const rosterImport = object(imported.body.data);
    const alignKey = uuidv7();
    const aligned = await request(
      `/api/v1/roster-imports/${String(rosterImport.id)}/align`,
      authenticated(
        teacherToken,
        'POST',
        { expectedRosterImportVersion: rosterImport.version },
        alignKey,
      ),
    );
    const alignReplay = await request(
      `/api/v1/roster-imports/${String(rosterImport.id)}/align`,
      authenticated(
        teacherToken,
        'POST',
        { expectedRosterImportVersion: rosterImport.version },
        alignKey,
      ),
    );
    assert.equal(aligned.status, 202);
    assert.equal(alignReplay.status, 202);
    const run = object(aligned.body.data);
    assert.equal(object(alignReplay.body.data).id, run.id);
    assert.equal(await prisma.rosterAlignmentRun.count(), 1);
    const resultList = await request(
      `/api/v1/roster-alignment-results?classSectionId=${fixture.teacherAActiveSectionId}&currentOnly=true&limit=100`,
      authenticated(teacherToken),
    );
    assert.equal(resultList.status, 200);
    const results = array(resultList.body.data);
    assert.deepEqual([...new Set(results.map((entry) => String(entry.status)))].sort(), [
      'DUPLICATED',
      'EXTRA_IN_PLATFORM',
      'IDENTITY_CONFLICT',
      'MATCHED',
      'MISSING_IN_PLATFORM',
      'WRONG_COURSE',
    ]);
    const duplicatedImportEntryIds = (
      await prisma.officialRosterEntry.findMany({
        where: {
          rosterImportId: String(rosterImport.id),
          rowValidationStatus: 'DUPLICATED',
        },
        select: { id: true },
      })
    ).map(({ id }) => id);
    assert.deepEqual(
      await prisma.rosterAlignmentResult.findMany({
        where: { alignmentRunId: String(run.id), rosterEntryId: { in: duplicatedImportEntryIds } },
        select: { status: true, studentId: true, enrollmentId: true },
      }),
      [{ status: 'DUPLICATED', studentId: null, enrollmentId: null }],
    );
    const teacherWrongCourse = results.find((entry) => entry.status === 'WRONG_COURSE');
    assert.ok(teacherWrongCourse !== undefined);
    assert.equal(teacherWrongCourse.enrollmentId, null);
    assert.equal(teacherWrongCourse.studentId, null);
    const adminList = await request(
      `/api/v1/roster-alignment-results?classSectionId=${fixture.teacherAActiveSectionId}&currentOnly=true&limit=100`,
      authenticated(adminToken),
    );
    assert.equal(adminList.status, 200);
    assert.ok(
      array(adminList.body.data).every(
        (entry) =>
          entry.rosterEntryId === null &&
          entry.enrollmentId === null &&
          array(entry.differences).every(
            (difference) => difference.officialValue === null && difference.platformValue === null,
          ),
      ),
    );
    const frozen = await prisma.rosterAlignmentPlatformEntry.findFirstOrThrow({
      where: { alignmentRunId: String(run.id), studentId: matched.profileId },
    });
    await prisma.studentProfile.update({
      where: { id: matched.profileId },
      data: { fullName: 'Synthetic Changed After Run', version: { increment: 1 } },
    });
    assert.equal(
      (await prisma.rosterAlignmentPlatformEntry.findUniqueOrThrow({ where: { id: frozen.id } }))
        .fullNameSnapshot,
      'Synthetic Matched',
    );

    const identityConflict = results.find((entry) => entry.status === 'IDENTITY_CONFLICT');
    assert.ok(identityConflict !== undefined);
    const fetchedConflict = await request(
      `/api/v1/roster-alignment-results/${String(identityConflict.id)}`,
      authenticated(teacherToken),
    );
    assert.equal(fetchedConflict.status, 200);
    assert.equal(object(fetchedConflict.body.data).id, identityConflict.id);
    const relatedEvidenceId = uuidv7();
    await prisma.enrollmentStatusEvent.create({
      data: {
        id: relatedEvidenceId,
        organizationId: fixture.organizationId,
        enrollmentId: identityConflictStudent.enrollmentId,
        fromStatus: null,
        toStatus: 'ACTIVE',
        source: 'MANUAL_ENROLLMENT',
        reason: 'Synthetic identity conflict evidence',
        actorUserId: fixture.teacherUserId,
        actorRoleSnapshot: 'TEACHER',
        requestId: 'stage13-e2e-related-evidence',
        occurredAt: new Date(),
        enrollmentVersion: 1,
      },
    });
    const confirmed = await request(
      `/api/v1/roster-alignment-results/${String(identityConflict.id)}/confirm`,
      authenticated(
        teacherToken,
        'POST',
        { reason: 'Synthetic confirm', expectedVersion: identityConflict.version },
        uuidv7(),
      ),
    );
    assert.equal(confirmed.status, 200);
    const confirmedData = object(confirmed.body.data);
    assert.equal(confirmedData.resolutionStatus, 'CONFIRMED');
    const resolved = await request(
      `/api/v1/roster-alignment-results/${String(identityConflict.id)}/resolve`,
      authenticated(
        teacherToken,
        'POST',
        {
          resolutionNote: 'Synthetic resolve',
          evidenceType: 'ENROLLMENT_STATUS_EVENT',
          evidenceReferenceId: relatedEvidenceId,
          expectedVersion: confirmedData.version,
        },
        uuidv7(),
      ),
    );
    assert.equal(resolved.status, 200);
    const resolvedData = object(resolved.body.data);
    assert.equal(resolvedData.resolutionStatus, 'RESOLVED');
    const reopened = await request(
      `/api/v1/roster-alignment-results/${String(identityConflict.id)}/reopen`,
      authenticated(
        teacherToken,
        'POST',
        { reason: 'Synthetic reopen', expectedVersion: resolvedData.version },
        uuidv7(),
      ),
    );
    assert.equal(reopened.status, 200);
    const reopenedData = object(reopened.body.data);
    assert.equal(reopenedData.resolutionStatus, 'PENDING');
    const beforeIgnore = {
      version: reopenedData.version,
      events: await prisma.rosterResolutionEvent.count(),
      idempotency: await prisma.idempotencyRecord.count(),
      audit: await prisma.auditLog.count(),
      outbox: await prisma.outboxEvent.count(),
    };
    const ignored = await request(
      `/api/v1/roster-alignment-results/${String(identityConflict.id)}/ignore`,
      authenticated(
        teacherToken,
        'POST',
        { reason: 'Synthetic denied ignore', expectedVersion: reopenedData.version },
        uuidv7(),
      ),
    );
    assert.equal(ignored.status, 409);
    assert.equal(ignored.body.code, 'ROSTER_IGNORE_NOT_ALLOWED');
    assert.deepEqual(
      {
        version: (
          await prisma.rosterAlignmentResult.findUniqueOrThrow({
            where: { id: String(identityConflict.id) },
          })
        ).version,
        events: await prisma.rosterResolutionEvent.count(),
        idempotency: await prisma.idempotencyRecord.count(),
        audit: await prisma.auditLog.count(),
        outbox: await prisma.outboxEvent.count(),
      },
      beforeIgnore,
    );

    const replacement = await upload(teacherToken, fixture.teacherAActiveSectionId, [
      'studentNumber,fullName,gender,gradeYear',
      '0099,Synthetic Replacement,OTHER,2026',
    ]);
    assert.equal(replacement.status, 201);
    const replacementData = object(replacement.body.data);
    const rolledBack = await request(
      `/api/v1/roster-imports/${String(rosterImport.id)}/rollback`,
      authenticated(
        teacherToken,
        'POST',
        {
          expectedCurrentRosterImportId: replacementData.id,
          expectedVersion: replacementData.version,
          reason: 'Synthetic rollback',
        },
        uuidv7(),
      ),
    );
    assert.equal(rolledBack.status, 200);
    assert.equal(object(rolledBack.body.data).id, rosterImport.id);
    assert.equal(
      await prisma.rosterAlignmentRun.count({
        where: { classSectionId: fixture.teacherAActiveSectionId, isCurrent: true },
      }),
      0,
    );
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        profiles: await prisma.studentProfile.count(),
        enrollments: await prisma.enrollment.count(),
      },
      immutableCounts,
    );
  });
});
