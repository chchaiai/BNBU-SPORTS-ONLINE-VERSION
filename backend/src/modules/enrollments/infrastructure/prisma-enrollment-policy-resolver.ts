import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import {
  EnrollmentPolicyResolver,
  type EnrollmentCollectionScope,
  type EnrollmentPolicyContext,
} from '../../../common/policy/enrollment-policy-resolver.js';
import { EnrollmentRepository } from '../domain/enrollment.repository.js';

@Injectable()
export class PrismaEnrollmentPolicyResolver extends EnrollmentPolicyResolver {
  constructor(private readonly enrollments: EnrollmentRepository) {
    super();
  }

  async resolveCollection(principal: AuthenticatedPrincipal): Promise<EnrollmentCollectionScope> {
    if (principal.role === 'STUDENT') {
      const profile = await this.enrollments.findStudentByUser(
        principal.organizationId,
        principal.userId,
      );
      if (profile?.status !== 'ACTIVE' || profile.deletedAt !== null) {
        throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
      }
      return { role: principal.role, studentId: profile.id };
    }
    if (principal.role === 'TEACHER') {
      return { role: principal.role, teacherUserId: principal.userId };
    }
    return { role: principal.role };
  }

  async resolveEnrollment(
    principal: AuthenticatedPrincipal,
    enrollmentId: string,
  ): Promise<EnrollmentPolicyContext> {
    const view = await this.enrollments.findViewById(principal.organizationId, enrollmentId);
    if (view === null) throw new ApplicationError('ENROLLMENT_NOT_FOUND', 404);
    if (
      (principal.role === 'STUDENT' && view.student.userId !== principal.userId) ||
      (principal.role === 'TEACHER' && view.classSection.teacherUserId !== principal.userId)
    ) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
    return {
      enrollmentId: view.enrollment.id,
      organizationId: view.enrollment.organizationId,
      studentId: view.enrollment.studentId,
      studentUserId: view.student.userId,
      classSectionId: view.enrollment.classSectionId,
      teacherUserId: view.classSection.teacherUserId,
      status: view.enrollment.status,
    };
  }
}
