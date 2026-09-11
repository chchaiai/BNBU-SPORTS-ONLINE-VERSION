import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import {
  ExerciseSessionPolicyResolver,
  type ExerciseSessionPolicyContext,
  type PrincipalStudentPolicyContext,
} from '../../../common/policy/exercise-session-policy-resolver.js';
import { PrismaService } from '../../../common/database/prisma.service.js';

@Injectable()
export class PrismaExerciseSessionPolicyResolver extends ExerciseSessionPolicyResolver {
  constructor(private readonly prisma: PrismaService) {
    super();
  }

  async resolvePrincipalStudent(
    principal: AuthenticatedPrincipal,
  ): Promise<PrincipalStudentPolicyContext> {
    const student = await this.prisma.studentProfile.findFirst({
      where: {
        organizationId: principal.organizationId,
        userId: principal.userId,
        status: 'ACTIVE',
        deletedAt: null,
      },
      select: { id: true, organizationId: true, userId: true },
    });
    if (student === null) throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return {
      organizationId: student.organizationId,
      studentId: student.id,
      studentUserId: student.userId,
    };
  }

  async resolveSession(
    principal: AuthenticatedPrincipal,
    sessionId: string,
  ): Promise<ExerciseSessionPolicyContext> {
    const session = await this.prisma.exerciseSession.findFirst({
      where: { id: sessionId, organizationId: principal.organizationId },
      include: { student: { select: { userId: true } } },
    });
    if (session?.student.userId !== principal.userId) {
      throw new ApplicationError('SESSION_NOT_FOUND', 404);
    }
    return {
      sessionId: session.id,
      organizationId: session.organizationId,
      studentId: session.studentId,
      studentUserId: session.student.userId,
      enrollmentId: session.enrollmentId,
      classSectionId: session.classSectionId,
      status: session.status,
    };
  }
}
