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
import type { EnrollmentPolicyResolver } from '../../src/common/policy/enrollment-policy-resolver.js';
import type { ExerciseSessionPolicyResolver } from '../../src/common/policy/exercise-session-policy-resolver.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { projectExerciseSession } from '../../src/modules/exercise-sessions/application/exercise-session-projection.js';
import {
  CancelExerciseSessionRequestDto,
  ReconcileExerciseSessionRequestDto,
  StartExerciseSessionRequestDto,
} from '../../src/modules/exercise-sessions/interface/http/exercise-sessions.dto.js';

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
    getClass: () => class SessionSecurityController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

async function authorize(operationId: string, role: UserRole): Promise<boolean> {
  const handler = (): void => undefined;
  Reflect.defineMetadata(OPERATION_ID_METADATA, operationId, handler);
  const enrollmentPolicy: EnrollmentPolicyResolver = {
    resolveCollection: (candidate: AuthenticatedPrincipal) =>
      Promise.resolve({ role: candidate.role }),
    resolveEnrollment: (candidate: AuthenticatedPrincipal, enrollmentId: string) =>
      Promise.resolve({
        enrollmentId,
        organizationId: candidate.organizationId,
        studentId: 'student-1',
        studentUserId: candidate.userId,
        classSectionId: 'section-1',
        teacherUserId: 'teacher-user',
        status: 'ACTIVE',
      }),
  };
  const sessionPolicy: ExerciseSessionPolicyResolver = {
    resolvePrincipalStudent: (candidate: AuthenticatedPrincipal) =>
      Promise.resolve({
        organizationId: candidate.organizationId,
        studentId: 'student-1',
        studentUserId: candidate.userId,
      }),
    resolveSession: (candidate: AuthenticatedPrincipal, sessionId: string) =>
      Promise.resolve({
        sessionId,
        organizationId: candidate.organizationId,
        studentId: 'student-1',
        studentUserId: candidate.userId,
        enrollmentId: 'enrollment-1',
        classSectionId: 'section-1',
        status: 'IN_PROGRESS',
      }),
  };
  return new AccessPolicyGuard(
    new Reflector(),
    undefined,
    enrollmentPolicy,
    sessionPolicy,
  ).canActivate(
    context(handler, {
      headers: {},
      params: { sessionId: 'session-1' },
      body: { enrollmentId: 'enrollment-1' },
      principal: principal(role),
    }),
  );
}

describe('Stage 14 ExerciseSession security', () => {
  it('allows only STUDENT for all eight Session operations', async () => {
    for (const operationId of [
      'startExerciseSession',
      'getActiveExerciseSession',
      'getExerciseSession',
      'pauseExerciseSession',
      'resumeExerciseSession',
      'finishExerciseSession',
      'cancelExerciseSession',
      'reconcileExerciseSession',
    ]) {
      assert.equal(await authorize(operationId, 'STUDENT'), true);
      for (const role of ['TEACHER', 'ADMIN'] as const) {
        await assert.rejects(
          authorize(operationId, role),
          (error: unknown) =>
            error instanceof ApplicationError && error.code === 'PERMISSION_RESOURCE_SCOPE_DENIED',
        );
      }
    }
  });

  it('rejects whitespace cancellation reasons and malformed reconciliation input', async () => {
    const cancel = plainToInstance(CancelExerciseSessionRequestDto, {
      expectedVersion: 1,
      reason: ' \t\r\n ',
    });
    assert.ok((await validate(cancel)).length > 0);
    const reconcile = plainToInstance(ReconcileExerciseSessionRequestDto, {
      expectedVersion: 0,
      clientEvents: [{ eventId: '', eventType: 'forged', observedAt: 'not-a-date' }],
    });
    assert.ok((await validate(reconcile)).length >= 2);
  });

  it('whitelists Session inputs so identity, time, duration, status, and version cannot be assigned', async () => {
    const start = plainToInstance(StartExerciseSessionRequestDto, {
      enrollmentId: '0197d460-a737-7b2e-8cec-a3c9a41337b4',
      clientObservedAt: '2099-01-01T00:00:00.000Z',
      studentId: 'attacker-student',
      organizationId: 'attacker-organization',
      status: 'COMPLETED',
      actualDurationSeconds: 7200,
      pausedDurationSeconds: 0,
      businessDate: '2099-01-01',
      version: 999,
    });
    assert.equal((await validate(start, { whitelist: true })).length, 0);
    for (const forbidden of [
      'studentId',
      'organizationId',
      'status',
      'actualDurationSeconds',
      'pausedDurationSeconds',
      'businessDate',
      'version',
    ]) {
      assert.equal(Object.hasOwn(start, forbidden), false);
    }
  });

  it('never exposes auth-session linkage, interval internals, safe metadata, or storage fields', () => {
    const projected = projectExerciseSession(
      {
        id: 'session-1',
        organizationId: 'organization-1',
        studentId: 'student-1',
        enrollmentId: 'enrollment-1',
        classSectionId: 'section-1',
        semesterId: 'semester-1',
        startedByAuthSessionId: 'secret-auth-session',
        status: 'COMPLETED',
        startedAt: new Date('2026-08-04T00:00:00.000Z'),
        businessDate: new Date('2026-08-04T00:00:00.000Z'),
        completedAt: new Date('2026-08-04T01:00:00.000Z'),
        cancelledAt: null,
        expiredAt: null,
        endReason: 'USER_COMPLETED',
        actualDurationSeconds: 3600n,
        pausedDurationSeconds: 60n,
        currentIntervalStartedAt: null,
        lastHeartbeatAt: new Date('2026-08-04T01:00:00.000Z'),
        createdAt: new Date('2026-08-04T00:00:00.000Z'),
        updatedAt: new Date('2026-08-04T01:00:00.000Z'),
        version: 3,
      },
      new Date('2026-08-04T02:00:00.000Z'),
    );
    for (const forbidden of [
      'startedByAuthSessionId',
      'currentIntervalStartedAt',
      'safeMetadata',
      'storageKey',
      'clientObservedAt',
    ]) {
      assert.equal(Object.hasOwn(projected, forbidden), false);
    }
  });
});
