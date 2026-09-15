import { permitsExistingCourseSession } from '../enrollments/application/course-closure-memberships.js';
import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { ScopedCursorService } from '../../common/pagination/scoped-cursor.service.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { validateCreditRules } from './domain/crediting.js';
import { validateReview } from './domain/review.js';
import { coursePlanCapacity } from './domain/course-plan.js';
import { swimIntakeTiming } from './domain/swim-intake.js';
import { readSwimTransfer } from './v81-swim-transfer.js';
import type {
  ManualModeInput,
  V81ReviewInput,
  V81RulesInput,
  V81SupplementInput,
  SwimIntakeInput,
  ProofTodoQuery,
} from './v81.dto.js';
import { recomputeCredits } from './v81-credit-store.js';
import { appendMaterialVersion } from './v81-materials.js';
import { V81CourseRemindersService } from './v81-course-reminders.js';
import { notifyRecord } from './v81-notifications.js';
import { appendV81SystemEvent } from './v81-system-event.js';
import { supplementClock } from './domain/deadlines.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import { V81SettlementReportsService } from './v81-settlement-reports.js';
import {
  projectExerciseReview,
  type ExerciseReviewProjection,
} from '../exercise-reviews/application/exercise-review-projection.js';

type Transaction = Prisma.TransactionClient;
type Facts = { requestId: string; idempotencyKey: string | undefined };
type Workflow = {
  record_id: string;
  stage: string;
  material_version: number;
  supplement_used: boolean;
  version: number;
  supplement_started_at: Date | null;
  supplement_hours: 24 | 72 | null;
  supplement_accepted_at: Date | null;
  public_reason: string | null;
  public_comment: string | null;
  teacher_round_started_at: Date | null;
};

@Injectable()
export class V81Service {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly cursors: ScopedCursorService,
    private readonly courseReminders: V81CourseRemindersService,
    private readonly settlementReports: V81SettlementReportsService,
  ) {}

  private async section(
    tx: Transaction | PrismaService,
    principal: AuthenticatedPrincipal,
    id: string,
  ) {
    const section = await tx.classSection.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: { teacher: true, semester: true, excludedDates: true },
    });
    if (!section || (principal.role === 'TEACHER' && section.teacher.userId !== principal.userId)) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
    if (principal.role === 'STUDENT') {
      const member = await tx.enrollment.findFirst({
        where: {
          classSectionId: id,
          organizationId: principal.organizationId,
          student: { userId: principal.userId },
        },
      });
      if (!member) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
    return section;
  }
  private mutation<T>(
    principal: AuthenticatedPrincipal,
    operation: string,
    resourceId: string,
    input: unknown,
    facts: Facts,
    work: (tx: Transaction) => Promise<T>,
  ): Promise<T> {
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: operation,
        scope: `${principal.organizationId}:${resourceId}`,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        const policy = await tx.systemPolicy.findUnique({
          where: { organizationId: principal.organizationId },
        });
        if (policy?.systemMode !== 'NORMAL') {
          if (policy?.systemMode !== 'MAINTENANCE' || principal.role !== 'ADMIN')
            throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
          await requireAdminAccess(tx, principal, 'ANY');
        }
        return this.idempotency.success(await work(tx));
      },
    );
  }
  private async event(
    tx: Transaction,
    principal: AuthenticatedPrincipal,
    type: string,
    id: string,
    event: string,
    version: number,
    data: unknown,
    facts: Facts,
  ) {
    await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
      VALUES (${this.ids.next()}::uuid,${principal.organizationId}::uuid,${type},${id}::uuid,${event},${principal.userId}::uuid,
      ${facts.requestId},${version},${JSON.stringify(data)}::jsonb,${this.clock.now()},'SUCCEEDED')`;
  }
  async rules(principal: AuthenticatedPrincipal, id: string) {
    const section=await this.section(this.prisma, principal, id);
    const rows = await this.prisma.$queryRaw<
      Record<string, unknown>[]
    >`SELECT * FROM v81_course_rules WHERE class_section_id=${id}::uuid AND organization_id=${principal.organizationId}::uuid`;
    if (!rows[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const goal = await this.readExerciseGoal(this.prisma, principal.organizationId);
    const settled=await this.prisma.$queryRaw<{id:string}[]>`SELECT id FROM v81_settlement_report_revisions WHERE class_section_id=${id}::uuid LIMIT 1`;
    const historical=!!section.closedAt||section.semester.status!=='CURRENT'||settled.length>0;
    return { ...rows[0], maximum_minutes: rows[0].maximum_minutes ?? Math.max(60, Number(rows[0].minimum_minutes)),
      global_target_minutes: historical?Number(rows[0].course_target)+Number(rows[0].general_target):goal.totalTargetMinutes, global_target_version: goal.version,
      allocation_pending: !historical&&(rows[0].target_global_version !== goal.version || Number(rows[0].course_target) + Number(rows[0].general_target) !== goal.totalTargetMinutes) };
  }
  private async readExerciseGoal(tx: Transaction | PrismaService, organizationId: string) {
    const rows = await tx.$queryRaw<{ total_target_minutes: number; version: number }[]>`
      SELECT total_target_minutes,version FROM v81_exercise_goal_settings WHERE organization_id=${organizationId}::uuid`;
    return { totalTargetMinutes: rows[0]?.total_target_minutes ?? 1200, version: rows[0]?.version ?? 0 };
  }
  async exerciseGoal(principal: AuthenticatedPrincipal) {
    if (principal.role !== 'TEACHER') await requireAdminAccess(this.prisma, principal, 'SUPER');
    return this.readExerciseGoal(this.prisma, principal.organizationId);
  }
  async saveExerciseGoal(principal: AuthenticatedPrincipal, input: { totalTargetMinutes: number; expectedVersion: number }, facts: Facts) {
    return this.mutation(principal, 'saveV81ExerciseGoal', principal.organizationId, input, facts, async tx => {
      await requireAdminAccess(tx, principal, 'SUPER');
      const previous = await this.readExerciseGoal(tx, principal.organizationId);
      if (previous.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      if (previous.totalTargetMinutes === input.totalTargetMinutes) return previous;
      const version = previous.version + 1;
      await tx.$executeRaw`INSERT INTO v81_exercise_goal_settings(organization_id,total_target_minutes,version,updated_by,updated_at)
        VALUES(${principal.organizationId}::uuid,${input.totalTargetMinutes},${version},${principal.userId}::uuid,${this.clock.now()})
        ON CONFLICT(organization_id) DO UPDATE SET total_target_minutes=EXCLUDED.total_target_minutes,version=EXCLUDED.version,updated_by=EXCLUDED.updated_by,updated_at=EXCLUDED.updated_at`;
      await this.event(tx,principal,'EXERCISE_GOAL',principal.organizationId,'GLOBAL_TARGET_CHANGED',version,
        {previousTotalTargetMinutes:previous.totalTargetMinutes,totalTargetMinutes:input.totalTargetMinutes,newCheckins:'PAUSED_UNTIL_TEACHER_ALLOCATION'},facts);
      return {totalTargetMinutes:input.totalTargetMinutes,version};
    });
  }
  async saveRules(
    principal: AuthenticatedPrincipal,
    id: string,
    input: V81RulesInput,
    facts: Facts,
  ) {
    if (principal.role !== 'TEACHER')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    try {
      validateCreditRules(input);
    } catch {
      throw new ApplicationError('VALIDATION_FAILED', 422);
    }
    return this.mutation(principal, 'saveV81CourseRules', id, input, facts, async (tx) => {
      await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${id}::uuid AND organization_id=${principal.organizationId}::uuid FOR UPDATE`;
      const section = await this.section(tx, principal, id);
      const goal = await this.readExerciseGoal(tx, principal.organizationId);
      if ((input.globalTargetVersion ?? 0) !== goal.version) throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      if (input.courseTarget + input.generalTarget !== goal.totalTargetMinutes)
        throw new ApplicationError('VALIDATION_FAILED',422,{reason:'COURSE_TARGET_TOTAL_MISMATCH'});
      await requireUnsettledCourse(tx, principal.organizationId, id);
      if (section.semester.status !== 'CURRENT' || section.closedAt)
        throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const old = await tx.$queryRaw<
        { version: number; published_at: Date | null; course_target: number; general_target: number;
          maximum_minutes: number | null; target_global_version: number;
          template_id: string | null; regular_deadline: Date; closing_deadline: Date; settlement_planned_at: Date }[]
      >`SELECT * FROM v81_course_rules WHERE class_section_id=${id}::uuid FOR UPDATE`;
      if ((old[0]?.version ?? 0) !== input.expectedVersion)
        throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const maximumMinutes = input.maximumMinutes ?? old[0]?.maximum_minutes ?? Math.max(60,input.minimumMinutes);
      if (maximumMinutes < input.minimumMinutes) throw new ApplicationError('VALIDATION_FAILED',422,{reason:'MAXIMUM_BELOW_MINIMUM'});
      if (old[0]?.published_at) {
        const previous = old[0];
        if (!input.publish || input.templateId !== previous.template_id ||
          Date.parse(input.regularDeadline) !== previous.regular_deadline.getTime() ||
          Date.parse(input.closingDeadline) !== previous.closing_deadline.getTime() ||
          Date.parse(input.settlementPlannedAt) !== previous.settlement_planned_at.getTime())
          throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        await tx.$executeRaw`UPDATE v81_course_rules SET minimum_minutes=${input.minimumMinutes},
          maximum_minutes=${maximumMinutes},course_target=${input.courseTarget},general_target=${input.generalTarget},target_global_version=${goal.version},
          weekly_limit=${input.weeklyLimit},daily_limit=${input.dailyLimit ?? 1},version=version+1
          WHERE class_section_id=${id}::uuid`;
        await this.event(tx, principal, 'COURSE_RULES', id, 'FUTURE_RULES_UPDATED', input.expectedVersion + 1,
          { minimumMinutes: input.minimumMinutes, maximumMinutes, courseTarget:input.courseTarget,generalTarget:input.generalTarget,globalTargetVersion:goal.version,weeklyLimit: input.weeklyLimit, dailyLimit: input.dailyLimit ?? 1,
            effectiveFor: 'NEW_RECORDS',maximumEffectiveFor:'NEW_SESSIONS',
            targetsEffectiveFor: 'ALL_COURSE_ENROLLMENTS', previousCourseTarget: previous.course_target, previousGeneralTarget: previous.general_target }, facts);
        if(previous.course_target!==input.courseTarget||previous.general_target!==input.generalTarget){
          const members=await tx.enrollment.findMany({where:{classSectionId:id,organizationId:principal.organizationId},select:{id:true},orderBy:{id:'asc'}});
          for(const member of members)await recomputeCredits(tx,member.id,this.clock.now());
        }
        return { classSectionId: id, ...input, version: input.expectedVersion + 1,
          publishedAt: previous.published_at!.toISOString() };
      }
      if (input.publish && !input.templateId) throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'PUBLISHED_TEMPLATE_REQUIRED' });
      if (input.templateId) {
        const templates = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_rule_templates
          WHERE id=${input.templateId}::uuid AND organization_id=${principal.organizationId}::uuid AND published_at<=${this.clock.now()}`;
        if (!templates[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      }
      const regular = new Date(input.regularDeadline),
        closing = new Date(input.closingDeadline),
        planned = new Date(input.settlementPlannedAt);
      if (
        closing.getTime() - regular.getTime() !== 7 * 86_400_000 ||
        regular.getTime() < (section.checkInEndDate ?? section.checkInStartDate ?? section.semester.startDate).getTime() - 8 * 3_600_000 ||
        planned < closing ||
        closing.getTime() > section.semester.endDate.getTime() + 86_400_000 - 8 * 3_600_000
      )
        throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'COURSE_DEADLINES_INVALID', fieldErrors: [{field:'regularDeadline',code:'COURSE_DEADLINES_INVALID',i18nKey:'error.validation.failed',params:{}}] });
      if (input.publish) {
        if (
          !section.checkInStartDate ||
          !section.checkInEndDate ||
          !section.dailyStartTime ||
          !section.dailyEndTime ||
          section.checkInWindowMode !== 'AVAILABLE'
        )
          throw new ApplicationError('VALIDATION_FAILED', 422);
        const organization = await tx.organization.findUniqueOrThrow({ where: { id: principal.organizationId } });
        let capacity;
        try {
          capacity = coursePlanCapacity({
            rules: input,
            semesterStart: section.semester.startDate.toISOString().slice(0, 10),
            semesterEnd: section.semester.endDate.toISOString().slice(0, 10),
            startDate: section.checkInStartDate.toISOString().slice(0, 10),
            endDate: section.checkInEndDate.toISOString().slice(0, 10),
            dailyStart: section.dailyStartTime.toISOString().slice(11, 19),
            dailyEnd: section.dailyEndTime.toISOString().slice(11, 19),
            excludedDates: section.excludedDates.map((item) => item.excludedDate.toISOString().slice(0, 10)),
            now: this.clock.now(), regularDeadline: regular, timezone: organization.timezone,
          });
        } catch {
          throw new ApplicationError('VALIDATION_FAILED', 422);
        }
        if (!capacity.completable)
          throw new ApplicationError('VALIDATION_FAILED', 422, {
            reason: 'COURSE_PLAN_NOT_COMPLETABLE',
            fieldErrors: [{field:'courseTarget',code:'COURSE_PLAN_NOT_COMPLETABLE',i18nKey:'error.validation.failed',params:{}}],
          });
      }
      const published = input.publish ? this.clock.now() : null;
      await tx.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,daily_limit,course_target,general_target,regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id,maximum_minutes,target_global_version)
        VALUES (${id}::uuid,${principal.organizationId}::uuid,${input.minimumMinutes},${input.weeklyLimit},${input.dailyLimit ?? 1},${input.courseTarget},${input.generalTarget},${regular},${closing},${planned},${published},${input.expectedVersion + 1},${input.templateId ?? null}::uuid,${maximumMinutes},${goal.version})
        ON CONFLICT(class_section_id) DO UPDATE SET minimum_minutes=EXCLUDED.minimum_minutes,weekly_limit=EXCLUDED.weekly_limit,daily_limit=EXCLUDED.daily_limit,course_target=EXCLUDED.course_target,general_target=EXCLUDED.general_target,
        regular_deadline=EXCLUDED.regular_deadline,closing_deadline=EXCLUDED.closing_deadline,settlement_planned_at=EXCLUDED.settlement_planned_at,published_at=EXCLUDED.published_at,version=EXCLUDED.version,template_id=EXCLUDED.template_id,maximum_minutes=EXCLUDED.maximum_minutes,target_global_version=EXCLUDED.target_global_version`;
      if (input.publish) {
        if (section.status !== 'ACTIVE') throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        if (!section.isEnrollmentOpen) {
          const opened = await tx.classSection.update({where:{id},data:{isEnrollmentOpen:true,
            updatedBy:principal.userId,updatedAt:this.clock.now(),version:{increment:1}}});
          await this.event(tx,principal,'CLASS_SECTION',id,'ENROLLMENT_OPENED',opened.version,
            {reason:'RULES_PUBLISHED',ruleVersion:input.expectedVersion+1},facts);
        }
        let after: string | null = null;
        do { after = await this.courseReminders.processInTransaction(tx, principal.organizationId, id, after); } while (after);
      }
      await this.event(
        tx,
        principal,
        'COURSE_RULES',
        id,
        input.publish ? 'PUBLISHED' : 'DRAFT_SAVED',
        input.expectedVersion + 1,
        input,
        facts,
      );
      return {
        classSectionId: id,
        ...input,
        version: input.expectedVersion + 1,
        publishedAt: published?.toISOString() ?? null,
      };
    });
  }
  async proofTodos(principal: AuthenticatedPrincipal, query: ProofTodoQuery) {
    if (principal.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const binding = { resource: 'EXERCISE_RECORD' as const, organizationId: principal.organizationId,
      principalId: principal.userId, role: principal.role, filters: { stage: 'AWAITING_SUPPLEMENT' },
      sort: 'id', limit: query.limit };
    const position = this.cursors.decode(query.cursor, binding);
    return this.prisma.$transaction(async (tx) => {
      const rows = await tx.$queryRaw<(Workflow & { record_id: string; session_id: string; class_section_id: string;
        course_name:string;started_at:Date;sport_type:string;sport_name:string|null;actual_duration_seconds:bigint })[]>`
        SELECT w.*,r.session_id,r.class_section_id,c.display_name AS course_name,session.started_at,r.sport_type,r.sport_name,r.actual_duration_seconds FROM v81_record_workflows w
        JOIN exercise_records r ON r.id=w.record_id JOIN student_profiles s ON s.id=r.student_id
        JOIN class_sections c ON c.id=r.class_section_id JOIN exercise_sessions session ON session.id=r.session_id
        WHERE w.organization_id=${principal.organizationId}::uuid AND s.user_id=${principal.userId}::uuid
          AND w.stage='AWAITING_SUPPLEMENT' AND (${position?.id ?? null}::uuid IS NULL OR r.id>${position?.id ?? null}::uuid)
        ORDER BY r.id LIMIT ${query.limit + 1}`;
      const page = rows.slice(0, query.limit);
      const now = this.clock.now();
      const items = [];
      for (const row of page) {
        const clock = await this.deadline(tx, principal.organizationId, row.class_section_id, row, now);
        if (!clock) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
        items.push({ recordId: row.record_id, sessionId: row.session_id, workflowVersion: row.version,
          classSectionId:row.class_section_id,courseName:row.course_name,startedAt:row.started_at.toISOString(),sportType:row.sport_type,sportName:row.sport_name,
          actualDurationSeconds:Number(row.actual_duration_seconds),source:'TEACHER_REVIEW',
          stage: row.stage, reasonCode: row.public_reason, publicComment: row.public_comment,
          studentVisibleReason: row.public_reason, remainingSeconds: Math.ceil(clock.remainingMs / 1000),
          deadlineAt: clock.deadline.toISOString(), paused: clock.paused, expired: clock.expired });
      }
      const last = page.at(-1);
      return { items, nextCursor: rows.length > query.limit && last
        ? this.cursors.encode(binding, { id: last.record_id, value: last.record_id }) : null };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async swimIntakeStatus(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(async (tx) => {
      await this.scopedRecord(tx, principal, id);
      const result = await readSwimTransfer(tx, id, this.clock.now());
      if (!result) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      return result;
    }, { isolationLevel: 'RepeatableRead' });
  }
  async swimIntake(principal: AuthenticatedPrincipal, id: string, input: SwimIntakeInput, facts: Facts) {
    if (principal.role !== 'STUDENT') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.mutation(principal, 'acceptV81SwimIntake', id, input, facts, async (tx) => {
      await tx.$queryRaw`SELECT id FROM exercise_records WHERE id=${id}::uuid FOR UPDATE`;
      const record = await this.scopedRecord(tx, principal, id);
      await requireUnsettledCourse(tx, principal.organizationId, record.classSectionId);
      if (record.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (record.sportType !== 'SWIMMING' || record.status !== 'DRAFT')
        throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const section = await this.section(tx, principal, record.classSectionId);
      const enrollment = await tx.enrollment.findUnique({ where: { id: record.enrollmentId } });
      const admittedSession = await tx.exerciseSession.findUnique({ where: { id: record.sessionId } });
      if (section.semester.status === 'ARCHIVED' || !enrollment || !admittedSession || !permitsExistingCourseSession(enrollment, section, admittedSession.startedAt) || record.student.status !== 'ACTIVE')
        throw new ApplicationError('ENROLLMENT_NOT_ACTIVE', 409);
      const existing = await tx.$queryRaw<{ record_id: string }[]>`SELECT record_id FROM v81_swim_intakes WHERE record_id=${id}::uuid`;
      if (existing.length) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const session = admittedSession;
      if (!session?.completedAt || session.status !== 'COMPLETED')
        throw new ApplicationError('SESSION_NOT_COMPLETED', 409);
      const now = this.clock.now();
      let timing;
      try { timing = swimIntakeTiming(session.completedAt, now, input.delayReason); }
      catch (error) { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: (error as Error).message }); }
      const ids = input.items.map((item) => item.mediaId);
      if (new Set(ids).size !== ids.length) throw new ApplicationError('VALIDATION_FAILED', 422);
      const media = await tx.mediaEvidence.findMany({ where: {
        id: { in: ids }, organizationId: principal.organizationId, ownerStudentId: record.studentId,
        sessionId: record.sessionId, businessPurpose: 'EXERCISE_RECORD',
        uploadStatus: { in: ['PENDING_UPLOAD', 'UPLOADED', 'BOUND', 'PROCESSING', 'AVAILABLE'] },
      } });
      if (media.length !== ids.length) throw new ApplicationError('MEDIA_NOT_AVAILABLE', 409);
      let imageCount = 0, videoCount = 0, bytes = 0n;
      const byId = new Map(media.map((item) => [item.id, item]));
      for (const item of input.items) {
        const evidence = byId.get(item.mediaId)!;
        if (!evidence.declaredContentSha256 || !/^[0-9a-f]{64}$/.test(evidence.declaredContentSha256))
          throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'LOCKED_BATCH_CONTENT_HASH_REQUIRED' });
        bytes += evidence.declaredFileSizeBytes;
        if (evidence.mediaType === 'IMAGE') {
          imageCount++;
          if (!['image/jpeg', 'image/png'].includes(evidence.declaredMimeType) || evidence.declaredFileSizeBytes > 10485760n)
            throw new ApplicationError('MEDIA_TYPE_NOT_ALLOWED', 415);
        } else if (evidence.mediaType === 'VIDEO' && item.phase === 'OTHER') {
          videoCount++;
          if (evidence.declaredMimeType !== 'video/mp4' || evidence.declaredFileSizeBytes > 104857600n)
            throw new ApplicationError('MEDIA_TYPE_NOT_ALLOWED', 415);
        } else throw new ApplicationError('MEDIA_TYPE_NOT_ALLOWED', 415);
      }
      if (imageCount < 2 || imageCount > 6 || videoCount > 1 || bytes > 262144000n ||
          !input.items.some((item) => item.phase === 'BEFORE') || !input.items.some((item) => item.phase === 'AFTER'))
        throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'SWIM_BEFORE_AFTER_REQUIRED' });
      await tx.$executeRaw`INSERT INTO v81_swim_intakes(record_id,organization_id,accepted_at,session_ended_at,transfer_deadline,intake_kind,delay_reason)
        VALUES(${id}::uuid,${principal.organizationId}::uuid,${now},${session.completedAt},${timing.transferDeadline},${timing.intakeKind},${timing.delayReason})`;
      for (const [position, item] of input.items.entries())
        await tx.$executeRaw`INSERT INTO v81_swim_intake_items(record_id,media_id,phase,position,content_sha256)
          VALUES(${id}::uuid,${item.mediaId}::uuid,${item.phase},${position + 1},${byId.get(item.mediaId)!.declaredContentSha256})`;
      await this.event(tx, principal, 'SWIM_INTAKE', id, 'BATCH_ACCEPTED', 1,
        { intakeKind: timing.intakeKind, delayReason: timing.delayReason, mediaIds: ids }, facts);
      return { recordId: id, acceptedAt: now.toISOString(), transferDeadline: timing.transferDeadline.toISOString(),
        intakeKind: timing.intakeKind, delayReason: timing.delayReason, items: input.items, version: 1 };
    });
  }
  async manualModeStatus(principal: AuthenticatedPrincipal, classSectionId: string) {
    return this.prisma.$transaction(async (tx) => {
      await requireAdminAccess(tx, principal, 'SUPER');
      await this.section(tx, principal, classSectionId);
      const rows = await tx.$queryRaw<{
        enabled: boolean; reason: string; version: number; updated_at: Date;
      }[]>`SELECT enabled,reason,version,updated_at FROM v81_manual_modes
        WHERE class_section_id=${classSectionId}::uuid AND organization_id=${principal.organizationId}::uuid`;
      const row = rows[0];
      return {
        classSectionId,
        enabled: row?.enabled ?? true,
        reason: row?.reason ?? null,
        version: row?.version ?? 0,
        updatedAt: row?.updated_at.toISOString() ?? null,
      };
    }, { isolationLevel: 'RepeatableRead' });
  }
  async manualMode(principal: AuthenticatedPrincipal, input: ManualModeInput, facts: Facts) {
    return this.mutation(
      principal,
      'setV81ManualMode',
      input.classSectionId,
      input,
      facts,
      async (tx) => {
        await requireAdminAccess(tx, principal, 'SUPER');
        await this.section(tx, principal, input.classSectionId);
        if (!input.reason.trim()) throw new ApplicationError('VALIDATION_FAILED', 422);
        const current = await tx.$queryRaw<
          { version: number }[]
        >`SELECT version FROM v81_manual_modes WHERE class_section_id=${input.classSectionId}::uuid FOR UPDATE`;
        if ((current[0]?.version ?? 0) !== input.expectedVersion)
          throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
        await tx.$executeRaw`INSERT INTO v81_manual_modes(class_section_id,organization_id,enabled,reason,version,updated_at) VALUES (${input.classSectionId}::uuid,${principal.organizationId}::uuid,${input.enabled},${input.reason.trim()},${input.expectedVersion + 1},${this.clock.now()})
        ON CONFLICT(class_section_id) DO UPDATE SET enabled=EXCLUDED.enabled,reason=EXCLUDED.reason,version=EXCLUDED.version,updated_at=EXCLUDED.updated_at`;
        if (input.enabled) {
          const changed = await tx.$queryRaw<
            { record_id: string; version: number }[]
          >`UPDATE v81_record_workflows SET stage='PENDING_TEACHER',teacher_round_started_at=${this.clock.now()},version=version+1,updated_at=${this.clock.now()}
          WHERE organization_id=${principal.organizationId}::uuid AND stage IN ('PENDING_AI','TECHNICAL') AND record_id IN (SELECT id FROM exercise_records WHERE class_section_id=${input.classSectionId}::uuid) RETURNING record_id,version`;
          for (const item of changed)
            await this.event(
              tx,
              principal,
              'RECORD_REVIEW',
              item.record_id,
              'MANUAL_REVIEW_QUEUED',
              item.version,
              { classSectionId: input.classSectionId, modeVersion: input.expectedVersion + 1 },
              facts,
            );
        }
        await this.event(
          tx,
          principal,
          'MANUAL_MODE',
          input.classSectionId,
          input.enabled ? 'ENABLED' : 'DISABLED',
          input.expectedVersion + 1,
          input,
          facts,
        );
        return { ...input, version: input.expectedVersion + 1 };
      },
    );
  }
  async review(
    principal: AuthenticatedPrincipal,
    id: string,
    input: V81ReviewInput,
    facts: Facts,
    compatibility?: { expectedReviewVersion: number },
    correctionReason?: string,
  ) {
    if (
      correctionReason !== undefined &&
      (!correctionReason.trim() || input.action === 'RETURN_FOR_SUPPLEMENT')
    )
      throw new ApplicationError('VALIDATION_FAILED', 422);
    return this.mutation(
      principal,
      correctionReason
        ? 'correctV81Record'
        : compatibility
          ? 'reviewExerciseRecord'
          : 'reviewV81Record',
      id,
      { ...input, ...compatibility, ...(correctionReason ? { correctionReason } : {}) },
      facts,
      async (tx) => {
        const record = await tx.exerciseRecord.findFirst({
          where: { id, organizationId: principal.organizationId },
        });
        if (!record || principal.role !== 'TEACHER')
          throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
        await this.section(tx, principal, record.classSectionId);
        if (!correctionReason) await requireUnsettledCourse(tx, principal.organizationId, record.classSectionId);
        const rows = await tx.$queryRaw<
          Workflow[]
        >`SELECT * FROM v81_record_workflows WHERE record_id=${id}::uuid FOR UPDATE`;
        const state = rows[0];
        if (!state || (compatibility ? record.version : state.version) !== input.expectedVersion)
          throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
        if (compatibility) {
          const current = await tx.reviewRecord.findFirst({
            where: { recordId: id },
            orderBy: { reviewVersion: 'desc' },
          });
          if (current?.reviewVersion !== compatibility.expectedReviewVersion)
            throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
        }
        if (
          correctionReason
            ? !['VALID', 'INVALID'].includes(state.stage)
            : state.stage !== 'PENDING_TEACHER'
        )
          throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        let decision;
        try {
          decision = validateReview({ ...input, supplementUsed: state.supplement_used });
        } catch {
          throw new ApplicationError('VALIDATION_FAILED', 422);
        }
        const stage =
          input.action === 'RETURN_FOR_SUPPLEMENT' ? 'AWAITING_SUPPLEMENT' : input.action;
        const now = this.clock.now();
        await tx.$executeRaw`UPDATE v81_record_workflows SET stage=${stage},public_reason=${decision.reasonCode},public_comment=${decision.publicComment},
        supplement_used=${state.supplement_used || input.action === 'RETURN_FOR_SUPPLEMENT'},
        supplement_started_at=CASE WHEN ${input.action}='RETURN_FOR_SUPPLEMENT' THEN ${now} ELSE supplement_started_at END,
        supplement_hours=CASE WHEN ${input.action}='RETURN_FOR_SUPPLEMENT' THEN ${decision.supplementHours} ELSE supplement_hours END,
        teacher_round_started_at=NULL,version=version+1,updated_at=${now} WHERE record_id=${id}::uuid`;
        await this.event(
          tx,
          principal,
          'RECORD_REVIEW',
          id,
          correctionReason ? 'FACT_CORRECTED' : input.action,
          state.version + 1,
          {
            ...decision,
            materialVersion: state.material_version,
            ...(correctionReason
              ? { correctionReason: correctionReason.trim(), previousStage: state.stage }
              : {}),
          },
          facts,
        );
        let review: ExerciseReviewProjection | null = null;
        if (input.action !== 'RETURN_FOR_SUPPLEMENT') {
          const previous = await tx.reviewRecord.findFirst({
            where: { recordId: id },
            orderBy: { reviewVersion: 'desc' },
          });
          if (!previous) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
          const created = await tx.reviewRecord.create({
            data: {
              id: this.ids.next(),
              organizationId: principal.organizationId,
              recordId: id,
              reviewVersion: previous.reviewVersion + 1,
              previousReviewId: previous.id,
              teacherId: record.teacherId,
              result: input.action,
              reasonCode: decision.reasonCode,
              publicComment: decision.publicComment,
              reviewedAt: now,
              createdAt: now,
            },
          });
          review = projectExerciseReview(created);
        }
        await tx.exerciseRecord.update({
          where: { id, version: record.version },
          data: { status: 'REVIEWED', version: { increment: 1 }, updatedAt: now },
        });
        const credit = await recomputeCredits(tx, record.enrollmentId, now);
        if (correctionReason) await this.settlementReports.appendRecordCorrectionInTransaction(tx, principal,
          record.classSectionId, id, state.version + 1, correctionReason, facts.requestId);
        const student = await tx.studentProfile.findUniqueOrThrow({
          where: { id: record.studentId },
        });
        await notifyRecord(tx, {
          id: this.ids.next(),
          organizationId: principal.organizationId,
          recordId: id,
          recipientUserId: student.userId,
          stage,
          reasonCode: decision.reasonCode,
          publicComment: decision.publicComment,
          now,
        });
        return {
          recordId: id,
          stage,
          version: state.version + 1,
          ...decision,
          review,
          creditedMinutes: credit.records.find((item) => item.id === id)?.creditedMinutes ?? 0,
        };
      },
    );
  }

  private async scopedRecord(
    tx: Transaction | PrismaService,
    principal: AuthenticatedPrincipal,
    id: string,
  ) {
    if (principal.role === 'ADMIN')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const record = await tx.exerciseRecord.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: { student: true },
    });
    if (!record || (principal.role === 'STUDENT' && record.student.userId !== principal.userId))
      throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
    await this.section(tx, principal, record.classSectionId);
    return record;
  }

  private async deadline(
    tx: Transaction | PrismaService,
    organizationId: string,
    classSectionId: string,
    state: Workflow,
    now: Date,
  ) {
    if (
      !state.supplement_started_at ||
      !state.supplement_hours ||
      state.stage !== 'AWAITING_SUPPLEMENT'
    )
      return null;
    const intervals = await tx.$queryRaw<{ startedAt: Date; endedAt: Date | null }[]>`
      SELECT started_at AS "startedAt",ended_at AS "endedAt" FROM v81_interruptions
      WHERE organization_id=${organizationId}::uuid AND (class_section_id IS NULL OR class_section_id=${classSectionId}::uuid)
      AND started_at<=${now} AND (ended_at IS NULL OR ended_at>${state.supplement_started_at})`;
    return supplementClock(state.supplement_started_at, state.supplement_hours, intervals, now);
  }

  async supplementStatus(principal: AuthenticatedPrincipal, id: string) {
    if (principal.role !== 'STUDENT')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const workflow = await this.workflow(principal, id);
    return { recordId: id, stage: workflow.stage, supplement: workflow.supplement };
  }

  async workflow(principal: AuthenticatedPrincipal, id: string) {
    return this.prisma.$transaction(
      async (tx) => {
        const record = await this.scopedRecord(tx, principal, id);
        const rows = await tx.$queryRaw<
          Workflow[]
        >`SELECT * FROM v81_record_workflows WHERE record_id=${id}::uuid`;
        const state = rows[0];
        if (!state) throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
        const clock = await this.deadline(
          tx,
          principal.organizationId,
          record.classSectionId,
          state,
          this.clock.now(),
        );
        const materials = await tx.$queryRaw<
          { materialVersion: number; mediaId: string; position: number }[]
        >`
        SELECT material_version AS "materialVersion",media_id AS "mediaId",position FROM v81_material_items WHERE record_id=${id}::uuid ORDER BY material_version,position`;
        const credits = await tx.$queryRaw<
          { eligibleMinutes: number; creditedMinutes: number; reason: string | null }[]
        >`
        SELECT eligible_minutes AS "eligibleMinutes",credited_minutes AS "creditedMinutes",reason FROM v81_credit_projections WHERE record_id=${id}::uuid`;
        return {
          recordId: id,
          stage: state.stage,
          materialVersion: state.material_version,
          supplementUsed: state.supplement_used,
          publicReason: state.public_reason,
          publicComment: state.public_comment,
          version: state.version,
          materials,
          supplement: clock
            ? {
                deadline: clock.deadline.toISOString(),
                remainingMs: clock.remainingMs,
                paused: clock.paused,
                expired: clock.expired,
              }
            : null,
          credit: credits[0] ?? null,
        };
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }

  async supplement(
    principal: AuthenticatedPrincipal,
    id: string,
    input: V81SupplementInput,
    facts: Facts,
  ) {
    if (principal.role !== 'STUDENT')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.mutation(principal, 'submitV81Supplement', id, input, facts, async (tx) => {
      const record = await this.scopedRecord(tx, principal, id);
      const rows = await tx.$queryRaw<
        Workflow[]
      >`SELECT * FROM v81_record_workflows WHERE record_id=${id}::uuid FOR UPDATE`;
      const state = rows[0];
      if (!state || state.version !== input.expectedVersion)
        throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (
        state.stage !== 'AWAITING_SUPPLEMENT' ||
        !state.supplement_used ||
        state.material_version !== 1 ||
        state.supplement_accepted_at
      ) {
        throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      }
      const now = this.clock.now();
      const deadline = await this.deadline(
        tx,
        principal.organizationId,
        record.classSectionId,
        state,
        now,
      );
      if (!deadline || deadline.expired || deadline.paused)
        throw new ApplicationError('COURSE_DEADLINE_PASSED', 409);
      // This is the existing record's continuation. A closed class or removed membership
      // must not silently cancel an already granted supplement window.
      const semester = await tx.semester.findUniqueOrThrow({ where: { id: record.semesterId } });
      if (semester.status === 'ARCHIVED')
        throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      await appendMaterialVersion(tx, {
        recordId: id,
        organizationId: principal.organizationId,
        mediaIds: input.mediaIds,
        materialVersion: 2,
        now,
      });
      await tx.$executeRaw`UPDATE v81_record_workflows SET stage='PENDING_TEACHER',material_version=2,supplement_accepted_at=${now},
        teacher_round_started_at=${now},version=version+1,updated_at=${now} WHERE record_id=${id}::uuid`;
      await tx.exerciseRecord.update({
        where: { id, version: record.version },
        data: { status: 'SUBMITTED', version: { increment: 1 }, updatedAt: now },
      });
      await this.event(
        tx,
        principal,
        'RECORD_REVIEW',
        id,
        'SUPPLEMENT_ACCEPTED',
        state.version + 1,
        { materialVersion: 2, mediaCount: input.mediaIds.length },
        facts,
      );
      await notifyRecord(tx, {
        id: this.ids.next(),
        organizationId: principal.organizationId,
        recordId: id,
        recipientUserId: record.student.userId,
        stage: 'PENDING_TEACHER',
        reasonCode: state.public_reason,
        publicComment: state.public_comment,
        now,
      });
      return {
        recordId: id,
        stage: 'PENDING_TEACHER',
        materialVersion: 2,
        acceptedAt: now.toISOString(),
        version: state.version + 1,
      };
    });
  }

  async expireSupplement(organizationId: string, id: string): Promise<boolean> {
    return this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${organizationId}::uuid FOR NO KEY UPDATE`;
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId } });
      if (policy?.systemMode !== 'NORMAL') return false;
      const rows = await tx.$queryRaw<
        Workflow[]
      >`SELECT * FROM v81_record_workflows WHERE record_id=${id}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;
      const state = rows[0];
      if (!state || state.stage !== 'AWAITING_SUPPLEMENT' || state.supplement_accepted_at)
        return false;
      const record = await tx.exerciseRecord.findUniqueOrThrow({
        where: { id },
        include: { student: true },
      });
      const now = this.clock.now(),
        deadline = await this.deadline(tx, organizationId, record.classSectionId, state, now);
      if (!deadline?.expired) return false;
      const previous = await tx.reviewRecord.findFirst({
        where: { recordId: id },
        orderBy: { reviewVersion: 'desc' },
      });
      if (!previous) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
      await tx.$executeRaw`UPDATE v81_record_workflows SET stage='INVALID',public_reason='SUPPLEMENT_DEADLINE_MISSED',public_comment=NULL,
        teacher_round_started_at=NULL,version=version+1,updated_at=${now} WHERE record_id=${id}::uuid`;
      await tx.reviewRecord.create({
        data: {
          id: this.ids.next(),
          organizationId,
          recordId: id,
          reviewVersion: previous.reviewVersion + 1,
          previousReviewId: previous.id,
          result: 'INVALID',
          reasonCode: 'SUPPLEMENT_DEADLINE_MISSED',
          reviewedAt: now,
          createdAt: now,
        },
      });
      await tx.exerciseRecord.update({
        where: { id, version: record.version },
        data: { status: 'REVIEWED', version: { increment: 1 }, updatedAt: now },
      });
      await appendV81SystemEvent(tx, { organizationId, resourceType: 'RECORD_REVIEW', resourceId: id,
        eventType: 'SUPPLEMENT_EXPIRED', requestId: this.ids.next(), version: state.version + 1, occurredAt: now,
        outcome: 'SUCCEEDED', reasonCode: 'SUPPLEMENT_DEADLINE_MISSED',
        facts: { deadline: deadline.deadline.toISOString(), materialVersion: state.material_version } });
      await recomputeCredits(tx, record.enrollmentId, now);
      await notifyRecord(tx, {
        id: this.ids.next(),
        organizationId,
        recordId: id,
        recipientUserId: record.student.userId,
        stage: 'INVALID',
        reasonCode: 'SUPPLEMENT_DEADLINE_MISSED',
        publicComment: null,
        now,
      });
      return true;
    });
  }
}
