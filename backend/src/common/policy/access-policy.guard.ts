import { PrismaService } from '../database/prisma.service.js';
import { assertProfileReady } from '../../modules/users/application/student-profile-quality.js';
import { CanActivate, ExecutionContext, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';

import {
  operationPolicies,
  type OperationId,
} from '../../generated/operation-policies.generated.js';
import { ApplicationError } from '../errors/application-error.js';
import type { FoundationRequest } from '../http/request-context.js';
import { OPERATION_ID_METADATA } from './operation-policy.decorator.js';
import { QrJoinPolicyResolver } from './qr-join-policy-resolver.js';
import { EnrollmentPolicyResolver } from './enrollment-policy-resolver.js';
import { ExerciseSessionPolicyResolver } from './exercise-session-policy-resolver.js';
import { MediaPolicyResolver } from './media-policy-resolver.js';
import { ExerciseRecordPolicyResolver } from './exercise-record-policy-resolver.js';

const IMPLEMENTED_RESOLVERS = new Set([
  'NONE',
  'REFRESH_TOKEN',
  'AUTHENTICATED_SESSION',
  'PRINCIPAL_USER',
  'PRINCIPAL_ORGANIZATION',
  'STUDENT_LIST_SCOPE',
  'STUDENT_FROM_PATH',
  'COURSE_FROM_PATH',
  'CLASS_SECTION_LIST_SCOPE',
  'CLASS_SECTION_FROM_REQUEST',
  'CLASS_SECTION_FROM_PATH',
  'TEACHER_FROM_PATH',
  'COURSE_INVITE_FROM_PATH',
  'JOIN_CAPABILITY',
  'ENROLLMENT_LIST_SCOPE',
  'ENROLLMENT_FROM_PATH',
  'ENROLLMENT_FROM_REQUEST',
  'PRINCIPAL_STUDENT',
  'EXERCISE_SESSION_FROM_PATH',
  'EXERCISE_SESSION_FROM_REQUEST',
  'MEDIA_UPLOAD_FROM_PATH',
  'MEDIA_TARGET_FROM_REQUEST',
  'MEDIA_FROM_PATH',
  'EXERCISE_RECORD_LIST_SCOPE',
  'EXERCISE_RECORD_FROM_PATH',
  'BATCH_EXERCISE_RECORDS_FROM_BODY',
  'ROSTER_CLASS_SECTION_READ_SCOPE',
  'ROSTER_IMPORT_READ_SCOPE',
  'ROSTER_IMPORT_FROM_PATH',
  'ROSTER_ALIGNMENT_LIST_SCOPE',
  'ROSTER_ALIGNMENT_READ_SCOPE',
  'ROSTER_ALIGNMENT_FROM_PATH',
  'SCORE_RULE_FROM_PATH',
  'STUDENT_SCORE_LIST_SCOPE',
  'STUDENT_SCORE_FROM_PATH',
  'SCORE_ADJUSTMENT_FROM_PATH',
  'EXPORT_LIST_SCOPE',
  'EXPORT_SCOPE_FROM_BODY',
  'EXPORT_FROM_PATH',
  'AUDIT_LOG_FROM_PATH',
]);
const ORGANIZATION_SCOPES = new Set(['NONE', 'PRINCIPAL_ORGANIZATION', 'CAPABILITY_ORGANIZATION']);
const RESOURCE_SCOPES = new Set([
  'NONE',
  'SELF',
  'SESSION',
  'ORGANIZATION',
  'ROLE_SCOPED',
  'TEACHER_CLASS_SECTION',
  'PUBLIC_INVITE',
  'CAPABILITY_CLASS_SECTION',
]);

@Injectable()
export class AccessPolicyGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    @Optional() private readonly qrJoinPolicy?: QrJoinPolicyResolver,
    @Optional() private readonly enrollmentPolicy?: EnrollmentPolicyResolver,
    @Optional() private readonly exerciseSessionPolicy?: ExerciseSessionPolicyResolver,
    @Optional() private readonly mediaPolicy?: MediaPolicyResolver,
    @Optional() private readonly exerciseRecordPolicy?: ExerciseRecordPolicyResolver,
    @Optional() private readonly prisma?: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const operationId = this.reflector.getAllAndOverride<OperationId>(OPERATION_ID_METADATA, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (operationId === undefined) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'OPERATION_POLICY_METADATA_REQUIRED',
      });
    }

    if (!Object.hasOwn(operationPolicies, operationId)) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'OPERATION_POLICY_UNKNOWN',
      });
    }
    const policy = operationPolicies[operationId];
    if (
      policy.defaultDeny !== true ||
      !IMPLEMENTED_RESOLVERS.has(policy.resourceResolver) ||
      !ORGANIZATION_SCOPES.has(policy.organizationScope) ||
      !RESOURCE_SCOPES.has(policy.resourceScope)
    ) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'IMPLEMENTED_POLICY_METADATA_UNSUPPORTED',
        operationId,
      });
    }

    const request = context.switchToHttp().getRequest<FoundationRequest>();
    request.operationId = operationId;
    request.permissionId = policy.policyId;

    if (policy.authentication === 'PUBLIC') {
      if (policy.allowedRoles.length !== 0 || policy.organizationScope !== 'NONE') {
        throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
          invariant: 'PUBLIC_POLICY_SCOPE_INVALID',
          operationId,
        });
      }
      if (policy.resourceResolver === 'COURSE_INVITE_FROM_PATH') {
        if (this.qrJoinPolicy === undefined) {
          throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
            invariant: 'QR_JOIN_POLICY_RESOLVER_REQUIRED',
          });
        }
        if (operationId !== 'previewCourseInvite' && operationId !== 'issueJoinCapability') {
          throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
            invariant: 'PUBLIC_INVITE_OPERATION_UNSUPPORTED',
            operationId,
          });
        }
        const inviteToken = request.params.inviteToken;
        if (typeof inviteToken !== 'string' || inviteToken.length === 0) {
          throw new ApplicationError('COURSE_INVITE_INVALID', 400);
        }
        const invite = await this.qrJoinPolicy.resolveInvite({
          inviteToken,
          sourceIp: request.ip,
          operationId,
        });
        request.inviteContext = invite;
        request.resourceOrganizationId = invite.organizationId;
      }
      return true;
    }

    if (policy.authentication === 'JOIN_CAPABILITY') {
      if (
        policy.organizationScope !== 'CAPABILITY_ORGANIZATION' ||
        policy.resourceScope !== 'CAPABILITY_CLASS_SECTION' ||
        policy.resourceResolver !== 'JOIN_CAPABILITY' ||
        request.capabilityContext === undefined ||
        request.resourceOrganizationId !== request.capabilityContext.organizationId
      ) {
        throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
          invariant: 'JOIN_CAPABILITY_POLICY_CONTEXT_INVALID',
          operationId,
        });
      }
      return true;
    }

    if (policy.authentication !== 'ACCESS_TOKEN') {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'AUTHENTICATION_POLICY_UNSUPPORTED',
        operationId,
      });
    }

    const principal = request.principal;
    if (principal === undefined) throw new ApplicationError('AUTH_REQUIRED', 401);
    if (!(policy.allowedRoles as readonly string[]).includes(principal.role)) {
      if (operationId === 'listAuditLogs' || operationId === 'getAuditLog') {
        throw new ApplicationError('PERMISSION_AUDIT_SCOPE_DENIED', 403);
      }
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    }
    if (policy.organizationScope !== 'PRINCIPAL_ORGANIZATION') {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'PROTECTED_ORGANIZATION_SCOPE_INVALID',
        operationId,
      });
    }

    if(principal.role==='STUDENT' && ['startExerciseSession','createV81HistoricalSession','createExerciseRecordDraft','submitExerciseRecord','issueMemberJoinCapability'].includes(operationId)) {
      if(!this.prisma) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR',500);
      await assertProfileReady(this.prisma,principal.organizationId,principal.userId);
    }

    if (policy.resourceResolver === 'ENROLLMENT_LIST_SCOPE') {
      if (this.enrollmentPolicy === undefined) this.resolverRequired('ENROLLMENT');
      request.enrollmentCollectionScope = await this.enrollmentPolicy.resolveCollection(principal);
    }
    if (policy.resourceResolver === 'ENROLLMENT_FROM_PATH') {
      if (this.enrollmentPolicy === undefined) this.resolverRequired('ENROLLMENT');
      const enrollmentId = request.params.enrollmentId;
      if (typeof enrollmentId !== 'string' || enrollmentId.length === 0) {
        throw new ApplicationError('ENROLLMENT_NOT_FOUND', 404);
      }
      const enrollment = await this.enrollmentPolicy.resolveEnrollment(principal, enrollmentId);
      request.enrollmentContext = enrollment;
      request.resourceOrganizationId = enrollment.organizationId;
    }
    if (policy.resourceResolver === 'ENROLLMENT_FROM_REQUEST') {
      if (this.enrollmentPolicy === undefined) this.resolverRequired('ENROLLMENT');
      const enrollmentId = (request.body as { enrollmentId?: unknown } | undefined)?.enrollmentId;
      if (typeof enrollmentId !== 'string' || enrollmentId.length === 0) {
        throw new ApplicationError('ENROLLMENT_NOT_FOUND', 404);
      }
      const enrollment = await this.enrollmentPolicy.resolveEnrollment(principal, enrollmentId);
      request.enrollmentContext = enrollment;
      request.resourceOrganizationId = enrollment.organizationId;
    }
    if (policy.resourceResolver === 'PRINCIPAL_STUDENT') {
      if (this.exerciseSessionPolicy === undefined) this.resolverRequired('EXERCISE_SESSION');
      const student = await this.exerciseSessionPolicy.resolvePrincipalStudent(principal);
      request.principalStudentContext = student;
      request.resourceOrganizationId = student.organizationId;
    }
    if (policy.resourceResolver === 'EXERCISE_SESSION_FROM_PATH') {
      if (this.exerciseSessionPolicy === undefined) this.resolverRequired('EXERCISE_SESSION');
      const sessionId = request.params.sessionId;
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new ApplicationError('SESSION_NOT_FOUND', 404);
      }
      const session = await this.exerciseSessionPolicy.resolveSession(principal, sessionId);
      request.exerciseSessionContext = session;
      request.resourceOrganizationId = session.organizationId;
    }
    if (policy.resourceResolver === 'MEDIA_TARGET_FROM_REQUEST') {
      const body = request.body as { businessPurpose?: unknown; sessionId?: unknown; enrollmentId?: unknown } | undefined;
      if (body?.businessPurpose === 'EXEMPTION_APPLICATION' && typeof body.enrollmentId === 'string' && body.sessionId === undefined) {
        if (this.enrollmentPolicy === undefined) this.resolverRequired('ENROLLMENT');
        const enrollment = await this.enrollmentPolicy.resolveEnrollment(principal, body.enrollmentId);
        request.enrollmentContext = enrollment;
        request.resourceOrganizationId = enrollment.organizationId;
      } else if (body?.businessPurpose === 'EXERCISE_RECORD' && typeof body.sessionId === 'string' && body.enrollmentId === undefined) {
        if (this.exerciseSessionPolicy === undefined) this.resolverRequired('EXERCISE_SESSION');
        const session = await this.exerciseSessionPolicy.resolveSession(principal, body.sessionId);
        request.exerciseSessionContext = session;
        request.resourceOrganizationId = session.organizationId;
      } else throw new ApplicationError('MEDIA_BIND_TARGET_INVALID', 422);
    }
    if (policy.resourceResolver === 'EXERCISE_SESSION_FROM_REQUEST') {
      if (this.exerciseSessionPolicy === undefined) this.resolverRequired('EXERCISE_SESSION');
      const sessionId = (request.body as { sessionId?: unknown } | undefined)?.sessionId;
      if (typeof sessionId !== 'string' || sessionId.length === 0) {
        throw new ApplicationError('SESSION_NOT_FOUND', 404);
      }
      const session = await this.exerciseSessionPolicy.resolveSession(principal, sessionId);
      request.exerciseSessionContext = session;
      request.resourceOrganizationId = session.organizationId;
    }
    if (policy.resourceResolver === 'MEDIA_UPLOAD_FROM_PATH') {
      if (this.mediaPolicy === undefined) this.resolverRequired('MEDIA');
      const uploadSessionId = request.params.uploadSessionId;
      if (typeof uploadSessionId !== 'string' || uploadSessionId.length === 0) {
        throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
      }
      const upload = await this.mediaPolicy.resolveUpload(principal, uploadSessionId);
      request.mediaUploadContext = upload;
      request.resourceOrganizationId = upload.organizationId;
    }
    if (policy.resourceResolver === 'MEDIA_FROM_PATH') {
      if (this.mediaPolicy === undefined) this.resolverRequired('MEDIA');
      const mediaId = request.params.mediaId;
      if (typeof mediaId !== 'string' || mediaId.length === 0) {
        throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
      }
      const media = await this.mediaPolicy.resolveMedia(principal, mediaId);
      request.mediaContext = media;
      request.resourceOrganizationId = media.organizationId;
    }
    if (policy.resourceResolver === 'EXERCISE_RECORD_LIST_SCOPE') {
      if (this.exerciseRecordPolicy === undefined) this.resolverRequired('EXERCISE_RECORD');
      const scope = await this.exerciseRecordPolicy.resolveCollection(principal);
      request.exerciseRecordCollectionScope = scope;
      request.resourceOrganizationId = scope.organizationId;
    }
    if (policy.resourceResolver === 'EXERCISE_RECORD_FROM_PATH') {
      if (this.exerciseRecordPolicy === undefined) this.resolverRequired('EXERCISE_RECORD');
      const recordId = request.params.recordId;
      if (typeof recordId !== 'string' || recordId.length === 0) {
        throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
      }
      const record = await this.exerciseRecordPolicy.resolveRecord(principal, recordId);
      request.exerciseRecordContext = record;
      request.resourceOrganizationId = record.organizationId;
    }
    if (policy.resourceResolver === 'BATCH_EXERCISE_RECORDS_FROM_BODY') {
      if (principal.role !== 'TEACHER') {
        throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
      }
      // Item scope is deliberately resolved inside independent item transactions so
      // one foreign or missing record cannot turn a contract-defined partial batch
      // into an all-or-nothing authorization response.
      request.resourceOrganizationId = principal.organizationId;
    }

    return true;
  }

  private resolverRequired(name: string): never {
    throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
      invariant: `${name}_POLICY_RESOLVER_REQUIRED`,
    });
  }
}
