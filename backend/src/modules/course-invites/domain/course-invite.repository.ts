import type { CourseInvitePolicyContext } from '../../../common/policy/qr-join-policy-resolver.js';
import type { CourseInviteState } from './course-invite.js';

export interface JoinableClassSection {
  id: string;
  organizationId: string;
  courseId: string;
  semesterId: string;
  teacherId: string;
  status: string;
  isEnrollmentOpen: boolean;
  teacher: {
    id: string;
    userId: string;
    status: string;
    deletedAt: Date | null;
  };
  course: {
    status: string;
    deletedAt: Date | null;
  };
  semester: {
    status: string;
    endDate: Date;
  };
}

export interface CourseInvitePolicyRecord {
  tokenHash: string;
  context: CourseInvitePolicyContext;
}

export abstract class CourseInviteRepository {
  abstract lockClassSection(
    organizationId: string,
    classSectionId: string,
    transaction: object,
  ): Promise<JoinableClassSection | null>;

  abstract nextVersion(classSectionId: string, transaction: object): Promise<number>;
  abstract findActive(
    classSectionId: string,
    transaction: object,
  ): Promise<CourseInviteState | null>;
  abstract create(state: CourseInviteState, transaction: object): Promise<CourseInviteState>;
  abstract update(
    state: CourseInviteState,
    expectedVersion: number,
    transaction: object,
  ): Promise<boolean>;
  abstract findById(inviteId: string, transaction?: object): Promise<CourseInviteState | null>;
  abstract findPolicyRecordById(inviteId: string): Promise<CourseInvitePolicyRecord | null>;
}
