import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import { ApplicationError } from '../../src/common/errors/application-error.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
  UserRole,
} from '../../src/common/http/request-context.js';
import { AccessPolicyGuard } from '../../src/common/policy/access-policy.guard.js';
import type { ExerciseRecordPolicyResolver } from '../../src/common/policy/exercise-record-policy-resolver.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import {
  BatchReviewRequestDto,
  CreateReviewRequestDto,
} from '../../src/modules/exercise-reviews/interface/http/exercise-reviews.dto.js';

function principal(role: UserRole): AuthenticatedPrincipal {
  return {
    userId: `${role.toLowerCase()}-user`,
    organizationId: 'organization-1',
    role,
    sessionId: `${role.toLowerCase()}-session`,
    tokenVersion: 0,
    jti: `${role.toLowerCase()}-jti`,
  };
}

function context(handler: () => void, request: Partial<FoundationRequest>): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class ExerciseReviewSecurityController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('Stage 17 ExerciseReview security', () => {
  const recordPolicy: ExerciseRecordPolicyResolver = {
    resolveCollection: (candidate) =>
      Promise.resolve({ organizationId: candidate.organizationId, role: candidate.role }),
    resolveRecord: (candidate, recordId) =>
      Promise.resolve({
        recordId,
        organizationId: candidate.organizationId,
        studentId: 'student-1',
        studentUserId: 'student-user',
        enrollmentId: 'enrollment-1',
        classSectionId: 'section-1',
        teacherUserId: candidate.userId,
        status: 'SUBMITTED',
        version: 2,
      }),
  };

  const authorize = async (operationId: string, role: UserRole): Promise<boolean> => {
    const handler = (): void => undefined;
    Reflect.defineMetadata(OPERATION_ID_METADATA, operationId, handler);
    return new AccessPolicyGuard(
      new Reflector(),
      undefined,
      undefined,
      undefined,
      undefined,
      recordPolicy,
    ).canActivate(
      context(handler, {
        headers: {},
        params: { recordId: '0197d460-a737-7b2e-8cec-a3c9a41337b4' },
        body: { items: [] },
        principal: principal(role),
      }),
    );
  };

  it('allows only TEACHER for single, history, reopen, and batch routes', async () => {
    for (const operationId of [
      'listExerciseRecordReviews',
      'reviewExerciseRecord',
      'reopenExerciseRecordReview',
      'batchReviewExerciseRecords',
    ]) {
      assert.equal(await authorize(operationId, 'TEACHER'), true);
      for (const role of ['STUDENT', 'ADMIN'] as const) {
        await assert.rejects(
          authorize(operationId, role),
          (error: unknown) =>
            error instanceof ApplicationError && error.code === 'PERMISSION_RESOURCE_SCOPE_DENIED',
        );
      }
    }
  });

  it('strips forged identity, status, chain, and duration fields while retaining explicit override denial input', async () => {
    const dto = plainToInstance(CreateReviewRequestDto, {
      result: 'VALID',
      expectedReviewVersion: 1,
      expectedVersion: 2,
      creditedDurationOverrideSeconds: 3600,
      teacherId: 'attacker',
      organizationId: 'attacker',
      recordId: 'attacker',
      previousReviewId: 'attacker',
      reviewVersion: 99,
      status: 'REVIEWED',
      creditedDurationSeconds: 7200,
    });
    assert.equal((await validate(dto, { whitelist: true })).length, 0);
    assert.equal(dto.creditedDurationOverrideSeconds, 3600);
    for (const field of [
      'teacherId',
      'organizationId',
      'recordId',
      'previousReviewId',
      'reviewVersion',
      'status',
      'creditedDurationSeconds',
    ]) {
      assert.equal(Object.hasOwn(dto, field), false);
    }
  });

  it('validates every nested batch item and prevents envelope field smuggling', async () => {
    const dto = plainToInstance(BatchReviewRequestDto, {
      items: [
        {
          itemKey: 'one',
          recordId: '0197d460-a737-7b2e-8cec-a3c9a41337b4',
          result: 'INVALID',
          reasonCode: 'NOT_A_REASON',
          expectedReviewVersion: 1,
          expectedVersion: 2,
        },
      ],
      organizationId: 'attacker',
      teacherId: 'attacker',
    });
    assert.ok((await validate(dto, { whitelist: true })).length > 0);
    assert.equal(Object.hasOwn(dto, 'organizationId'), false);
    assert.equal(Object.hasOwn(dto, 'teacherId'), false);
  });
});
