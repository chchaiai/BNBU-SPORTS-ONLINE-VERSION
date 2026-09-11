import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import {
  ExerciseRecordPolicyResolver,
  type ExerciseRecordCollectionScope,
  type ExerciseRecordPolicyContext,
} from '../../../common/policy/exercise-record-policy-resolver.js';

@Injectable()
export class PrismaExerciseRecordPolicyResolver extends ExerciseRecordPolicyResolver {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolveCollection(
    principal: AuthenticatedPrincipal,
  ): Promise<ExerciseRecordCollectionScope> {
    if (principal.role === 'STUDENT') {
      const student = await this.prisma.studentProfile.findFirst({
        where: {
          organizationId: principal.organizationId,
          userId: principal.userId,
          status: 'ACTIVE',
          deletedAt: null,
        },
        select: { id: true },
      });
      if (student === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      return {
        organizationId: principal.organizationId,
        role: principal.role,
        studentId: student.id,
      };
    }
    return {
      organizationId: principal.organizationId,
      role: principal.role,
      ...(principal.role === 'TEACHER' ? { teacherUserId: principal.userId } : {}),
    };
  }

  async resolveRecord(
    principal: AuthenticatedPrincipal,
    recordId: string,
  ): Promise<ExerciseRecordPolicyContext> {
    const record = (await this.prisma.$queryRaw<{ id: string; organizationId: string; studentId: string; studentUserId: string;
      enrollmentId: string; classSectionId: string; teacherUserId: string; status: string; version: number }[]>`
      SELECT r.id,r.organization_id AS "organizationId",r.student_id AS "studentId",s.user_id AS "studentUserId",
        r.enrollment_id AS "enrollmentId",r.class_section_id AS "classSectionId",t.user_id AS "teacherUserId",r.status,r.version
      FROM exercise_records r JOIN v81_student_subjects s ON s.id=r.student_id AND s.organization_id=r.organization_id
      JOIN class_sections c ON c.id=r.class_section_id AND c.organization_id=r.organization_id
      JOIN v81_teacher_subjects t ON t.id=c.teacher_id AND t.organization_id=c.organization_id
      WHERE r.id=${recordId}::uuid AND r.organization_id=${principal.organizationId}::uuid`)[0];
    if (!record) throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
    const authorized =
      (principal.role === 'STUDENT' && record.studentUserId === principal.userId) ||
      (principal.role === 'TEACHER' && record.teacherUserId === principal.userId) ||
      principal.role === 'ADMIN';
    if (!authorized) throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
    return {
      recordId: record.id,
      organizationId: record.organizationId,
      studentId: record.studentId,
      studentUserId: record.studentUserId,
      enrollmentId: record.enrollmentId,
      classSectionId: record.classSectionId,
      teacherUserId: record.teacherUserId,
      status: record.status,
      version: record.version,
    };
  }
}
