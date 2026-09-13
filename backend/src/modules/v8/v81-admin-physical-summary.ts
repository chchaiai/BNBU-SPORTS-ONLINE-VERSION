import { isCourseClosureHistoricalMember } from '../enrollments/application/course-closure-memberships.js';
import { Controller, Get, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { Clock } from '../../common/time/clock.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { projectRosterRegistration } from './domain/roster-registration.js';

@Injectable()
export class V81AdminPhysicalSummaryService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}
  async get(principal: AuthenticatedPrincipal, classSectionId: string) {
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx, principal, 'COURSE_VIEW');
      const section = await tx.classSection.findFirst({ where: { id: classSectionId, organizationId: principal.organizationId }, select: { id: true, status: true, closedAt: true } });
      if (!section)
        throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const sources = await tx.$queryRaw<{ version: number; rows: { id: string; studentNumber: string | null; fullName: string | null }[] }[]>`
        SELECT c.version,c.source_rows AS rows FROM v81_current_confirmed_rosters c
        WHERE c.class_section_id=${classSectionId}::uuid AND c.organization_id=${principal.organizationId}::uuid`;
      const base = { classSectionId, generatedAt: this.clock.now().toISOString() };
      const source = sources[0];
      if (!source) return { ...base, available: false, rosterVersion: null, sourceRowCount: null,
        recordedCount: null, exemptCount: null, notRecordedCount: null, unresolvedRegistrationCount: null };
      const members = await tx.enrollment.findMany({ where: { classSectionId, organizationId: principal.organizationId },
        include: { student: { select: { studentNumber: true, fullName: true, user: { select: { emailVerifiedAt: true } } } } } });
      const registration = projectRosterRegistration(source.rows.map(row => ({ id: row.id, studentNumber: row.studentNumber ?? '',
        fullName: row.fullName ?? '' })), members.map(row => ({ studentId: row.studentId, enrollmentId: row.id,
        studentNumber: row.student.studentNumber, fullName: row.student.fullName,
        emailVerified: row.student.user.emailVerifiedAt !== null, enrolledInSection: row.status === 'ACTIVE' || isCourseClosureHistoricalMember(row, section) })));
      const recorded = await tx.$queryRaw<{ enrollmentId: string }[]>`
        SELECT DISTINCT p.enrollment_id AS "enrollmentId" FROM v81_physical_result_revisions p
        JOIN enrollments e ON e.id=p.enrollment_id WHERE e.class_section_id=${classSectionId}::uuid
          AND p.organization_id=${principal.organizationId}::uuid`;
      const exemptions = await tx.exemptionApplication.findMany({ where: { classSectionId, organizationId: principal.organizationId,
        applicationType: 'PHYSICAL_TEST', status: 'APPROVED' }, select: { enrollmentId: true } });
      const recordedIds = new Set(recorded.map(row => row.enrollmentId));
      const exemptIds = new Set(exemptions.map(row => row.enrollmentId));
      let recordedCount = 0, exemptCount = 0, notRecordedCount = 0, unresolvedRegistrationCount = 0;
      for (const row of registration.rows) {
        if (row.status !== 'MATCHED' || !row.enrollmentId) unresolvedRegistrationCount++;
        else if (exemptIds.has(row.enrollmentId)) exemptCount++;
        else if (recordedIds.has(row.enrollmentId)) recordedCount++;
        else notRecordedCount++;
      }
      return { ...base, available: true, rosterVersion: source.version, sourceRowCount: source.rows.length,
        recordedCount, exemptCount, notRecordedCount, unresolvedRegistrationCount };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
@Controller('admin/class-sections/:classSectionId/physical-summary')
export class V81AdminPhysicalSummaryController {
  constructor(private readonly service: V81AdminPhysicalSummaryService) {}
  @Get() @OperationPolicy('getV81AdminPhysicalSummary')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('classSectionId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) {
    return this.service.get(principal, id);
  }
}
