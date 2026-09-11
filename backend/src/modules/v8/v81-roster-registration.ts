import { Controller, Get, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { projectRosterRegistration } from './domain/roster-registration.js';
import { Clock } from '../../common/time/clock.js';

@Injectable()
export class V81RosterRegistrationService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}
  async own(principal: AuthenticatedPrincipal, enrollmentId: string) {
    if (principal.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.prisma.$transaction(async tx => {
      const enrollment = await tx.enrollment.findFirst({ where: { id: enrollmentId, organizationId: principal.organizationId,
        student: { userId: principal.userId } }, include: { student: { select: { studentNumber: true } } } });
      if (!enrollment) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const sources = await tx.$queryRaw<{ id: string; version: number; rows: { id: string; studentNumber: string | null; fullName: string | null }[] }[]>`
        SELECT c.id,c.version,c.source_rows AS rows FROM v81_current_confirmed_rosters c
        WHERE c.class_section_id=${enrollment.classSectionId}::uuid AND c.organization_id=${principal.organizationId}::uuid`;
      const base = { enrollmentId, classSectionId: enrollment.classSectionId, generatedAt: this.clock.now().toISOString() };
      const source = sources[0];
      if (!source) return { ...base, available: false, rosterVersion: null, status: null, registrationComplete: false };
      const members = await tx.enrollment.findMany({ where: { classSectionId: enrollment.classSectionId,
        organizationId: principal.organizationId }, include: { student: { select: {
          studentNumber: true, fullName: true, user: { select: { emailVerifiedAt: true } } } } } });
      const projected = projectRosterRegistration(source.rows.map(row => ({ id: row.id,
        studentNumber: row.studentNumber ?? '', fullName: row.fullName ?? '' })), members.map(member => ({
        enrollmentId: member.id, studentId: member.studentId, studentNumber: member.student.studentNumber,
        fullName: member.student.fullName, emailVerified: member.student.user.emailVerifiedAt !== null,
        enrolledInSection: member.status === 'ACTIVE' })));
      const key = (value: string) => value.trim().normalize('NFC').toUpperCase();
      const ownRow = projected.rows.find(row => key(row.studentNumber) === key(enrollment.student.studentNumber));
      const status = ownRow?.status ?? (enrollment.status === 'ACTIVE' ? 'EXTRA_IN_PLATFORM' : 'PENDING_REGISTRATION');
      return { ...base, available: true, rosterVersion: source.version, status, registrationComplete: status === 'MATCHED' };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async preview(principal: AuthenticatedPrincipal, importId: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.prisma.$transaction(async tx => {
      const source = await tx.officialRosterImport.findFirst({ where: { id: importId,
        organizationId: principal.organizationId, classSection: { teacher: { userId: principal.userId } } },
        include: { entries: { orderBy: { sourceRowNumber: 'asc' } } } });
      if (!source) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (source.status !== 'VALIDATED') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      if (source.entries.length > 500) throw new ApplicationError('VALIDATION_FAILED', 422);
      const members = await tx.enrollment.findMany({ where: { organizationId: principal.organizationId,
        classSectionId: source.classSectionId, status: 'ACTIVE', student: { deletedAt: null,
          user: { deletedAt: null, status: 'ACTIVE' } } }, include: { student: { select: {
            studentNumber: true, fullName: true, user: { select: { emailVerifiedAt: true } } } } }, orderBy: { id: 'asc' } });
      const result = projectRosterRegistration(source.entries.map(row => ({ id: row.id,
        studentNumber: row.normalizedStudentNumber ?? '', fullName: row.fullName ?? '' })), members.map(row => ({
        enrollmentId: row.id, studentId: row.studentId, studentNumber: row.student.studentNumber,
        fullName: row.student.fullName, enrolledInSection: true, emailVerified: row.student.user.emailVerifiedAt !== null })));
      return { classSectionId: source.classSectionId, rosterImportId: source.id, sourceVersion: source.version,
        generatedAt: this.clock.now().toISOString(), ...result };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
@Controller('enrollments/:enrollmentId/roster-status')
export class V81StudentRosterController {
  constructor(private readonly service: V81RosterRegistrationService) {}
  @Get() @OperationPolicy('getV81OwnRosterStatus')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('enrollmentId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) {
    return this.service.own(principal, id);
  }
}
@Controller('roster-imports/:rosterImportId/registration-preview')
export class V81RosterRegistrationController {
  constructor(private readonly service: V81RosterRegistrationService) {}
  @Get() @OperationPolicy('previewV81RosterRegistration')
  preview(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('rosterImportId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) {
    return this.service.preview(principal, id);
  }
}
