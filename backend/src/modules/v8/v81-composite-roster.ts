import { Controller, Get, Injectable, Param, ParseUUIDPipe } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { Clock } from '../../common/time/clock.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { projectRosterRegistration } from './domain/roster-registration.js';
import { categoryProgress, exerciseAccounting } from './domain/progress-accounting.js';
import type { Prisma } from '../../generated/prisma/client.js';
type SourceRow = { id: string; studentNumber: string | null; fullName: string | null };
type RecordFact = { enrollmentId: string; actualSeconds: bigint; creditedMinutes: number; stage: string | null; creditType: string };
@Injectable()
export class V81CompositeRosterService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}
  async export(principal: AuthenticatedPrincipal, classSectionId: string) {
    const report = await this.preview(principal, classSectionId);
    return this.exportSnapshot(report);
  }
  async exportSnapshot(report: Awaited<ReturnType<V81CompositeRosterService['preview']>>,
    saved?: { id: string; version: number; reportSha256: string; correctionReason: string | null;
      checks: { code: string; status: string; count: number | null }[] | undefined }) {
    const { utils, write } = await import('xlsx');
    const workbook = utils.book_new();
    utils.book_append_sheet(workbook, utils.aoa_to_sheet([
      ['报告性质', saved ? '已保存的结算快照' : '实时预览（未结算）'], ['生成时间', report.generatedAt], ['课程标识', report.classSectionId],
      ['确认名单标识', report.confirmedRosterId], ['来源类型', report.sourceKind], ['来源名单标识', report.rosterImportId ?? report.ocrBatchId],
      ['名单版本', report.rosterVersion], ['规则版本', report.ruleVersion],
      ['名单人数分母', report.denominator], ['分母已确认', report.denominatorConfirmed ? '是' : '否'],
      ['注册核对完成', report.registrationComplete ? '是' : '否'],
      ['待办计数范围', '运动记录待判定及申请待处理；完整结算阻塞另查结算检查'],
      ['时长单位', '秒；保留原始值，不以显示百分比判断完成'],
      ...(saved ? [['报告标识', saved.id], ['报告版本', saved.version], ['报告摘要 SHA-256', saved.reportSha256],
        ['摘要计算对象', '数据库保存的规范 JSON'], ['更正原因', saved.correctionReason ?? '初版']] : []),
    ]), '说明');
    const labels: Record<string, string> = { MATCHED: '已完成注册入班', PENDING_REGISTRATION: '待完成注册或入班',
      IDENTITY_CONFLICT: '身份冲突待核对', EXTRA_IN_PLATFORM: '名单外已入班', EXEMPT: '已免测', RECORDED: '已录入', NOT_RECORDED: '未录入' };
    const header = ['学号', '姓名', '注册核对状态', '体测状态', '体测项目', '原始用时（秒）', '测试日期', '体测版本',
      '实际运动（秒）', '审核无效实际（秒）', '有效未计入（秒）', '实际计入（秒）', '待判定实际（秒）',
      '课程相关目标（秒）', '课程相关运动计入（秒）', '课程相关认可（秒）',
      '通用运动目标（秒）', '通用运动计入（秒）', '通用认可（秒）', '剩余目标（秒）', '运动目标达成', '记录及申请待办数',
      '内部最新成绩', '内部最新版本', '内部已发布成绩', '内部已发布版本'];
    const sheet = (rows: typeof report.rows) => utils.aoa_to_sheet([header, ...rows.map(row => {
      const p = row.progress, physical = row.physical, result = physical?.result;
      return [row.studentNumber, row.fullName, labels[row.status], physical ? labels[physical.status] : null,
        result?.runType ?? null, result?.elapsedSeconds ?? null, result?.testedOn ?? null, result?.version ?? null,
        p?.actualSeconds ?? null, p?.invalidActualSeconds ?? null, p?.validUncreditedSeconds ?? null,
        p?.creditedSeconds ?? null, p?.pendingActualSeconds ?? null,
        p?.course.targetSeconds ?? null, p?.course.validExerciseSeconds ?? null, p?.course.recognizedSeconds ?? null,
        p?.general.targetSeconds ?? null, p?.general.validExerciseSeconds ?? null, p?.general.recognizedSeconds ?? null,
        p?.remainingSeconds ?? null, p ? (p.targetReached ? '是' : '否') : null, row.pendingCount,
        row.finalGrade?.latestRevision?.finalGrade ?? null, row.finalGrade?.latestRevision?.version ?? null,
        row.finalGrade?.publishedRevision?.finalGrade ?? null, row.finalGrade?.publishedRevision?.version ?? null];
    })]);
    utils.book_append_sheet(workbook, sheet(report.rows), '名单内');
    utils.book_append_sheet(workbook, sheet(report.extras), '名单外');
    if (saved) utils.book_append_sheet(workbook, utils.aoa_to_sheet(saved.checks ? [
      ['检查项', '保存时状态', '数量'], ...saved.checks.map(check => [check.code,
        ({ CLEAR: '通过', BLOCKED: '待处理', UNAVAILABLE: '尚不可判定' } as Record<string, string>)[check.status], check.count ?? '未知']),
    ] : [['说明', '该历史版本未保存检查快照']]), '结算检查');
    const bytes = write(workbook, { type: 'buffer', bookType: 'xlsx', compression: true }) as Buffer;
    return { fileName: saved ? `settlement-report-${report.classSectionId}-v${saved.version}.xlsx`
      : `composite-roster-preview-${report.classSectionId}.xlsx`,
      contentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      fileBase64: bytes.toString('base64'), generatedAt: report.generatedAt };
  }
  async preview(principal: AuthenticatedPrincipal, classSectionId: string) {
    return this.prisma.$transaction(tx => this.previewInTransaction(tx, principal, classSectionId),
      { isolationLevel: 'RepeatableRead' });
  }
  async previewInTransaction(tx: Prisma.TransactionClient, principal: AuthenticatedPrincipal, classSectionId: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
      const section = await tx.classSection.findFirst({ where: { id: classSectionId, organizationId: principal.organizationId,
        teacher: { userId: principal.userId } } });
      if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      const sources = await tx.$queryRaw<{ id: string; importId: string | null; ocrBatchId: string | null; version: number; sourceRows: SourceRow[] }[]>`
        SELECT c.id,c.roster_import_id AS "importId",c.ocr_batch_id AS "ocrBatchId",c.version,c.source_rows AS "sourceRows" FROM v81_current_confirmed_rosters c
        WHERE c.class_section_id=${classSectionId}::uuid AND c.organization_id=${principal.organizationId}::uuid`;
      const source = sources[0];
      if (!source) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'CONFIRMED_ROSTER_REQUIRED' });
      const rules = await tx.$queryRaw<{ course: number; general: number; version: number }[]>`
        SELECT course_target AS course,general_target AS general,version FROM v81_course_rules
        WHERE class_section_id=${classSectionId}::uuid AND organization_id=${principal.organizationId}::uuid AND published_at IS NOT NULL`;
      const rule = rules[0];
      if (!rule) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, { reason: 'PUBLISHED_RULE_REQUIRED' });
      const members = await tx.enrollment.findMany({ where: { classSectionId, organizationId: principal.organizationId },
        include: { student: { select: { studentNumber: true, fullName: true, user: { select: { emailVerifiedAt: true } } } } }, orderBy: { id: 'asc' } });
      const registration = projectRosterRegistration(source.sourceRows.map(row => ({ id: row.id, studentNumber: row.studentNumber ?? '',
        fullName: row.fullName ?? '' })), members.map(row => ({ studentId: row.studentId, enrollmentId: row.id,
        studentNumber: row.student.studentNumber, fullName: row.student.fullName, emailVerified: row.student.user.emailVerifiedAt !== null,
        enrolledInSection: row.status === 'ACTIVE' })));
      const records = await tx.$queryRaw<RecordFact[]>`SELECT r.enrollment_id AS "enrollmentId",r.actual_duration_seconds AS "actualSeconds",
        coalesce(p.credited_minutes,0) AS "creditedMinutes",w.stage,r.credit_type AS "creditType"
        FROM exercise_records r LEFT JOIN v81_record_workflows w ON w.record_id=r.id
        LEFT JOIN v81_credit_projections p ON p.record_id=r.id
        WHERE r.class_section_id=${classSectionId}::uuid AND r.organization_id=${principal.organizationId}::uuid`;
      const recognition = await tx.$queryRaw<{ enrollmentId: string; course: bigint; general: bigint }[]>`
        SELECT c.enrollment_id AS "enrollmentId",sum(c.course_minutes)::bigint AS course,sum(c.general_minutes)::bigint AS general
        FROM v81_certification_credits c JOIN enrollments e ON e.id=c.enrollment_id
        WHERE e.class_section_id=${classSectionId}::uuid AND c.organization_id=${principal.organizationId}::uuid AND c.active
        GROUP BY c.enrollment_id`;
      const physical = await tx.$queryRaw<{ enrollmentId: string; version: number; runType: string; elapsedSeconds: bigint; testedOn: Date }[]>`
        SELECT DISTINCT ON(p.enrollment_id) p.enrollment_id AS "enrollmentId",p.version,p.run_type AS "runType",
          p.elapsed_seconds AS "elapsedSeconds",p.tested_on AS "testedOn" FROM v81_physical_result_revisions p
        JOIN enrollments e ON e.id=p.enrollment_id WHERE e.class_section_id=${classSectionId}::uuid
          AND p.organization_id=${principal.organizationId}::uuid ORDER BY p.enrollment_id,p.version DESC`;
      const applications = await tx.exemptionApplication.findMany({ where: { classSectionId, organizationId: principal.organizationId },
        select: { enrollmentId: true, status: true, applicationType: true } });
      const gradeRows = await tx.$queryRaw<{ enrollment_id: string; version: number; final_grade: number; published: boolean; created_at: Date; kind: string }[]>`
        (SELECT DISTINCT ON(g.enrollment_id) g.enrollment_id,g.version,g.final_grade,g.published,g.created_at,'LATEST' AS kind
          FROM v81_final_grade_revisions g JOIN enrollments e ON e.id=g.enrollment_id
          WHERE e.class_section_id=${classSectionId}::uuid AND g.organization_id=${principal.organizationId}::uuid ORDER BY g.enrollment_id,g.version DESC)
        UNION ALL
        (SELECT DISTINCT ON(g.enrollment_id) g.enrollment_id,g.version,g.final_grade,g.published,g.created_at,'PUBLISHED' AS kind
          FROM v81_final_grade_revisions g JOIN enrollments e ON e.id=g.enrollment_id
          WHERE e.class_section_id=${classSectionId}::uuid AND g.organization_id=${principal.organizationId}::uuid AND g.published ORDER BY g.enrollment_id,g.version DESC)`;
      const grades = new Map<string, { latestRevision: null | { version: number; finalGrade: number; published: boolean; createdAt: string };
        publishedRevision: null | { version: number; finalGrade: number; published: boolean; createdAt: string } }>();
      for (const g of gradeRows) {
        const entry = grades.get(g.enrollment_id) ?? { latestRevision: null, publishedRevision: null };
        entry[g.kind === 'LATEST' ? 'latestRevision' : 'publishedRevision'] = {
          version: g.version, finalGrade: g.final_grade, published: g.published, createdAt: g.created_at.toISOString() };
        grades.set(g.enrollment_id, entry);
      }
      const byEnrollment = new Map<string, RecordFact[]>();
      for (const record of records) { const group = byEnrollment.get(record.enrollmentId) ?? []; group.push(record); byEnrollment.set(record.enrollmentId, group); }
      const attach = (row: (typeof registration.rows)[number] | (typeof registration.extras)[number]) => {
        if (!row.enrollmentId) return { ...row, progress: null, physical: null, pendingCount: null, finalGrade: null };
        const facts = byEnrollment.get(row.enrollmentId) ?? [], recognized = recognition.find(item => item.enrollmentId === row.enrollmentId);
        const exercise = exerciseAccounting(facts.map(item => ({ actualSeconds: Number(item.actualSeconds),
          creditedSeconds: item.stage === 'VALID' ? item.creditedMinutes * 60 : 0,
          decision: item.stage === 'VALID' ? 'VALID' : item.stage === 'INVALID' ? 'INVALID' : 'PENDING' })));
        const sum = (type: string) => BigInt(facts.filter(item => item.stage === 'VALID' && item.creditType === type).reduce((total, item) => total + item.creditedMinutes, 0));
        const course = categoryProgress(rule.course, sum('COURSE_RELATED'), recognized?.course);
        const general = categoryProgress(rule.general, sum('GENERAL'), recognized?.general);
        const pendingCount = facts.filter(item => item.stage !== 'VALID' && item.stage !== 'INVALID').length + applications.filter(item =>
          item.enrollmentId === row.enrollmentId && ['SUBMITTED', 'SUPPLEMENT_REQUIRED'].includes(item.status)).length;
        const exempt = applications.some(item => item.enrollmentId === row.enrollmentId && item.applicationType === 'PHYSICAL_TEST' && item.status === 'APPROVED');
        const raw = physical.find(item => item.enrollmentId === row.enrollmentId);
        return { ...row, pendingCount, finalGrade: grades.get(row.enrollmentId) ?? { latestRevision: null, publishedRevision: null }, progress: { ...exercise, course, general,
          remainingSeconds: course.remainingSeconds + general.remainingSeconds,
          targetReached: course.remainingSeconds + general.remainingSeconds === 0 },
          physical: { status: exempt ? 'EXEMPT' : raw ? 'RECORDED' : 'NOT_RECORDED', result: exempt || !raw ? null : {
            version: raw.version, runType: raw.runType, elapsedSeconds: Number(raw.elapsedSeconds), testedOn: raw.testedOn.toISOString().slice(0, 10) } } };
      };
      return { classSectionId, confirmedRosterId: source.id, rosterImportId: source.importId, rosterVersion: source.version,
        ocrBatchId: source.ocrBatchId, sourceKind: source.ocrBatchId ? 'OCR' as const : 'ELECTRONIC' as const,
        ruleVersion: rule.version, generatedAt: this.clock.now().toISOString(), isSettlementSnapshot: false,
        denominator: registration.denominator, denominatorConfirmed: registration.denominatorConfirmed,
        registrationComplete: registration.registrationComplete, rows: registration.rows.map(attach), extras: registration.extras.map(attach) };
  }
}
@Controller('class-sections/:classSectionId/composite-roster')
export class V81CompositeRosterController {
  constructor(private readonly service: V81CompositeRosterService) {}
  @Get('export') @OperationPolicy('exportV81CompositeRosterPreview')
  export(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('classSectionId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) {
    return this.service.export(principal, id);
  }
  @Get() @OperationPolicy('previewV81CompositeRoster')
  preview(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('classSectionId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) {
    return this.service.preview(principal, id);
  }
}
