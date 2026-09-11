import type { AuthenticatedPrincipal, UserRole } from '../http/request-context.js';

export interface EnrollmentPolicyContext {
  enrollmentId: string;
  organizationId: string;
  studentId: string;
  studentUserId: string;
  classSectionId: string;
  teacherUserId: string;
  status: string;
}

export interface EnrollmentCollectionScope {
  role: UserRole;
  studentId?: string;
  teacherUserId?: string;
}

export abstract class EnrollmentPolicyResolver {
  abstract resolveCollection(principal: AuthenticatedPrincipal): Promise<EnrollmentCollectionScope>;

  abstract resolveEnrollment(
    principal: AuthenticatedPrincipal,
    enrollmentId: string,
  ): Promise<EnrollmentPolicyContext>;
}
