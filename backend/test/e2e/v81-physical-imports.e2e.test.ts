import { required } from '../helpers/required.js';
import { createHash } from 'node:crypto';
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

describe('V81 physical import HTTP E2E', () => {
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
    Object.assign(process.env, foundationEnvironment(databaseUrl, port), { REQUEST_BODY_LIMIT_BYTES: '2097152' });
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
    const module = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(OBJECT_STORAGE_PORT).useValue(new MemoryObjectStorage()).compile();
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

  it('keeps CSV drafts separate then confirms reviewed rows atomically with replay', async () => {
    const student = await seedExerciseSessionStudent(prisma, fixture, 'CSV-PHY');
    const member = await prisma.studentProfile.update({ where: { id: student.studentId }, data: { gender: 'MALE' } });
    const teacher = await login(fixture.teacherEmail);
    const other = await login(fixture.teacherBEmail);
    const own = await tokenFor(student.userId, 'STUDENT');
    const cell = (value: string) => `"${value.replaceAll('"', '""')}"`;
    const csv = `学号,姓名,项目,用时,测试日期\n${cell(member.studentNumber)},${cell(member.fullName)},1000m,4:30,2026-09-07\n999,Unknown,1000m,4.30,2026-09-07`.replaceAll('\\n', '\n');
    const createPath = `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/physical-imports`;
    const post = (path: string, input: Record<string, unknown>, access = teacher, key = uuidv7()) => request(path, authenticated(access, 'POST', input, key));
    const key = uuidv7();
    const draft = data(await post(createPath, { csv }, teacher, key), 201);
    assert.deepEqual(data(await post(createPath, { csv }, teacher, key), 201), draft);
    assert.equal(draft.pendingCount, 2);
    const rows = draft.rows as Record<string, unknown>[];
    assert.deepEqual(required(rows[0]).issues, []);
    assert.ok((required(rows[1]).issues as string[]).includes('AMBIGUOUS_OR_INVALID_TIME'));
    const path = `/api/v1/physical-imports/${draft.id}`;
    assert.deepEqual(data(await request(path, authenticated(teacher))), draft);
    assert.equal((await request(path, authenticated(other))).status, 404);
    assert.equal((await request(path, authenticated(own))).status, 403);
    const studentPath = `/api/v1/student/enrollments/${student.enrollmentId}/physical-result`;
    assert.equal(data(await request(studentPath, authenticated(own))).status, 'NOT_RECORDED');
    const selection = { rowNumber: 1, expectedVersion: 1, expectedResultVersion: 0 };
    const mixed = await post(`${path}/confirm`, { selections: [selection, { ...selection, rowNumber: 2 }] });
    assert.equal(mixed.status, 422);
    assert.equal(data(await request(studentPath, authenticated(own))).status, 'NOT_RECORDED');
    assert.equal(await prisma.notification.count({ where: { targetId: student.enrollmentId, notificationType: 'RAW_ENDURANCE_RESULT' } }), 0);
    const revision = { ...object(required(rows[1]).source), rowNumber: 2, expectedVersion: 1, elapsed: '4:31' };
    const revised = data(await post(`${path}/revisions`, revision), 201);
    assert.equal(required((revised.rows as Record<string, unknown>[])[1]).version, 2);
    assert.equal((await post(`${path}/revisions`, revision)).status, 409);
    const confirmKey = uuidv7();
    const input = { selections: [selection] };
    const accepted = data(await post(`${path}/confirm`, input, teacher, confirmKey), 201);
    assert.equal(accepted.pendingCount, 1);
    assert.deepEqual(data(await post(`${path}/confirm`, input, teacher, confirmKey), 201), accepted);
    assert.equal((await post(`${path}/confirm`, input)).status, 409);
    assert.deepEqual(data(await request(studentPath, authenticated(own))), { status: 'RECORDED', result: { version: 1, runType: '1000m', elapsedSeconds: 270, testedOn: '2026-09-07' } });
    assert.equal(await prisma.notification.count({ where: { targetId: student.enrollmentId, notificationType: 'RAW_ENDURANCE_RESULT' } }), 1);
    const source = data(await request(`${path}/source`, authenticated(teacher)));
    assert.equal(source.csv, csv);
    assert.equal(source.sourceSha256, draft.sourceSha256);
    const history = data(await request(`${path}/revisions?rowNumber=2`, authenticated(teacher)));
    assert.deepEqual((history.items as Record<string, unknown>[]).map(row => row.version), [2, 1]);
    const listed = data(await request(createPath, authenticated(teacher)));
    assert.equal(required((listed.items as Record<string, unknown>[])[0]).confirmedCount, 1);
  });
  it('imports the selected XLSX sheet, retains exact source bytes and confirms the student result', async () => {
    const student = await seedExerciseSessionStudent(prisma, fixture, 'XLS-PHY');
    const member = await prisma.studentProfile.update({ where: { id: student.studentId }, data: { gender: 'FEMALE' } });
    const teacher = await login(fixture.teacherEmail);
    const own = await tokenFor(student.userId, 'STUDENT');
    const { utils, write } = await import('xlsx');
    const book = utils.book_new();
    utils.book_append_sheet(book, utils.aoa_to_sheet([['Unrelated sheet'], ['Do not import']]), '说明');
    utils.book_append_sheet(book, utils.aoa_to_sheet([['学号', '姓名', '项目', '用时', '测试日期'],
      [member.studentNumber, member.fullName, '800m', '4:20', '2026-09-07']]), '体测');
    const bytes = write(book, { type: 'buffer', bookType: 'xlsx' }) as Buffer;
    const input = { sheetName: '体测', fileBase64: bytes.toString('base64') };
    const path = `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/physical-imports/xlsx`;
    const post = (body: Record<string, unknown>, key = uuidv7()) => request(path, authenticated(teacher, 'POST', body, key));
    for (const body of [{ ...input, sheetName: 'missing' }, { ...input, fileBase64: 'bad!' }]) {
      assert.equal((await post(body)).status, 422);
    }
    const key = uuidv7();
    const draft = data(await post(input, key), 201);
    assert.deepEqual(data(await post(input, key), 201), draft);
    const rows = draft.rows as Record<string, unknown>[];
    assert.equal(rows.length, 1);
    assert.deepEqual(required(rows[0]).issues, []);
    assert.equal(required(rows[0]).elapsedSeconds, 260);
    assert.equal(required(rows[0]).enrollmentId, student.enrollmentId);
    const source = data(await request(`/api/v1/physical-imports/${draft.id}/source`, authenticated(teacher)));
    assert.deepEqual(source, { ...input, sourceSha256: createHash('sha256').update(bytes).digest('hex') });
    const accepted = data(await request(`/api/v1/physical-imports/${draft.id}/confirm`, authenticated(teacher, 'POST',
      { selections: [{ rowNumber: 1, expectedVersion: 1, expectedResultVersion: 0 }] }, uuidv7())), 201);
    assert.equal(accepted.pendingCount, 0);
    const current = data(await request(`/api/v1/student/enrollments/${student.enrollmentId}/physical-result`, authenticated(own)));
    assert.deepEqual(current, { status: 'RECORDED', result: { version: 1, runType: '800m', elapsedSeconds: 260, testedOn: '2026-09-07' } });
    const batches = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count FROM v81_physical_import_batches WHERE organization_id=${fixture.organizationId}::uuid`;
    assert.equal(required(batches[0]).count, 1);
  });
});
