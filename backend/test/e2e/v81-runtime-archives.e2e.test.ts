import { required } from '../helpers/required.js';
import { mkdtemp, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
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

describe('V81 runtime archives HTTP E2E', () => {
  const storage = new MemoryObjectStorage();
  let logDirectory: string;
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
    logDirectory = await mkdtemp(resolve(tmpdir(), 'bnbu-archive-e2e-'));
    const databaseUrl = requireTestDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    const port = await availablePort();
    Object.assign(process.env, foundationEnvironment(databaseUrl, port), { REQUEST_BODY_LIMIT_BYTES: '2097152', RUNTIME_LOG_DIRECTORY: logDirectory, V81_RUNTIME_ARCHIVE_ACCESS: '1' });
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

  it('generates a scoped private ZIP with the live worker, downloads it and revokes access on cancellation', async () => {
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    const row = { msg: 'http_request_completed', time: new Date().toISOString(), requestId: uuidv7(),
      organizationId: fixture.organizationId, operationId: 'getV81AccountSecurity', method: 'GET',
      statusCode: 200, durationMs: 1, secret: 'SYNTHETIC_SENSITIVE_MARKER' };
    await writeFile(resolve(logDirectory, 'synthetic.ndjson'), [row,
      { ...row, organizationId: fixture.isolationOrganizationId, requestId: uuidv7() }]
      .map(item => JSON.stringify(item)).join('\n') + '\n');
    const businessRequest = async (path: string, access: string, input?: Record<string, unknown>, key = uuidv7()) => {
      const result = await request(`/api/v1${path}`, authenticated(access, input === undefined ? 'GET' : 'POST', input, key));
      assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.body));
      return object(result.body.data);
    };
    const { probeRuntimeArchive } = await import('../../../tools/local-integration/v81-runtime-archive-probe.mjs');
    await probeRuntimeArchive({ prisma, fixture, request: businessRequest, baseUrl: `${baseUrl}/api/v1`,
      adminToken, teacherToken });
    const beforeCleanup = await prisma.$queryRaw<{ id: string; status: string; storage_key: string; version: number }[]>`SELECT id,status,storage_key,version FROM v81_runtime_archives WHERE organization_id=${fixture.organizationId}::uuid`;
    assert.equal(beforeCleanup.length, 1);
    assert.equal(required(beforeCleanup[0]).status, 'CANCELLED');
    const source = await readFile(resolve(logDirectory, 'synthetic.ndjson'), 'utf8');
    const { V81RuntimeArchiveWorker } = await import(compiledModule('modules/v8/v81-runtime-archives.js'));
    const worker = app.get<{ cleanup(): Promise<void> }>(V81RuntimeArchiveWorker);
    await worker.cleanup();
    await worker.cleanup();
    assert.equal(storage.objects.has(required(beforeCleanup[0]).storage_key), false);
    const cleanup = await prisma.$queryRaw<{ id: string }[]>`SELECT id FROM v81_runtime_archive_cleanup WHERE archive_id=${required(beforeCleanup[0]).id}::uuid`;
    assert.equal(cleanup.length, 1);
    const events = await prisma.$queryRaw<{ facts: unknown }[]>`SELECT facts FROM v81_events WHERE resource_type='RUNTIME_ARCHIVE_CLEANUP' AND resource_id=${required(cleanup[0]).id}::uuid`;
    assert.equal(events.length, 1);
    assert.deepEqual(required(events[0]).facts, { archiveId: required(beforeCleanup[0]).id, jobVersion: required(beforeCleanup[0]).version });
    assert.deepEqual(await prisma.$queryRaw`SELECT id,status,storage_key,version FROM v81_runtime_archives WHERE organization_id=${fixture.organizationId}::uuid`, beforeCleanup);
    assert.equal(await readFile(resolve(logDirectory, 'synthetic.ndjson'), 'utf8'), source);

  });
});
