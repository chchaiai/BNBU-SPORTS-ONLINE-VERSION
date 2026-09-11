import type { AuthenticatedPrincipal } from '../http/request-context.js';

export interface ExerciseRecordCollectionScope {
  organizationId: string;
  role: AuthenticatedPrincipal['role'];
  studentId?: string;
  teacherUserId?: string;
}

export interface ExerciseRecordPolicyContext {
  recordId: string;
  organizationId: string;
  studentId: string;
  studentUserId: string;
  enrollmentId: string;
  classSectionId: string;
  teacherUserId: string;
  status: string;
  version: number;
}

export abstract class ExerciseRecordPolicyResolver {
  abstract resolveCollection(
    principal: AuthenticatedPrincipal,
  ): Promise<ExerciseRecordCollectionScope>;

  abstract resolveRecord(
    principal: AuthenticatedPrincipal,
    recordId: string,
  ): Promise<ExerciseRecordPolicyContext>;
}
