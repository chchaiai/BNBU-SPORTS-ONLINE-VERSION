import type { Request } from 'express';

import type {
  CourseInvitePolicyContext,
  JoinCapabilityPolicyContext,
} from '../policy/qr-join-policy-resolver.js';
import type {
  EnrollmentCollectionScope,
  EnrollmentPolicyContext,
} from '../policy/enrollment-policy-resolver.js';
import type {
  ExerciseSessionPolicyContext,
  PrincipalStudentPolicyContext,
} from '../policy/exercise-session-policy-resolver.js';
import type {
  MediaPolicyContext,
  MediaUploadPolicyContext,
} from '../policy/media-policy-resolver.js';
import type {
  ExerciseRecordCollectionScope,
  ExerciseRecordPolicyContext,
} from '../policy/exercise-record-policy-resolver.js';

export const USER_ROLES = ['STUDENT', 'TEACHER', 'ADMIN'] as const;
export type UserRole = (typeof USER_ROLES)[number];

export interface AuthenticatedPrincipal {
  userId: string;
  organizationId: string;
  role: UserRole;
  sessionId: string;
  tokenVersion: number;
  jti: string;
}

export interface FoundationRequest extends Request {
  requestId: string;
  operationId?: string;
  permissionId?: string;
  principal?: AuthenticatedPrincipal;
  resourceOrganizationId?: string;
  inviteContext?: CourseInvitePolicyContext;
  capabilityContext?: JoinCapabilityPolicyContext;
  enrollmentContext?: EnrollmentPolicyContext;
  enrollmentCollectionScope?: EnrollmentCollectionScope;
  exerciseSessionContext?: ExerciseSessionPolicyContext;
  principalStudentContext?: PrincipalStudentPolicyContext;
  mediaContext?: MediaPolicyContext;
  mediaUploadContext?: MediaUploadPolicyContext;
  exerciseRecordContext?: ExerciseRecordPolicyContext;
  exerciseRecordCollectionScope?: ExerciseRecordCollectionScope;
}

export function requestIdFrom(request: Request): string {
  const candidate = (request as Partial<FoundationRequest>).requestId;
  return typeof candidate === 'string' && candidate.length > 0
    ? candidate
    : 'request-id-unavailable';
}
