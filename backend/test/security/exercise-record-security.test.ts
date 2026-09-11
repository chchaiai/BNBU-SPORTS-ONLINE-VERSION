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
import type { ExerciseSessionPolicyResolver } from '../../src/common/policy/exercise-session-policy-resolver.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { projectExerciseRecord } from '../../src/modules/exercise-records/application/exercise-record-projection.js';
import {
  CreateExerciseRecordRequestDto,
  SubmitExerciseRecordRequestDto,
} from '../../src/modules/exercise-records/interface/http/exercise-records.dto.js';

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
    getClass: () => class ExerciseRecordSecurityController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('Stage 16 ExerciseRecord security', () => {
  it('permits self mutations only and preserves teacher/admin read-only scope', async () => {
    const sessionPolicy: ExerciseSessionPolicyResolver = {
      resolvePrincipalStudent: (candidate) =>
        Promise.resolve({
          organizationId: candidate.organizationId,
          studentId: 'student-1',
          studentUserId: candidate.userId,
        }),
      resolveSession: (candidate, sessionId) =>
        Promise.resolve({
          sessionId,
          organizationId: candidate.organizationId,
          studentId: 'student-1',
          studentUserId: candidate.userId,
          enrollmentId: 'enrollment-1',
          classSectionId: 'section-1',
          status: 'COMPLETED',
        }),
    };
    const recordPolicy: ExerciseRecordPolicyResolver = {
      resolveCollection: (candidate) =>
        Promise.resolve({
          organizationId: candidate.organizationId,
          role: candidate.role,
          ...(candidate.role === 'STUDENT' ? { studentId: 'student-1' } : {}),
          ...(candidate.role === 'TEACHER' ? { teacherUserId: candidate.userId } : {}),
        }),
      resolveRecord: (candidate, recordId) =>
        Promise.resolve({
          recordId,
          organizationId: candidate.organizationId,
          studentId: 'student-1',
          studentUserId: candidate.role === 'STUDENT' ? candidate.userId : 'student-user',
          enrollmentId: 'enrollment-1',
          classSectionId: 'section-1',
          teacherUserId: candidate.role === 'TEACHER' ? candidate.userId : 'teacher-user',
          status: 'DRAFT',
          version: 1,
        }),
    };
    const authorize = async (operationId: string, role: UserRole): Promise<boolean> => {
      const handler = (): void => undefined;
      Reflect.defineMetadata(OPERATION_ID_METADATA, operationId, handler);
      return new AccessPolicyGuard(
        new Reflector(),
        undefined,
        undefined,
        sessionPolicy,
        undefined,
        recordPolicy,
      ).canActivate(
        context(handler, {
          headers: {},
          params: { recordId: 'record-1' },
          body: { sessionId: 'session-1' },
          principal: principal(role),
        }),
      );
    };
    for (const operation of [
      'createExerciseRecordDraft',
      'updateExerciseRecordDraft',
      'submitExerciseRecord',
      'discardExerciseRecord',
      'withdrawExerciseRecord',
    ]) {
      assert.equal(await authorize(operation, 'STUDENT'), true);
      for (const role of ['TEACHER', 'ADMIN'] as const) {
        await assert.rejects(
          authorize(operation, role),
          (error: unknown) =>
            error instanceof ApplicationError && error.code === 'PERMISSION_RESOURCE_SCOPE_DENIED',
        );
      }
    }
    for (const operation of ['listExerciseRecords', 'getExerciseRecord']) {
      for (const role of ['STUDENT', 'TEACHER', 'ADMIN'] as const) {
        assert.equal(await authorize(operation, role), true);
      }
    }
  });

  it('strips mass-assigned identity, duration, state, review, and storage fields', async () => {
    const draft = plainToInstance(CreateExerciseRecordRequestDto, {
      sessionId: '0197d460-a737-7b2e-8cec-a3c9a41337b4',
      creditType: 'GENERAL',
      sportType: 'RUNNING',
      description: 'Synthetic record',
      clientRequestId: 'android-safe-1',
      organizationId: 'attacker',
      studentId: 'attacker',
      teacherId: 'attacker',
      actualDurationSeconds: 7200,
      creditedDurationSeconds: 7200,
      status: 'REVIEWED',
      currentReview: { result: 'VALID' },
      storageKey: 'private/key',
    });
    assert.equal((await validate(draft, { whitelist: true })).length, 0);
    for (const field of [
      'organizationId',
      'studentId',
      'teacherId',
      'actualDurationSeconds',
      'creditedDurationSeconds',
      'status',
      'currentReview',
      'storageKey',
    ]) {
      assert.equal(Object.hasOwn(draft, field), false);
    }
    const submit = plainToInstance(SubmitExerciseRecordRequestDto, {
      mediaIds: ['0197d460-a737-7b2e-8cec-a3c9a41337b5'],
      expectedVersion: 1,
      result: 'VALID',
      internalNote: 'forged',
    });
    assert.equal((await validate(submit, { whitelist: true })).length, 0);
    assert.equal(Object.hasOwn(submit, 'result'), false);
    assert.equal(Object.hasOwn(submit, 'internalNote'), false);
  });

  it('projects only the frozen student-safe current review', () => {
    const now = new Date();
    const projected = projectExerciseRecord({
      id: 'record-1',
      organizationId: 'organization-1',
      semesterId: 'semester-1',
      studentId: 'student-1',
      enrollmentId: 'enrollment-1',
      classSectionId: 'section-1',
      courseId: 'course-1',
      teacherId: 'teacher-1',
      sessionId: 'session-1',
      businessDate: now,
      creditType: 'GENERAL',
      sportType: 'RUNNING',
      sportName: null,
      description: 'Synthetic record',
      actualDurationSeconds: 3600n,
      pausedDurationSeconds: 0n,
      creditedDurationSeconds: 3600n,
      status: 'SUBMITTED',
      submittedAt: now,
      cancelledAt: null,
      clientRequestId: 'android-safe-1',
      createdAt: now,
      updatedAt: now,
      version: 2,
      reviews: [
        {
          result: 'PENDING',
          reasonCode: null,
          publicComment: null,
          reviewVersion: 1,
        },
      ],
    });
    assert.deepEqual(projected.currentReview, {
      result: 'PENDING',
      reasonCode: null,
      publicComment: null,
    });
    assert.equal(Object.hasOwn(object(projected.currentReview), 'internalNote'), false);
    assert.equal(Object.hasOwn(object(projected.currentReview), 'teacherId'), false);
  });
});

function object(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}
