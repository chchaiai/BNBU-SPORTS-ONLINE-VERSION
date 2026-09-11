import { Controller, Get, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { Clock } from '../../common/time/clock.js';
import { projectRosterRegistration } from './domain/roster-registration.js';
import type { Prisma } from '../../generated/prisma/client.js';

@Injectable()
export class V81SettlementCheckService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}
  async check(principal: AuthenticatedPrincipal, classSectionId: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.prisma.$transaction(async (tx) => {
      const section = await tx.classSection.findFirst({ where: { id: classSectionId,
        organizationId: principal.organizationId, teacher: { userId: principal.userId } } });
      if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      return this.checkInTransaction(tx, principal.organizationId, classSectionId);
    }, { isolationLevel: 'RepeatableRead' });
  }
  // Caller must establish organization/resource access before entering this shared reader.
  async checkInTransaction(tx: Prisma.TransactionClient, organizationId: string, classSectionId: string) {
      const checkedAt = this.clock.now();
      const counts = await tx.$queryRaw<{ code: string; count: bigint }[]>`
        SELECT 'ACTIVE_SESSION' AS code,count(*) AS count FROM exercise_sessions
          WHERE class_section_id=${classSectionId}::uuid AND status IN ('IN_PROGRESS','PAUSED')
        UNION ALL SELECT 'UNSUBMITTED_RECORD',
          (SELECT count(*) FROM exercise_records WHERE class_section_id=${classSectionId}::uuid AND status='DRAFT') +
          (SELECT count(*) FROM exercise_sessions s WHERE s.class_section_id=${classSectionId}::uuid AND s.status='COMPLETED'
            AND NOT EXISTS(SELECT 1 FROM exercise_records r WHERE r.session_id=s.id))
        UNION ALL SELECT 'PENDING_REVIEW',count(*) FROM v81_record_workflows w JOIN exercise_records r ON r.id=w.record_id
          WHERE r.class_section_id=${classSectionId}::uuid AND w.stage IN ('PENDING_AI','PENDING_TEACHER')
        UNION ALL SELECT 'SUPPLEMENT_PENDING',count(*) FROM v81_record_workflows w JOIN exercise_records r ON r.id=w.record_id
          WHERE r.class_section_id=${classSectionId}::uuid AND w.stage='AWAITING_SUPPLEMENT'
        UNION ALL SELECT 'TECHNICAL_REVIEW',count(*) FROM v81_record_workflows w JOIN exercise_records r ON r.id=w.record_id
          WHERE r.class_section_id=${classSectionId}::uuid AND w.stage='TECHNICAL'
        UNION ALL SELECT 'MATERIAL_PROCESSING',count(*) FROM media_evidence m JOIN exercise_sessions s ON s.id=m.session_id
          WHERE s.class_section_id=${classSectionId}::uuid AND m.upload_status IN ('PENDING_UPLOAD','UPLOADED','BOUND','PROCESSING')
        UNION ALL SELECT 'OPEN_PLATFORM_INTERRUPTION',count(*) FROM v81_interruptions
          WHERE organization_id=${organizationId}::uuid AND (class_section_id IS NULL OR class_section_id=${classSectionId}::uuid) AND ended_at IS NULL
        UNION ALL SELECT 'PENDING_APPLICATION',count(*) FROM exemption_applications
          WHERE class_section_id=${classSectionId}::uuid AND status IN ('SUBMITTED','SUPPLEMENT_REQUIRED')
        UNION ALL SELECT 'ROSTER_PROCESSING',count(*) FROM official_roster_imports
          WHERE class_section_id=${classSectionId}::uuid AND status IN ('RECEIVED','VALIDATING')
        UNION ALL SELECT 'ROSTER_ALIGNMENT_RUNNING',count(*) FROM roster_alignment_runs
          WHERE class_section_id=${classSectionId}::uuid AND status='RUNNING'
        UNION ALL SELECT 'PHYSICAL_IMPORT_PENDING',coalesce(sum(jsonb_array_length(b.source_rows)-
          (SELECT count(*) FROM v81_physical_import_confirmations c WHERE c.batch_id=b.id)),0)::bigint
          FROM v81_physical_import_batches b WHERE b.class_section_id=${classSectionId}::uuid
            AND b.organization_id=${organizationId}::uuid
        UNION ALL SELECT 'ROSTER_PENDING_DIFFERENCE',count(*) FROM roster_alignment_results r
          JOIN roster_alignment_runs a ON a.id=r.alignment_run_id
          WHERE r.class_section_id=${classSectionId}::uuid AND a.is_current=true AND r.resolution_status='PENDING' AND r.status<>'MATCHED'
            AND a.roster_import_id=(SELECT roster_import_id FROM v81_roster_basis_history WHERE class_section_id=${classSectionId}::uuid ORDER BY version DESC LIMIT 1)
        UNION ALL SELECT 'OCR_DRAFTS',count(*) FROM v81_ocr_batches b
          WHERE b.class_section_id=${classSectionId}::uuid AND b.organization_id=${organizationId}::uuid AND (
            EXISTS(SELECT 1 FROM v81_ocr_jobs j WHERE j.batch_id=b.id AND j.status IN ('QUEUED','RUNNING'))
            OR (b.purpose='ROSTER' AND NOT EXISTS(SELECT 1 FROM v81_confirmed_rosters c WHERE c.ocr_batch_id=b.id))
            OR (b.purpose='PHYSICAL' AND (
              NOT EXISTS(SELECT 1 FROM v81_ocr_draft_revisions d WHERE d.batch_id=b.id)
              OR (SELECT jsonb_array_length(d.draft_rows) FROM v81_ocr_draft_revisions d WHERE d.batch_id=b.id ORDER BY d.version DESC LIMIT 1)
                >(SELECT count(*) FROM v81_ocr_physical_confirmations p WHERE p.batch_id=b.id))))`;
      const checks: { code: string; status: 'CLEAR' | 'BLOCKED' | 'UNAVAILABLE'; count: number | null }[] = counts.map((row) => {
        const count = Number(row.count);
        if (!Number.isSafeInteger(count)) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
        return { code: row.code, status: count > 0 ? 'BLOCKED' : 'CLEAR', count };
      });
      const basis = (await tx.$queryRaw<{ roster_import_id: string | null; ocr_batch_id: string | null }[]>`
        SELECT roster_import_id,ocr_batch_id FROM v81_roster_basis_history WHERE class_section_id=${classSectionId}::uuid ORDER BY version DESC LIMIT 1`)[0];
      const confirmedRoster = await tx.$queryRaw<{ id: string; source_rows: { id: string; studentNumber: string; fullName: string }[] }[]>`
        SELECT id,source_rows FROM v81_current_confirmed_rosters WHERE class_section_id=${classSectionId}::uuid AND organization_id=${organizationId}::uuid`;
      const currentRoster = basis?.ocr_batch_id ? confirmedRoster[0] : basis?.roster_import_id
        ? await tx.officialRosterImport.findFirst({ where: { id: basis.roster_import_id, classSectionId, isCurrent: true, status: 'VALIDATED' }, select: { id: true } }) : null;
      checks.push({ code: 'CURRENT_ROSTER', status: currentRoster ? 'CLEAR' : 'BLOCKED', count: currentRoster ? 0 : 1 });
      checks.push({ code: 'CONFIRMED_OFFICIAL_ROSTER', status: confirmedRoster.length ? 'CLEAR' : 'BLOCKED',
        count: confirmedRoster.length ? 0 : 1 });
      if (confirmedRoster[0]) {
        const members = await tx.enrollment.findMany({ where: { classSectionId, organizationId },
          include: { student: { include: { user: { select: { emailVerifiedAt: true } } } } } });
        const registration = projectRosterRegistration(confirmedRoster[0].source_rows, members.map(e => ({ enrollmentId: e.id,
          studentId: e.studentId, studentNumber: e.student.studentNumber, fullName: e.student.fullName,
          emailVerified: e.student.user.emailVerifiedAt !== null, enrolledInSection: e.status === 'ACTIVE' })));
        const ambiguous = registration.rows.filter(row => row.status === 'IDENTITY_CONFLICT').length;
        checks.push({ code: 'ROSTER_IDENTITY_AMBIGUITY', status: ambiguous > 0 ? 'BLOCKED' : 'CLEAR', count: ambiguous });
        const unregistered = registration.rows.filter(row => row.status === 'PENDING_REGISTRATION').length;
        // Business decision pending: absence is observable, but its settlement policy is not yet confirmed.
        checks.push({ code: 'ROSTER_REGISTRATION_INCOMPLETE', status: unregistered > 0 ? 'UNAVAILABLE' : 'CLEAR', count: unregistered });
        const enrollmentIds = [...new Set([...registration.rows, ...registration.extras]
          .flatMap(row => row.enrollmentId ? [row.enrollmentId] : []))];
        const missing = enrollmentIds.length ? (await tx.$queryRaw<{ count: bigint }[]>`
          SELECT count(*) AS count FROM enrollments e
          WHERE e.id=ANY(${enrollmentIds}::uuid[]) AND e.organization_id=${organizationId}::uuid
            AND e.class_section_id=${classSectionId}::uuid
            AND NOT EXISTS(SELECT 1 FROM v81_physical_result_revisions p WHERE p.enrollment_id=e.id AND p.organization_id=e.organization_id)
            AND NOT EXISTS(SELECT 1 FROM exemption_applications a WHERE a.enrollment_id=e.id AND a.organization_id=e.organization_id
              AND a.application_type='PHYSICAL_TEST' AND a.status='APPROVED')`)[0]!.count : 0n;
        const missingCount = Number(missing);
        if (!Number.isSafeInteger(missingCount)) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
        checks.push({ code: 'RAW_PHYSICAL_RESULTS', status: ambiguous || unregistered || missingCount ? 'UNAVAILABLE' : 'CLEAR',
          count: ambiguous || unregistered ? null : missingCount });
      } else {
        checks.push({ code: 'ROSTER_IDENTITY_AMBIGUITY', status: 'UNAVAILABLE', count: null },
          { code: 'ROSTER_REGISTRATION_INCOMPLETE', status: 'UNAVAILABLE', count: null },
          { code: 'RAW_PHYSICAL_RESULTS', status: 'UNAVAILABLE', count: null });
      }
      const rule = (await tx.$queryRaw<{ closing_deadline: Date; settlement_planned_at: Date }[]>`
        SELECT closing_deadline,settlement_planned_at FROM v81_course_rules
        WHERE class_section_id=${classSectionId}::uuid AND organization_id=${organizationId}::uuid AND published_at IS NOT NULL`)[0];
      checks.push({ code: 'PUBLISHED_COURSE_RULE', status: rule ? 'CLEAR' : 'BLOCKED', count: rule ? 0 : 1 });
      const due = rule && checkedAt >= rule.closing_deadline && checkedAt >= rule.settlement_planned_at;
      checks.push({ code: 'SETTLEMENT_SCHEDULE', status: due ? 'CLEAR' : 'BLOCKED', count: due ? 0 : 1 });
      const reports = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_settlement_report_revisions
        WHERE class_section_id=${classSectionId}::uuid AND organization_id=${organizationId}::uuid LIMIT 1`;
      checks.push({ code: 'CONFIRMED_COMPOSITE_ROSTER', status: reports.length ? 'CLEAR' : 'BLOCKED', count: reports.length ? 0 : 1 });
      return { classSectionId, checkedAt: checkedAt.toISOString(),
        ready: checks.every((item) => item.status === 'CLEAR'), checks };
  }
}
const uuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('class-sections/:classSectionId/settlement-check')
export class V81SettlementCheckController {
  constructor(private readonly service: V81SettlementCheckService) {}
  @Get() @OperationPolicy('getV81SettlementCheck')
  check(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('classSectionId', uuid) id: string) {
    return this.service.check(principal, id);
  }
}
