import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { Reflector } from '@nestjs/core';
import { firstValueFrom, of, throwError } from 'rxjs';

import { Prisma } from '../../src/generated/prisma/client.js';
import { AuditService } from '../../src/common/audit/audit.service.js';
import { validateEnvironment, type RuntimeConfig } from '../../src/common/config/environment.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import { HttpExceptionFilter } from '../../src/common/errors/http-exception.filter.js';
import { EnvelopeInterceptor } from '../../src/common/http/envelope.interceptor.js';
import type { FoundationRequest } from '../../src/common/http/request-context.js';
import { RequestIdMiddleware, validRequestId } from '../../src/common/http/request-id.js';
import {
  canonicalJson,
  IdempotencyService,
  isSerializationFailure,
  validateIdempotencyKey,
} from '../../src/common/idempotency/idempotency.service.js';
import { redactSensitive, REDACTED_VALUE } from '../../src/common/logging/redaction.js';
import { HttpLoggingInterceptor } from '../../src/common/logging/http-logging.interceptor.js';
import { OutboxService } from '../../src/common/outbox/outbox.service.js';
import { AccessPolicyGuard } from '../../src/common/policy/access-policy.guard.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { SYSTEM_MODE_ALLOWLIST_METADATA } from '../../src/common/policy/system-mode-policy.decorator.js';
import { InMemoryRateLimitAdapter } from '../../src/common/rate-limit/in-memory-rate-limit.adapter.js';
import { SecureDigestService } from '../../src/common/security/secure-digest.service.js';
import { FixedClock } from '../../src/common/time/clock.js';
import { IdGenerator, UuidV7Generator } from '../../src/common/time/id-generator.js';
import { OrganizationTimeService } from '../../src/common/time/organization-time.service.js';
import { PasswordHasherService } from '../../src/modules/auth/password-hasher.service.js';
import { TokenService } from '../../src/modules/auth/token.service.js';
import { SystemModeGuard } from '../../src/modules/system-mode/system-mode.guard.js';
import type { SystemModeService } from '../../src/modules/system-mode/system-mode.service.js';
import {
  foundationEnvironment,
  TEST_PRIVATE_KEY,
  TEST_PUBLIC_KEY,
} from '../helpers/test-environment.js';

class SequenceIdGenerator extends IdGenerator {
  private sequence = 0;

  next(): string {
    this.sequence += 1;
    return `00000000-0000-7000-8000-${String(this.sequence).padStart(12, '0')}`;
  }
}

function runtimeConfig(): RuntimeConfig {
  const raw = foundationEnvironment(
    'postgresql://synthetic:synthetic@127.0.0.1:1/bnbu_unit_test',
    0,
  );
  raw.TOKEN_SIGNING_KEY = TEST_PRIVATE_KEY;
  raw.TOKEN_VERIFYING_KEY = TEST_PUBLIC_KEY;
  return validateEnvironment(raw).RUNTIME_CONFIG as RuntimeConfig;
}

function httpContext(handler: () => void, request: Partial<FoundationRequest>): never {
  return {
    getHandler: () => handler,
    getClass: () => class TestController {},
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ statusCode: 200 }) }),
  } as never;
}

describe('Foundation time and identifiers', () => {
  it('generates UUIDv7 identifiers and supports a deterministic Clock', () => {
    const id = new UuidV7Generator().next();
    assert.match(id, /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

    const clock = new FixedClock(new Date('2026-08-02T00:00:00.000Z'));
    const first = clock.now();
    first.setUTCFullYear(2000);
    assert.equal(clock.now().toISOString(), '2026-08-02T00:00:00.000Z');
    clock.advanceMilliseconds(1_000);
    assert.equal(clock.now().toISOString(), '2026-08-02T00:00:01.000Z');
  });

  it('derives businessDate from the organization timezone', () => {
    const dates = new OrganizationTimeService();
    assert.equal(
      dates.businessDate(new Date('2026-08-01T16:30:00.000Z'), 'Asia/Shanghai'),
      '2026-08-02',
    );
  });
});

describe('HTTP primitives', () => {
  it('logs the mapped application error status instead of the pre-filter response status', async () => {
    let logged: Record<string, unknown> | undefined;
    const interceptor = new HttpLoggingInterceptor({
      http: (fields: Record<string, unknown>) => {
        logged = fields;
      },
    } as never);
    const request = {
      requestId: '00000000-0000-7000-8000-000000000001',
      operationId: 'getCurrentUser',
      method: 'GET',
    } as FoundationRequest;

    await assert.rejects(
      firstValueFrom(
        interceptor.intercept(
          httpContext(() => undefined, request),
          {
            handle: () => throwError(() => new ApplicationError('CONFLICT_STATE_TRANSITION', 409)),
          },
        ),
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'CONFLICT_STATE_TRANSITION',
    );
    assert.equal(logged?.statusCode, 409);
    assert.equal(logged?.errorCode, 'CONFLICT_STATE_TRANSITION');
    assert.equal(logged?.outcome, 'FAILED');
  });
  it('accepts only bounded safe request IDs and generates a replacement', () => {
    assert.equal(validRequestId('safe:req-1'), true);
    assert.equal(validRequestId('unsafe request id'), false);
    const middleware = new RequestIdMiddleware(new SequenceIdGenerator());
    const request = { headers: { 'x-request-id': 'unsafe request id' } } as never;
    let responseHeader = '';
    let continued = false;
    middleware.use(
      request,
      { setHeader: (_name: string, value: string) => (responseHeader = value) } as never,
      () => (continued = true),
    );
    assert.equal(continued, true);
    assert.equal((request as FoundationRequest).requestId, responseHeader);
    assert.match(responseHeader, /^[0-9a-f-]{36}$/);
  });

  it('wraps success and maps errors to exactly five public fields', async () => {
    const request = { requestId: 'req-unit' } as FoundationRequest;
    const context = httpContext(() => undefined, request);
    const envelope = await firstValueFrom(
      new EnvelopeInterceptor<string>().intercept(context, { handle: () => of('ok') }),
    );
    assert.deepEqual(envelope, { data: 'ok', meta: { requestId: 'req-unit' } });

    let status = 0;
    let body: Record<string, unknown> = {};
    const host = {
      switchToHttp: () => ({
        getRequest: () => request,
        getResponse: () => ({
          status: (value: number) => {
            status = value;
            return { json: (valueBody: Record<string, unknown>) => (body = valueBody) };
          },
        }),
      }),
    } as never;
    new HttpExceptionFilter(new FixedClock(new Date('2026-08-02T00:00:00.000Z'))).catch(
      new ApplicationError('AUTH_REQUIRED', 401),
      host,
    );
    assert.equal(status, 401);
    assert.deepEqual(Object.keys(body).sort(), [
      'code',
      'details',
      'message',
      'requestId',
      'timestamp',
    ]);
    assert.equal(body.requestId, 'req-unit');
  });
});

describe('Authentication cryptography', () => {
  it('hashes passwords with Argon2id and rejects a wrong password', async () => {
    const passwords = new PasswordHasherService();
    await passwords.onModuleInit();
    const encoded = await passwords.hash('correct-password');
    assert.match(encoded, /^\$argon2id\$/);
    assert.equal(await passwords.verify(encoded, 'correct-password'), true);
    assert.equal(await passwords.verify(encoded, 'wrong-password'), false);
    assert.equal(await passwords.verify(null, 'anything'), false);
  });

  it('issues only the frozen claims and fails closed for expiration and tampering', async () => {
    const config = runtimeConfig();
    const clock = new FixedClock(new Date('2026-08-02T00:00:00.000Z'));
    const tokens = new TokenService(config, clock, new SequenceIdGenerator());
    await tokens.onModuleInit();
    const issued = await tokens.issue({
      userId: '00000000-0000-7000-8000-000000000001',
      organizationId: '00000000-0000-7000-8000-000000000002',
      role: 'TEACHER',
      sessionId: '00000000-0000-7000-8000-000000000003',
      tokenVersion: 4,
    });
    const principal = await tokens.verify(issued.token);
    assert.equal(principal.role, 'TEACHER');
    assert.equal(principal.tokenVersion, 4);
    const [protectedHeader, payload, signature] = issued.token.split('.');
    assert.ok(protectedHeader !== undefined && payload !== undefined && signature !== undefined);
    const tamperedSignature = `${signature.startsWith('A') ? 'B' : 'A'}${signature.slice(1)}`;
    await assert.rejects(
      tokens.verify(`${protectedHeader}.${payload}.${tamperedSignature}`),
      (error: unknown) => error instanceof ApplicationError && error.code === 'AUTH_TOKEN_INVALID',
    );
    clock.advanceMilliseconds((config.accessTokenTtlSeconds + 1) * 1_000);
    await assert.rejects(
      tokens.verify(issued.token),
      (error: unknown) => error instanceof ApplicationError && error.code === 'AUTH_TOKEN_EXPIRED',
    );
  });
});

describe('Authorization and SystemMode', () => {
  it('enforces role metadata and rejects missing policy metadata', async () => {
    const reflector = new Reflector();
    const guard = new AccessPolicyGuard(reflector);
    const protectedHandler = (): void => undefined;
    Reflect.defineMetadata(OPERATION_ID_METADATA, 'getCurrentUser', protectedHandler);
    const request = {
      principal: {
        userId: 'user',
        organizationId: 'org',
        role: 'TEACHER',
        sessionId: 'session',
        tokenVersion: 0,
        jti: 'jti',
      },
    } as Partial<FoundationRequest>;
    assert.equal(await guard.canActivate(httpContext(protectedHandler, request)), true);
    assert.equal(request.permissionId, 'USER-SELF-READ');

    const missingHandler = (): void => undefined;
    await assert.rejects(
      guard.canActivate(httpContext(missingHandler, request)),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'SYSTEM_DATA_INTEGRITY_ERROR',
    );
  });

  it('denies ordinary mutations in READ_ONLY and unknown modes', async () => {
    const handler = (): void => undefined;
    const request = { method: 'POST' } as FoundationRequest;
    const reflector = new Reflector();
    const readOnlyService = {
      getPublic: () => Promise.resolve({ mode: 'READ_ONLY', policyVersion: 1, updatedAt: '' }),
    } as unknown as SystemModeService;
    await assert.rejects(
      new SystemModeGuard(reflector, readOnlyService).canActivate(httpContext(handler, request)),
      (error: unknown) => error instanceof ApplicationError && error.code === 'SYSTEM_MODE_UNSUPPORTED',
    );

    Reflect.defineMetadata(SYSTEM_MODE_ALLOWLIST_METADATA, ['NORMAL'], handler);
    const unknownService = {
      getPublic: () => Promise.resolve({ mode: 'UNKNOWN', policyVersion: 1, updatedAt: '' }),
    } as unknown as SystemModeService;
    await assert.rejects(
      new SystemModeGuard(reflector, unknownService).canActivate(httpContext(handler, request)),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'SYSTEM_MODE_UNSUPPORTED',
    );
  });
});

describe('Idempotency, Audit, Outbox, and rate limiting', () => {
  it('validates an Idempotency-Key without creating persistence side effects', () => {
    assert.equal(validateIdempotencyKey('stage13-default-deny'), 'stage13-default-deny');
    for (const invalid of [undefined, '', 'contains space', 'x'.repeat(129)]) {
      assert.throws(
        () => validateIdempotencyKey(invalid),
        (error: unknown) =>
          error instanceof ApplicationError &&
          error.code === 'VALIDATION_FAILED' &&
          error.details.fieldErrors !== undefined,
      );
    }
    assert.equal(
      isSerializationFailure(
        new Prisma.PrismaClientKnownRequestError('transaction conflict', {
          code: 'P2034',
          clientVersion: 'test',
        }),
      ),
      true,
    );
    assert.equal(
      isSerializationFailure(
        new Prisma.PrismaClientKnownRequestError('raw serialization conflict', {
          code: 'P2010',
          clientVersion: 'test',
          meta: { driverAdapterError: { cause: { originalCode: '40001' } } },
        }),
      ),
      true,
    );
  });

  it('recognizes direct adapter serialization failures without retrying unrelated database errors', () => {
    const adapterError = (code: string) =>
      Object.assign(
        new Error('Synthetic driver failure', {
          cause: { originalCode: code },
        }),
        { name: 'DriverAdapterError' },
      );
    assert.equal(isSerializationFailure(adapterError('40001')), true);
    assert.equal(isSerializationFailure(adapterError('23505')), false);
    assert.equal(isSerializationFailure(adapterError('08006')), false);
    assert.equal(isSerializationFailure(new Error('40001')), false);
  });
  it('canonicalizes JSON and replays a stable encrypted response', async () => {
    assert.equal(canonicalJson({ z: 1, a: [true, null] }), '{"a":[true,null],"z":1}');
    assert.throws(() => canonicalJson(Number.NaN), ApplicationError);

    let record: Record<string, unknown> | null = null;
    const transaction = {
      idempotencyRecord: {
        findUnique: () => Promise.resolve(record),
        create: ({ data }: { data: Record<string, unknown> }) => {
          record = { ...data };
          return Promise.resolve(record);
        },
        update: ({ data }: { data: Record<string, unknown> }) => {
          record = { ...record, ...data };
          return Promise.resolve(record);
        },
      },
    };
    const prisma = {
      $transaction: (action: (value: typeof transaction) => Promise<unknown>) =>
        action(transaction),
    } as unknown as PrismaService;
    const config = runtimeConfig();
    const clock = new FixedClock(new Date('2026-08-02T00:00:00.000Z'));
    const digest = new SecureDigestService(config);
    const service = new IdempotencyService(
      prisma,
      clock,
      new SequenceIdGenerator(),
      digest,
      config,
    );
    let executions = 0;
    const input = {
      organizationId: '00000000-0000-7000-8000-000000000001',
      principalId: null,
      authSessionId: null,
      operationId: 'unitOperation',
      scope: 'unit-scope',
      key: 'unit-key',
      request: { value: 1 },
      requestId: 'req-unit',
    };
    const action = () => {
      executions += 1;
      return Promise.resolve(service.success({ accepted: true }));
    };
    assert.deepEqual(await service.execute(input, action), { accepted: true });
    assert.deepEqual(await service.execute(input, action), { accepted: true });
    assert.equal(executions, 1);
    assert.equal(JSON.stringify(record).includes('accepted'), false);
    await assert.rejects(
      service.execute({ ...input, request: { value: 2 } }, action),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'CONFLICT_IDEMPOTENCY_KEY_REUSED',
    );
  });

  it('commits, recovers, completes, and exactly replays a staged idempotent response', async () => {
    let record: Record<string, unknown> | null = null;
    const transaction = {
      idempotencyRecord: {
        findUnique: () => Promise.resolve(record),
        create: ({ data }: { data: Record<string, unknown> }) => {
          record = { ...data };
          return Promise.resolve(record);
        },
        updateMany: ({ data }: { data: Record<string, unknown> }) => {
          record = { ...record, ...data };
          return Promise.resolve({ count: 1 });
        },
      },
    };
    const currentRecord = (): Record<string, unknown> => {
      if (record === null) assert.fail('expected persisted idempotency record');
      return record;
    };
    const prisma = {
      $transaction: (action: (value: typeof transaction) => Promise<unknown>) =>
        action(transaction),
    } as unknown as PrismaService;
    const config = runtimeConfig();
    const service = new IdempotencyService(
      prisma,
      new FixedClock(new Date('2026-08-02T00:00:00.000Z')),
      new SequenceIdGenerator(),
      new SecureDigestService(config),
      config,
    );
    const resourceId = '00000000-0000-7000-8000-000000000099';
    const input = {
      organizationId: '00000000-0000-7000-8000-000000000001',
      principalId: null,
      authSessionId: null,
      operationId: 'stagedUnitOperation',
      scope: 'staged-unit-scope',
      key: 'staged-unit-key',
      request: { checksum: 'synthetic' },
      requestId: 'req-staged-unit',
    };
    let stageExecutions = 0;
    const firstOwner = await service.reserveStage(input, (_database, context) => {
      stageExecutions += 1;
      assert.equal(context.isRecovery, false);
      return Promise.resolve(
        service.stage(
          { durableStatus: 'RECEIVED' },
          { resourceType: 'SYNTHETIC_RESOURCE', resourceId },
        ),
      );
    });
    assert.equal(firstOwner.kind, 'OWNER');
    assert.equal(currentRecord().status, 'IN_PROGRESS');
    assert.equal(currentRecord().resourceId, resourceId);
    assert.equal(currentRecord().responseBodyEncryptedOrReference, undefined);

    record = {
      ...currentRecord(),
      leaseExpiresAt: new Date('2026-08-01T23:59:59.000Z'),
    };
    const recoveredOwner = await service.reserveStage(input, (_database, context) => {
      stageExecutions += 1;
      assert.equal(context.isRecovery, true);
      assert.equal(context.resourceType, 'SYNTHETIC_RESOURCE');
      assert.equal(context.resourceId, resourceId);
      return Promise.resolve(
        service.stage(
          { durableStatus: 'RECEIVED' },
          { resourceType: 'SYNTHETIC_RESOURCE', resourceId },
        ),
      );
    });
    assert.equal(recoveredOwner.kind, 'OWNER');
    if (recoveredOwner.kind !== 'OWNER') assert.fail('expected recovered stage owner');
    const originalResponse = { id: resourceId, isCurrent: true, version: 2 };
    assert.deepEqual(
      await service.completeStage(recoveredOwner, () =>
        Promise.resolve(
          service.success(originalResponse, {
            resourceType: 'SYNTHETIC_RESOURCE',
            resourceId,
          }),
        ),
      ),
      originalResponse,
    );
    assert.equal(currentRecord().status, 'COMPLETED');
    assert.equal(JSON.stringify(currentRecord()).includes('isCurrent'), false);

    const replay = await service.reserveStage(input, () => {
      assert.fail('completed staged requests must not execute the reservation action');
    });
    assert.deepEqual(replay, { kind: 'REPLAY', value: originalResponse });
    assert.equal(stageExecutions, 2);
  });

  it('stores only allowlisted audit metadata and irreversible source digests', async () => {
    const config = runtimeConfig();
    const created: Record<string, unknown>[] = [];
    const transaction = {
      auditLog: {
        create: ({ data }: { data: Record<string, unknown> }) => {
          created.push(data);
          return Promise.resolve(data);
        },
      },
    } as never;
    const service = new AuditService(
      new FixedClock(new Date('2026-08-02T00:00:00.000Z')),
      new SequenceIdGenerator(),
      new SecureDigestService(config),
    );
    await service.append(transaction, {
      organizationId: '00000000-0000-7000-8000-000000000001',
      actorUserId: null,
      actorRoleSnapshot: null,
      permissionId: 'AUTH-PASSWORD-LOGIN',
      actionType: 'AUTHENTICATION_FAILED',
      targetType: 'User',
      targetId: null,
      requestId: 'req-unit',
      outcome: 'REJECTED',
      safeMetadata: { credentialType: 'PASSWORD' },
      sourceIp: '203.0.113.10',
    });
    assert.notEqual(created[0]?.sourceIpHash, '203.0.113.10');
    assert.equal(JSON.stringify(created).includes('203.0.113.10'), false);
    await assert.rejects(
      service.append(transaction, {
        organizationId: '00000000-0000-7000-8000-000000000001',
        actorUserId: null,
        actorRoleSnapshot: null,
        permissionId: 'AUTH-PASSWORD-LOGIN',
        actionType: 'AUTHENTICATION_FAILED',
        targetType: 'User',
        targetId: null,
        requestId: 'req-unit',
        outcome: 'REJECTED',
        safeMetadata: { password: 'must-not-be-stored' },
      }),
      ApplicationError,
    );
  });

  it('enforces Outbox state ownership and fixed-window rate limits', async () => {
    const updates = [1, 0];
    const prisma = {
      outboxEvent: {
        updateMany: () => Promise.resolve({ count: updates.shift() ?? 0 }),
      },
    } as unknown as PrismaService;
    const outbox = new OutboxService(
      prisma,
      new FixedClock(new Date('2026-08-02T00:00:00.000Z')),
      new SequenceIdGenerator(),
    );
    await outbox.markProcessed('00000000-0000-7000-8000-000000000001', 'worker-1');
    await assert.rejects(
      outbox.markProcessed('00000000-0000-7000-8000-000000000001', 'worker-2'),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'CONFLICT_UNSUPPORTED_RESOURCE_STATE',
    );

    const limiter = new InMemoryRateLimitAdapter(
      new FixedClock(new Date('2026-08-02T00:00:00.000Z')),
    );
    const request = {
      purpose: 'AUTHENTICATION' as const,
      keys: ['same-key'],
      windowSeconds: 60,
      maximumAttempts: 2,
    };
    assert.equal((await limiter.consume(request)).allowed, true);
    assert.equal((await limiter.consume(request)).allowed, true);
    assert.equal((await limiter.consume(request)).allowed, false);
  });

  it('redacts secrets and PII recursively', () => {
    const redacted = redactSensitive({
      authorization: 'Bearer secret',
      nested: { password: 'secret', primaryEmail: 'person@example.edu', safe: 'visible' },
    });
    assert.deepEqual(redacted, {
      authorization: REDACTED_VALUE,
      nested: { password: REDACTED_VALUE, primaryEmail: REDACTED_VALUE, safe: 'visible' },
    });
  });
});
