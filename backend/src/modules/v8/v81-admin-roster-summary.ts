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
export class V81AdminRosterSummaryService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}
  async get(principal: AuthenticatedPrincipal, classSectionId: string) {
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx, principal, 'COURSE_VIEW');
      if (!await tx.classSection.findFirst({ where: { id: classSectionId, organizationId: principal.organizationId }, select: { id: true } }))
        throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const sources = await tx.$queryRaw<{ version: number; rows: { id: string; studentNumber: string | null; fullName: string | null }[] }[]>`
        SELECT c.version,c.source_rows AS rows FROM v81_current_confirmed_rosters c
        WHERE c.class_section_id=${classSectionId}::uuid AND c.organization_id=${principal.organizationId}::uuid`;
      const base = { classSectionId, generatedAt: this.clock.now().toISOString() };
      const source = sources[0];
      if (!source) return { ...base, available: false, rosterVersion: null, denominator: null,
        denominatorConfirmed: false, matchedCount: null, pendingRegistrationCount: null, identityConflictCount: null,
        extraCount: null, registrationComplete: false };
      const members = await tx.enrollment.findMany({ where: { classSectionId, organizationId: principal.organizationId },
        include: { student: { select: { studentNumber: true, fullName: true, user: { select: { emailVerifiedAt: true } } } } } });
      const result = projectRosterRegistration(source.rows.map(row => ({ id: row.id, studentNumber: row.studentNumber ?? '',
        fullName: row.fullName ?? '' })), members.map(row => ({ studentId: row.studentId, enrollmentId: row.id,
        studentNumber: row.student.studentNumber, fullName: row.student.fullName,
        emailVerified: row.student.user.emailVerifiedAt !== null, enrolledInSection: row.status === 'ACTIVE' })));
      return { ...base, available: true, rosterVersion: source.version, denominator: result.denominator,
        denominatorConfirmed: result.denominatorConfirmed, matchedCount: result.matchedCount,
        pendingRegistrationCount: result.rows.filter(row => row.status === 'PENDING_REGISTRATION').length,
        identityConflictCount: result.rows.filter(row => row.status === 'IDENTITY_CONFLICT').length,
        extraCount: result.extras.length, registrationComplete: result.registrationComplete };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
@Controller('admin/class-sections/:classSectionId/roster-summary')
export class V81AdminRosterSummaryController {
  constructor(private readonly service: V81AdminRosterSummaryService) {}
  @Get() @OperationPolicy('getV81AdminRosterSummary')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('classSectionId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) {
    return this.service.get(principal, id);
  }
}
