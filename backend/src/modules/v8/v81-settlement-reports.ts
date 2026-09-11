import { createHash } from 'node:crypto';
import { Injectable } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { V81CompositeRosterService } from './v81-composite-roster.js';
import { V81SettlementCheckService } from './v81-settlement-check.js';

type Preview = Awaited<ReturnType<V81CompositeRosterService['previewInTransaction']>>;
// Only the read timestamp is excluded: changes in any teacher-visible fact require a new confirmation.
export function settlementPreviewFingerprint(preview: Preview) {
  const { generatedAt: _generatedAt, ...facts } = preview;
  return createHash('sha256').update(JSON.stringify(facts)).digest('hex');
}
export type InitialSettlementInput = { expectedVersion: number; previewFingerprint: string };

@Injectable()
export class V81SettlementReportsService {
  constructor(private readonly composite: V81CompositeRosterService,
    private readonly checks: V81SettlementCheckService, private readonly clock: Clock,
    private readonly ids: IdGenerator) {}

  async appendRecordCorrectionInTransaction(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal,
    classSectionId: string, recordId: string, workflowVersion: number, reason: string, requestId: string) {
    return this.appendCorrection(tx, principal, classSectionId, recordId, workflowVersion, reason, requestId, 'RECORD_REVIEW');
  }
  async appendFinalGradeCorrectionInTransaction(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal,
    classSectionId: string, enrollmentId: string, version: number, reason: string, requestId: string) {
    return this.appendCorrection(tx, principal, classSectionId, enrollmentId, version, reason, requestId, 'FINAL_GRADE');
  }
  async appendPhysicalCorrectionInTransaction(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal,
    classSectionId: string, enrollmentId: string, version: number, reason: string, requestId: string) {
    return this.appendCorrection(tx, principal, classSectionId, enrollmentId, version, reason, requestId, 'PHYSICAL_RESULT');
  }
  async appendCertificationCorrectionInTransaction(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal,
    classSectionId: string, applicationId: string, version: number, reason: string, requestId: string) {
    return this.appendCorrection(tx, principal, classSectionId, applicationId, version, reason, requestId, 'CERTIFICATION_CREDIT');
  }
  private async appendCorrection(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal,
    classSectionId: string, resourceId: string, factVersion: number, reason: string, requestId: string,
    kind: 'RECORD_REVIEW' | 'FINAL_GRADE' | 'PHYSICAL_RESULT' | 'CERTIFICATION_CREDIT') {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const [transaction] = await tx.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`;
    if (transaction?.transaction_isolation !== 'serializable')
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
    const section = await tx.classSection.findFirst({ where: { id: classSectionId,
      organizationId: principal.organizationId, teacher: { userId: principal.userId } } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${classSectionId}::uuid FOR NO KEY UPDATE`;
    const [previous] = await tx.$queryRaw<{ id: string; version: number; confirmed_roster_id: string }[]>`
      SELECT id,version,confirmed_roster_id FROM v81_settlement_report_revisions
      WHERE class_section_id=${classSectionId}::uuid AND organization_id=${principal.organizationId}::uuid ORDER BY version DESC LIMIT 1`;
    if (!previous) {
      if (kind !== 'RECORD_REVIEW') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      return null;
    }
    const [event] = kind === 'CERTIFICATION_CREDIT' ? await tx.$queryRaw<{ id: string }[]>`
      SELECT e.id FROM v81_events e JOIN exemption_applications a ON a.id=e.resource_id AND a.organization_id=e.organization_id
      WHERE e.organization_id=${principal.organizationId}::uuid AND e.resource_type='CERTIFICATION_CREDIT'
        AND e.resource_id=${resourceId}::uuid AND e.event_type='FACT_CORRECTED' AND e.version=${factVersion}
        AND e.actor_id=${principal.userId}::uuid AND e.request_id=${requestId}
        AND e.facts->>'correctionReason'=${reason.trim()} AND a.class_section_id=${classSectionId}::uuid
        AND EXISTS(SELECT 1 FROM v81_events old WHERE old.organization_id=e.organization_id
          AND old.resource_type=e.resource_type AND old.resource_id=e.resource_id AND old.version<e.version
          AND old.event_type='APPROVED' AND old.occurred_at<=(SELECT created_at FROM v81_settlement_report_revisions
            WHERE class_section_id=${classSectionId}::uuid AND version=1))`
      : kind === 'RECORD_REVIEW' ? await tx.$queryRaw<{ id: string }[]>`SELECT e.id FROM v81_events e
      JOIN exercise_records r ON r.id=e.resource_id AND r.organization_id=e.organization_id
      WHERE e.organization_id=${principal.organizationId}::uuid AND e.resource_type='RECORD_REVIEW'
        AND e.resource_id=${resourceId}::uuid AND e.event_type='FACT_CORRECTED' AND e.version=${factVersion}
        AND e.actor_id=${principal.userId}::uuid AND e.request_id=${requestId}
        AND e.facts->>'correctionReason'=${reason.trim()} AND r.class_section_id=${classSectionId}::uuid
        AND r.created_at<=(SELECT created_at FROM v81_settlement_report_revisions
          WHERE class_section_id=${classSectionId}::uuid AND version=1)` : await tx.$queryRaw<{ id: string }[]>`
      SELECT e.id FROM v81_events e JOIN enrollments n ON n.id=e.resource_id AND n.organization_id=e.organization_id
      WHERE e.organization_id=${principal.organizationId}::uuid AND e.resource_type=${kind}
        AND e.resource_id=${resourceId}::uuid AND e.event_type='FACT_CORRECTED' AND e.version=${factVersion}
        AND e.actor_id=${principal.userId}::uuid AND e.request_id=${requestId}
        AND e.facts->>'correctionReason'=${reason.trim()} AND n.class_section_id=${classSectionId}::uuid
        AND ((${kind}='FINAL_GRADE' AND EXISTS(SELECT 1 FROM v81_final_grade_revisions g WHERE g.enrollment_id=n.id AND g.version<${factVersion}
          AND g.created_at<=(SELECT created_at FROM v81_settlement_report_revisions WHERE class_section_id=${classSectionId}::uuid AND version=1)))
        OR (${kind}='PHYSICAL_RESULT' AND EXISTS(SELECT 1 FROM v81_physical_result_revisions p WHERE p.enrollment_id=n.id AND p.version<${factVersion}
          AND p.created_at<=(SELECT created_at FROM v81_settlement_report_revisions WHERE class_section_id=${classSectionId}::uuid AND version=1))))`;
    if (!event || !reason.trim() || reason.trim().length > 1000)
      throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'EXISTING_RECORD_CORRECTION_EVENT_REQUIRED' });
    const reused = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_settlement_report_revisions
      WHERE class_section_id=${classSectionId}::uuid AND report->'correction'->>'eventId'=${event.id}`;
    if (reused.length) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
    const preview = await this.composite.previewInTransaction(tx, principal, classSectionId);
    if (preview.confirmedRosterId !== previous.confirmed_roster_id)
      throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'SETTLEMENT_ROSTER_BASIS_CHANGED' });
    const check = await this.checks.checkInTransaction(tx, principal.organizationId, classSectionId);
    const now = this.clock.now(), id = this.ids.next(), version = previous.version + 1;
    const correction = kind === 'RECORD_REVIEW'
      ? { recordId: resourceId, eventId: event.id, workflowVersion: factVersion, reason: reason.trim(), previousReportId: previous.id }
      : kind === 'FINAL_GRADE' ? { enrollmentId: resourceId, eventId: event.id, gradeVersion: factVersion, reason: reason.trim(), previousReportId: previous.id }
      : kind === 'CERTIFICATION_CREDIT' ? { applicationId: resourceId, eventId: event.id, recognitionVersion: factVersion, reason: reason.trim(), previousReportId: previous.id }
      : { enrollmentId: resourceId, eventId: event.id, physicalVersion: factVersion, reason: reason.trim(), previousReportId: previous.id };
    const report = { ...preview, generatedAt: now.toISOString(), isSettlementSnapshot: true, correction,
      settlementChecks: check.checks.filter(item => item.code !== 'CONFIRMED_COMPOSITE_ROSTER') };
    const [stored] = await tx.$queryRaw<{ report_sha256: string }[]>`INSERT INTO v81_settlement_report_revisions
      (id,organization_id,class_section_id,confirmed_roster_id,actor_id,version,kind,previous_report_id,
        correction_reason,report,created_at,request_id)
      VALUES(${id}::uuid,${principal.organizationId}::uuid,${classSectionId}::uuid,${preview.confirmedRosterId}::uuid,
        ${principal.userId}::uuid,${version},'CORRECTION',${previous.id}::uuid,${reason.trim()},${JSON.stringify(report)}::jsonb,${now},${requestId})
      RETURNING report_sha256`;
    await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,
      actor_id,request_id,version,facts,occurred_at,event_outcome)
      VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'SETTLEMENT_REPORT',${id}::uuid,'CORRECTED',
        ${principal.userId}::uuid,${requestId},${version},${JSON.stringify({ ...correction, classSectionId,
          reportSha256: stored!.report_sha256 })}::jsonb,${now},'SUCCEEDED')`;
    return { id, version, reportSha256: stored!.report_sha256 };
  }

  // The HTTP owner provides idempotency and a serializable transaction.
  async confirmInTransaction(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal,
    classSectionId: string, input: InitialSettlementInput, requestId: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    if (input.expectedVersion !== 0 || !/^[a-f0-9]{64}$/.test(input.previewFingerprint))
      throw new ApplicationError('VALIDATION_FAILED', 422);
    const [transaction] = await tx.$queryRaw<{ transaction_isolation: string }[]>`SHOW transaction_isolation`;
    if (transaction?.transaction_isolation !== 'serializable')
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, { reason: 'SETTLEMENT_REQUIRES_SERIALIZABLE_TRANSACTION' });
    await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
    const section = await tx.classSection.findFirst({ where: { id: classSectionId,
      organizationId: principal.organizationId, teacher: { userId: principal.userId } }, include: { semester: true } });
    if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
    if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
    if (section.semester.status === 'ARCHIVED')
      throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'ARCHIVED_FACT_CORRECTION_REQUIRED' });
    await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${classSectionId}::uuid FOR NO KEY UPDATE`;
    const previous = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_settlement_report_revisions
      WHERE class_section_id=${classSectionId}::uuid ORDER BY version DESC LIMIT 1`;
    if (previous.length) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
    const check = await this.checks.checkInTransaction(tx, principal.organizationId, classSectionId);
    // This command supplies the teacher confirmation; every other blocker must already be clear.
    if (check.checks.some(item => item.code !== 'CONFIRMED_COMPOSITE_ROSTER' && item.status !== 'CLEAR'))
      throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'SETTLEMENT_PENDING_ITEMS' });
    const preview = await this.composite.previewInTransaction(tx, principal, classSectionId);
    if (settlementPreviewFingerprint(preview) !== input.previewFingerprint)
      throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
    const now = this.clock.now(), id = this.ids.next();
    const report = { ...preview, generatedAt: now.toISOString(), isSettlementSnapshot: true,
      settlementChecks: check.checks.filter(item => item.code !== 'CONFIRMED_COMPOSITE_ROSTER'),
      confirmedPreviewFingerprint: input.previewFingerprint };
    const [stored] = await tx.$queryRaw<{ report_sha256: string }[]>`
      INSERT INTO v81_settlement_report_revisions(id,organization_id,class_section_id,confirmed_roster_id,
        actor_id,version,kind,report,created_at,request_id)
      VALUES(${id}::uuid,${principal.organizationId}::uuid,${classSectionId}::uuid,${preview.confirmedRosterId}::uuid,
        ${principal.userId}::uuid,1,'INITIAL',${JSON.stringify(report)}::jsonb,${now},${requestId})
      RETURNING report_sha256`;
    await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,
      actor_id,request_id,version,facts,occurred_at,event_outcome)
      VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'SETTLEMENT_REPORT',${id}::uuid,'CONFIRMED',
        ${principal.userId}::uuid,${requestId},1,${JSON.stringify({ classSectionId, confirmedRosterId: preview.confirmedRosterId,
          previewFingerprint: input.previewFingerprint, reportSha256: stored!.report_sha256 })}::jsonb,${now},'SUCCEEDED')`;
    return { id, classSectionId, version: 1, kind: 'INITIAL' as const, reportSha256: stored!.report_sha256,
      createdAt: now.toISOString(), report };
  }
}
