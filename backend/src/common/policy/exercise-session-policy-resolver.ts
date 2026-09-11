import type { AuthenticatedPrincipal } from '../http/request-context.js';

export interface ExerciseSessionPolicyContext {
  sessionId: string;
  organizationId: string;
  studentId: string;
  studentUserId: string;
  enrollmentId: string;
  classSectionId: string;
  status: string;
}

export interface PrincipalStudentPolicyContext {
  organizationId: string;
  studentId: string;
  studentUserId: string;
}

export abstract class ExerciseSessionPolicyResolver {
  abstract resolvePrincipalStudent(
    principal: AuthenticatedPrincipal,
  ): Promise<PrincipalStudentPolicyContext>;

  abstract resolveSession(
    principal: AuthenticatedPrincipal,
    sessionId: string,
  ): Promise<ExerciseSessionPolicyContext>;
}
