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

describe('V81 target reallocation HTTP E2E', () => {
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

  it('reallocates repeatedly and preserves record facts while recomputing credit', async () => {
    const teacher = await login(fixture.teacherEmail), other = await login(fixture.teacherBEmail), admin = await login(fixture.adminEmail);
    const record = await seedSubmittedExerciseRecord(prisma, fixture, 'TARGET', 'VALID');
    await prisma.classSection.update({where:{id:fixture.teacherAActiveSectionId},data:{dailyStartTime:new Date('1970-01-01T00:00:00Z'),dailyEndTime:new Date('1970-01-01T23:59:59Z')}});
    const post = (route:string, input:Record<string,unknown>, token=teacher, key=uuidv7()) => request(`/api/v1${route}`,authenticated(token,'POST',input,key));
    const template = data(await post('/rule-templates',{displayName:'Synthetic target rules',expectedVersion:0},admin),201);
    const path = `/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`;
    const input = {templateId:template.id,minimumMinutes:30,maximumMinutes:60,weeklyLimit:3,dailyLimit:1,courseTarget:600,generalTarget:600,globalTargetVersion:0,
      regularDeadline:'2027-01-23T15:59:59Z',closingDeadline:'2027-01-30T15:59:59Z',settlementPlannedAt:'2027-01-30T16:00:00Z',publish:true,expectedVersion:0};
    const first = await post(path,input); assert.ok(first.status<300,JSON.stringify(first.body));
    await prisma.v81RecordWorkflow.create({data:{recordId:record.recordId,organizationId:fixture.organizationId,stage:'VALID'}});
    await prisma.$executeRaw`INSERT INTO v81_record_rule_snapshots(record_id,rule_version,minimum_minutes,weekly_limit,daily_limit,maximum_minutes) VALUES(${record.recordId}::uuid,1,30,3,1,60) ON CONFLICT(record_id) DO NOTHING`;
    const snapshots = await prisma.$queryRaw`SELECT * FROM v81_record_rule_snapshots WHERE record_id=${record.recordId}::uuid`;
    const original = await prisma.exerciseRecord.findUniqueOrThrow({where:{id:record.recordId}});
    const edit = {...input,courseTarget:1200,generalTarget:0,expectedVersion:1};
    const key=uuidv7();const changed=await post(path,edit,teacher,key);assert.ok(changed.status<300,JSON.stringify(changed.body));
    assert.deepEqual((await post(path,edit,teacher,key)).body.data,changed.body.data);
    const credit = async () => (await prisma.$queryRaw<{credited_minutes:number}[]>`SELECT credited_minutes FROM v81_credit_projections WHERE record_id=${record.recordId}::uuid`)[0]?.credited_minutes;
    assert.equal(await credit(),0);
    assert.equal((await post(path,edit)).status,409);
    const second={...input,courseTarget:1170,generalTarget:30,expectedVersion:2};
    assert.equal((await post(path,second,other)).status,404);
    assert.equal((await post(path,second,admin)).status,403);
    assert.equal((await post(path,{...second,generalTarget:31})).status,422);
    assert.equal((await post(path,{...second,globalTargetVersion:1})).status,409);
    const again=await post(path,second);assert.ok(again.status<300,JSON.stringify(again.body));
    assert.equal(await credit(),30);
    assert.deepEqual(await prisma.$queryRaw`SELECT * FROM v81_record_rule_snapshots WHERE record_id=${record.recordId}::uuid`,snapshots);
    assert.deepEqual(await prisma.exerciseRecord.findUniqueOrThrow({where:{id:record.recordId}}),original);
    const loaded=data(await request(`/api/v1${path}`,authenticated(teacher)));
    assert.equal(loaded.course_target,1170);assert.equal(loaded.general_target,30);assert.equal(loaded.version,3);
    const section=data(await request(`/api/v1/class-sections/${fixture.teacherAActiveSectionId}`,authenticated(teacher)));
    const closed=await post(`/class-sections/${fixture.teacherAActiveSectionId}/close`,{expectedVersion:section.version,reason:'Synthetic target closure test'});
    assert.ok(closed.status<300,JSON.stringify(closed.body));
    assert.equal((await post(path,{...input,expectedVersion:3})).status,409);
  });
});

