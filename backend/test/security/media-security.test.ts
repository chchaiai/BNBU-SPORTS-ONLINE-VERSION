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
import type { MediaPolicyResolver } from '../../src/common/policy/media-policy-resolver.js';
import type { ExerciseSessionPolicyResolver } from '../../src/common/policy/exercise-session-policy-resolver.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { redactSensitive, REDACTED_VALUE } from '../../src/common/logging/redaction.js';
import { mediaProjection } from '../../src/modules/media/application/media-projection.js';
import {
  BindMediaRequestDto,
  InitiateMediaUploadRequestDto,
} from '../../src/modules/media/interface/http/media.dto.js';

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
    getClass: () => class MediaSecurityController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

describe('Stage 15 MediaEvidence security', () => {
  it('enforces Student mutations and only current metadata read roles', async () => {
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
          status: 'IN_PROGRESS',
        }),
    };
    const mediaPolicy: MediaPolicyResolver = {
      resolveMedia: (candidate, mediaId) =>
        Promise.resolve({
          mediaId,
          organizationId: candidate.organizationId,
          ownerStudentId: 'student-1',
          ownerUserId: candidate.userId,
          sessionId: 'session-1',
          enrollmentId: null,
          classSectionId: 'section-1',
          teacherUserId: 'teacher-user',
          uploadStatus: 'AVAILABLE',
        }),
      resolveUpload: (candidate, uploadSessionId) =>
        Promise.resolve({
          uploadSessionId,
          uploadSessionStatus: 'ACTIVE',
          mediaId: 'media-1',
          organizationId: candidate.organizationId,
          ownerStudentId: 'student-1',
          ownerUserId: candidate.userId,
          sessionId: 'session-1',
          enrollmentId: null,
          classSectionId: 'section-1',
          teacherUserId: 'teacher-user',
          uploadStatus: 'PENDING_UPLOAD',
        }),
    };
    const authorize = async (operationId: string, role: UserRole,
      body: Record<string, unknown> = { businessPurpose: 'EXERCISE_RECORD', sessionId: 'session-1' }): Promise<boolean> => {
      const handler = (): void => undefined;
      Reflect.defineMetadata(OPERATION_ID_METADATA, operationId, handler);
      return new AccessPolicyGuard(
        new Reflector(),
        undefined,
        undefined,
        sessionPolicy,
        mediaPolicy,
      ).canActivate(
        context(handler, {
          headers: {},
          params: { mediaId: 'media-1', uploadSessionId: 'upload-1' },
          body,
          principal: principal(role),
        }),
      );
    };
    for (const operation of ['initiateMediaUpload', 'confirmMediaUpload', 'bindMediaEvidence']) {
      assert.equal(await authorize(operation, 'STUDENT'), true);
      for (const role of ['TEACHER', 'ADMIN'] as const) {
        await assert.rejects(
          authorize(operation, role),
          (error: unknown) =>
            error instanceof ApplicationError && error.code === 'PERMISSION_RESOURCE_SCOPE_DENIED',
        );
      }
    }
    for (const operation of ['getMediaEvidence', 'createMediaAccessUrl']) {
      assert.equal(await authorize(operation, 'STUDENT'), true);
      assert.equal(await authorize(operation, 'TEACHER'), true);
      await assert.rejects(authorize(operation, 'ADMIN'));
    }
    for (const body of [{ sessionId: 'session-1' },
      { businessPurpose: 'EXERCISE_RECORD', sessionId: 'session-1', enrollmentId: 'enrollment-1' },
      { businessPurpose: 'UNKNOWN', sessionId: 'session-1' }]) {
      await assert.rejects(authorize('initiateMediaUpload', 'STUDENT', body),
        (error: unknown) => error instanceof ApplicationError && error.code === 'MEDIA_BIND_TARGET_INVALID');
    }
  });

  it('rejects mass assignment and Record targets at the DTO boundary', async () => {
    const initiated = plainToInstance(InitiateMediaUploadRequestDto, {
      sessionId: '0197d460-a737-7b2e-8cec-a3c9a41337b4',
      businessPurpose: 'EXERCISE_RECORD',
      mediaType: 'IMAGE',
      mimeType: 'image/png',
      fileSizeBytes: 45,
      captureSource: 'IN_APP_CAMERA',
      ownerStudentId: 'attacker',
      organizationId: 'attacker',
      storageKey: 'attacker/key',
      verifiedContentSha256: 'a'.repeat(64),
      uploadStatus: 'AVAILABLE',
    });
    assert.equal((await validate(initiated, { whitelist: true })).length, 0);
    for (const field of [
      'ownerStudentId',
      'organizationId',
      'storageKey',
      'verifiedContentSha256',
      'uploadStatus',
    ]) {
      assert.equal(Object.hasOwn(initiated, field), false);
    }
    const bind = plainToInstance(BindMediaRequestDto, {
      sessionId: '0197d460-a737-7b2e-8cec-a3c9a41337b4',
      expectedVersion: 2,
      recordId: '0197d460-a737-7b2e-8cec-a3c9a41337b5',
    });
    assert.equal((await validate(bind, { whitelist: true })).length, 0);
    assert.equal(Object.hasOwn(bind, 'recordId'), false);
  });

  it('never projects storage facts and redacts every capability field recursively', () => {
    const projected = mediaProjection({
      safeMetadata: {},
      id: 'media-1',
      organizationId: 'organization-1',
      ownerStudentId: 'student-1',
      sessionId: 'session-1',
      enrollmentId: null,
      initiatedByUserId: 'user-1',
      businessPurpose: 'EXERCISE_RECORD',
      mediaType: 'IMAGE',
      captureSource: 'IN_APP_CAMERA',
      declaredMimeType: 'image/png',
      verifiedMimeType: 'image/png',
      declaredFileSizeBytes: 45n,
      verifiedFileSizeBytes: 45n,
      declaredContentSha256: null,
      verifiedContentSha256: 'a'.repeat(64),
      declaredDurationSeconds: null,
      verifiedDurationSeconds: null,
      uploadStatus: 'AVAILABLE',
      storageKey: 'media/private/key',
      uploadedAt: new Date(),
      boundAt: new Date(),
      processingStartedAt: new Date(),
      availableAt: new Date(),
      failedAt: null,
      failureCode: null,
      createdAt: new Date(),
      updatedAt: new Date(),
      version: 5,
    });
    assert.equal(Object.hasOwn(projected, 'storageKey'), false);
    assert.equal(Object.hasOwn(projected, 'accessUrl'), false);
    const redacted = redactSensitive({
      uploadUrl: 'https://signed.invalid/upload?secret=1',
      accessUrl: 'https://signed.invalid/read?secret=2',
      requiredHeaders: { authorization: 'secret' },
      storageKey: 'media/private/key',
      mediaStorageSecretKey: 'secret',
    }) as Record<string, unknown>;
    for (const value of Object.values(redacted)) assert.equal(value, REDACTED_VALUE);
  });
});
