import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { lastValueFrom, of } from 'rxjs';

import type { RuntimeConfig } from '../../src/common/config/environment.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import type { FoundationRequest } from '../../src/common/http/request-context.js';
import { HttpLoggingInterceptor } from '../../src/common/logging/http-logging.interceptor.js';
import type { JsonLoggerService } from '../../src/common/logging/json-logger.service.js';
import { redactSensitive, REDACTED_VALUE } from '../../src/common/logging/redaction.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import type {
  JoinCapabilityPolicyContext,
  QrJoinPolicyResolver,
} from '../../src/common/policy/qr-join-policy-resolver.js';
import { QrJoinPublicRateLimitService } from '../../src/common/rate-limit/qr-join-public-rate-limit.service.js';
import { InMemoryRateLimitAdapter } from '../../src/common/rate-limit/in-memory-rate-limit.adapter.js';
import { FixedClock } from '../../src/common/time/clock.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { AccessTokenGuard } from '../../src/modules/auth/access-token.guard.js';
import type { TokenService } from '../../src/modules/auth/token.service.js';

function context(
  handler: () => void,
  request: Partial<FoundationRequest>,
  response: { statusCode: number } = { statusCode: 200 },
): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class SyntheticController {},
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => response,
      getNext: () => undefined,
    }),
  } as unknown as ExecutionContext;
}

function capabilityContext(): JoinCapabilityPolicyContext {
  const now = new Date();
  return {
    capabilityId: '0198795d-9900-7000-8000-000000000001',
    organizationId: '0198795d-9900-7000-8000-000000000002',
    courseInviteId: '0198795d-9900-7000-8000-000000000003',
    classSectionId: '0198795d-9900-7000-8000-000000000004',
    identityFingerprint: 'a'.repeat(64),
    status: 'ACTIVE',
    expiresAt: new Date(now.getTime() + 60_000),
    resultReplayExpiresAt: null,
    invite: {
      inviteId: '0198795d-9900-7000-8000-000000000003',
      organizationId: '0198795d-9900-7000-8000-000000000002',
      classSectionId: '0198795d-9900-7000-8000-000000000004',
      status: 'ACTIVE',
      expiresAt: new Date(now.getTime() + 60_000),
      classSection: {
        id: '0198795d-9900-7000-8000-000000000004',
        organizationId: '0198795d-9900-7000-8000-000000000002',
        courseId: '0198795d-9900-7000-8000-000000000005',
        semesterId: '0198795d-9900-7000-8000-000000000006',
        teacherId: '0198795d-9900-7000-8000-000000000007',
        displayName: 'Synthetic Section',
        status: 'ACTIVE',
        isEnrollmentOpen: true,
        course: {
          courseCode: 'SYNTH-101',
          courseName: 'Synthetic Course',
          status: 'ACTIVE',
          deletedAt: null,
        },
        semester: {
          displayName: 'Synthetic Semester',
          status: 'CURRENT',
          endDate: new Date(now.getTime() + 86_400_000),
        },
        teacher: { fullName: 'Synthetic Teacher', status: 'ACTIVE', deletedAt: null },
      },
    },
  };
}

describe('Stage 12 security negatives', () => {
  it('accepts only X-Join-Capability and rejects ordinary Authorization on atomic Join', async () => {
    const handler = (): void => undefined;
    Reflect.defineMetadata(OPERATION_ID_METADATA, 'joinClassSectionWithInvite', handler);
    let resolverCalls = 0;
    const resolver = {
      resolveCapability: () => {
        resolverCalls += 1;
        return Promise.resolve(capabilityContext());
      },
    } as unknown as QrJoinPolicyResolver;
    const guard = new AccessTokenGuard(
      new Reflector(),
      {} as TokenService,
      {} as PrismaService,
      new FixedClock(new Date()),
      resolver,
    );
    const missing = {
      headers: {},
      params: { inviteToken: 'synthetic-invite' },
    } as Partial<FoundationRequest>;
    await assert.rejects(
      guard.canActivate(context(handler, missing)),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'AUTH_JOIN_CAPABILITY_INVALID',
    );
    const bearer = {
      headers: {
        authorization: 'Bearer forbidden',
        'x-join-capability': 'synthetic-capability',
      },
      params: { inviteToken: 'synthetic-invite' },
    } as Partial<FoundationRequest>;
    await assert.rejects(
      guard.canActivate(context(handler, bearer)),
      (error: unknown) => error instanceof ApplicationError && error.code === 'AUTH_TOKEN_INVALID',
    );
    const valid = {
      headers: { 'x-join-capability': 'synthetic-capability' },
      params: { inviteToken: 'synthetic-invite' },
      ip: '127.0.0.1',
    } as Partial<FoundationRequest>;
    assert.equal(await guard.canActivate(context(handler, valid)), true);
    assert.equal(valid.capabilityContext?.capabilityId, capabilityContext().capabilityId);
    assert.equal(resolverCalls, 1);
  });

  it('logs only the generated route template, never a raw invite token path', async () => {
    const logged: Record<string, unknown>[] = [];
    const logger = {
      http: (fields: Record<string, unknown>) => logged.push(fields),
    } as unknown as JsonLoggerService;
    const interceptor = new HttpLoggingInterceptor(logger);
    const handler = (): void => undefined;
    const rawToken = '0198795d-9900-7000-8000-000000000001.raw-secret-material';
    const request = {
      requestId: 'synthetic-request',
      operationId: 'previewCourseInvite',
      permissionId: 'PUBLIC-COURSE-INVITE-PREVIEW',
      method: 'GET',
      path: `/api/v1/course-invites/${rawToken}/preview`,
    } as Partial<FoundationRequest>;
    await lastValueFrom(
      interceptor.intercept(context(handler, request), { handle: () => of(null) }),
    );
    assert.equal(logged.length, 1);
    assert.equal(logged[0]?.path, '/api/v1/course-invites/{inviteToken}/preview');
    assert.equal(JSON.stringify(logged).includes(rawToken), false);
  });

  it('redacts identity snapshots, ciphertexts, token hashes, and names recursively', () => {
    const redacted = redactSensitive({
      fullName: 'Synthetic Student',
      identitySnapshot: { studentNumber: '00001234' },
      encryptedIdentitySnapshot: 'ciphertext',
      secretCiphertext: 'secret-ciphertext',
      resultCiphertext: 'result-ciphertext',
      tokenHash: 'a'.repeat(64),
    }) as Record<string, unknown>;
    for (const value of Object.values(redacted)) assert.equal(value, REDACTED_VALUE);
  });

  it('rate limits public QR keys together and resets only after the configured window', async () => {
    const clock = new FixedClock(new Date('2026-08-03T00:00:00.000Z'));
    const limiter = new QrJoinPublicRateLimitService(new InMemoryRateLimitAdapter(clock), {
      qrJoinPublicRateLimitWindowSeconds: 60,
      qrJoinPublicRateLimitMaxRequests: 2,
    } as RuntimeConfig);
    await limiter.enforce(['invite:a', 'source:b']);
    await limiter.enforce(['invite:a', 'source:b']);
    await assert.rejects(
      limiter.enforce(['invite:a', 'source:b']),
      (error: unknown) => error instanceof ApplicationError && error.code === 'AUTH_RATE_LIMITED',
    );
    clock.advanceMilliseconds(60_000);
    await limiter.enforce(['invite:a', 'source:b']);
  });
});
