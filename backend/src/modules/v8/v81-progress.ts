import { Controller, Get, Injectable, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { pagedResult } from '../../common/http/envelope.interceptor.js';
import { ScopedCursorService } from '../../common/pagination/scoped-cursor.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { categoryProgress } from './domain/progress-accounting.js';

class ProgressQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 100;
  @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
}
type ProgressRow = {
  enrollmentId: string;
  classSectionId: string;
  semesterId: string;
  courseTarget: number;
  generalTarget: number;
  minimumMinutes: number;
  weeklyLimit: number;
  dailyLimit: number;
  ruleVersion: number;
  maximumMinutes: number;
  totalTargetMinutes: number;
  allocationPending: boolean;
  globalTargetVersion: number;
};
type Totals = { enrollmentId: string; course: bigint; general: bigint };

@Injectable()
export class V81ProgressService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly cursors: ScopedCursorService,
  ) {}
  async list(principal: AuthenticatedPrincipal, input: ProgressQuery) {
    if (principal.role !== 'STUDENT')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.listScoped(principal, input);
  }
  async listTeacher(principal: AuthenticatedPrincipal, input: ProgressQuery) {
    if (principal.role !== 'TEACHER')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.listScoped(principal, input);
  }
  private async listScoped(principal: AuthenticatedPrincipal, input: ProgressQuery) {
    const teacher = principal.role === 'TEACHER';
    const binding = {
      resource: teacher ? 'TEACHER_PROGRESS' as const : 'STUDENT_PROGRESS' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: {},
      sort: 'id',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    return this.prisma.$transaction(
      async (tx) => {
        const rows = await tx.$queryRaw<
          ProgressRow[]
        >`SELECT e.id AS "enrollmentId",e.class_section_id AS "classSectionId",e.semester_id AS "semesterId",
        r.course_target AS "courseTarget",r.general_target AS "generalTarget",r.minimum_minutes AS "minimumMinutes",r.weekly_limit AS "weeklyLimit",r.daily_limit AS "dailyLimit",r.version AS "ruleVersion",
        COALESCE(r.maximum_minutes,GREATEST(60,r.minimum_minutes)) AS "maximumMinutes",
        CASE WHEN c.closed_at IS NULL AND semester.status='CURRENT' AND NOT EXISTS(SELECT 1 FROM v81_settlement_report_revisions settled WHERE settled.class_section_id=c.id) THEN COALESCE(g.total_target_minutes,1200) ELSE r.course_target+r.general_target END AS "totalTargetMinutes",
        (c.closed_at IS NULL AND semester.status='CURRENT' AND NOT EXISTS(SELECT 1 FROM v81_settlement_report_revisions settled WHERE settled.class_section_id=c.id) AND (r.target_global_version<>COALESCE(g.version,0) OR r.course_target::bigint+r.general_target<>COALESCE(g.total_target_minutes,1200))) AS "allocationPending",
        COALESCE(g.version,0) AS "globalTargetVersion"
        FROM enrollments e JOIN student_profiles s ON s.id=e.student_id JOIN v81_course_rules r ON r.class_section_id=e.class_section_id
        JOIN class_sections c ON c.id=r.class_section_id JOIN semesters semester ON semester.id=c.semester_id
        LEFT JOIN v81_exercise_goal_settings g ON g.organization_id=r.organization_id
        WHERE e.organization_id=${principal.organizationId}::uuid AND r.published_at IS NOT NULL
          AND ${teacher ? Prisma.sql`EXISTS (SELECT 1 FROM class_sections c JOIN teacher_profiles t ON t.id=c.teacher_id
            WHERE c.id=e.class_section_id AND c.organization_id=${principal.organizationId}::uuid AND t.user_id=${principal.userId}::uuid)`
            : Prisma.sql`s.user_id=${principal.userId}::uuid`}
          AND (${position?.id ?? null}::uuid IS NULL OR e.id>${position?.id ?? null}::uuid) ORDER BY e.id LIMIT ${input.limit + 1}`;
        const page = rows.slice(0, input.limit);
        if (!page.length)
          return pagedResult([], { hasMore: false, nextCursor: null, limit: input.limit });
        const ids = Prisma.join(page.map((row) => row.enrollmentId));
        const exercise = await tx.$queryRaw<Totals[]>`SELECT r.enrollment_id AS "enrollmentId",
        coalesce(sum(p.credited_minutes) FILTER(WHERE r.credit_type='COURSE_RELATED'),0)::bigint AS course,
        coalesce(sum(p.credited_minutes) FILTER(WHERE r.credit_type='GENERAL'),0)::bigint AS general
        FROM exercise_records r JOIN v81_record_workflows w ON w.record_id=r.id AND w.stage='VALID'
        JOIN v81_credit_projections p ON p.record_id=r.id
        WHERE r.enrollment_id::text IN (${ids}) AND r.organization_id=${principal.organizationId}::uuid GROUP BY r.enrollment_id`;
        const certification = await tx.$queryRaw<
          Totals[]
        >`SELECT enrollment_id AS "enrollmentId",sum(course_minutes)::bigint AS course,sum(general_minutes)::bigint AS general
        FROM v81_certification_credits WHERE enrollment_id::text IN (${ids}) AND organization_id=${principal.organizationId}::uuid AND active=true GROUP BY enrollment_id`;
        const exerciseMap = new Map(exercise.map((row) => [row.enrollmentId, row]));
        const certificationMap = new Map(certification.map((row) => [row.enrollmentId, row]));
        const category = (
          target: number,
          minutes: bigint | undefined,
          recognized: bigint | undefined,
        ) => {
          return categoryProgress(target, minutes, recognized);
        };
        const data = page.map((row) => {
          const ex = exerciseMap.get(row.enrollmentId),
            cert = certificationMap.get(row.enrollmentId);
          const courseRelated = category(row.courseTarget, ex?.course, cert?.course),
            general = category(row.generalTarget, ex?.general, cert?.general);
          const effectiveSeconds = courseRelated.effectiveSeconds + general.effectiveSeconds;
          return {
            enrollmentId: row.enrollmentId,
            classSectionId: row.classSectionId,
            semesterId: row.semesterId,
            ruleVersion: row.ruleVersion,
            minimumMinutes: row.minimumMinutes,
            maximumMinutes: row.maximumMinutes,
            allocationPending: row.allocationPending,
            globalTargetVersion: row.globalTargetVersion,
            weeklyLimit: row.weeklyLimit,
            dailyLimit: row.dailyLimit,
            courseRelated,
            general,
            totalTargetSeconds: row.totalTargetMinutes * 60,
            totalEffectiveSeconds: effectiveSeconds,
            remainingSeconds: Math.max(0,row.totalTargetMinutes * 60 - effectiveSeconds),
            completionPercent: Math.min(100, effectiveSeconds / (row.totalTargetMinutes * 60) * 100),
            status: !row.allocationPending && effectiveSeconds >= row.totalTargetMinutes * 60 ? 'COMPLETED' : 'IN_PROGRESS',
          };
        });
        const last = page.at(-1)!;
        return pagedResult(data, {
          hasMore: rows.length > input.limit,
          limit: input.limit,
          nextCursor:
            rows.length > input.limit
              ? this.cursors.encode(binding, { id: last.enrollmentId, value: last.enrollmentId })
              : null,
        });
      },
      { isolationLevel: 'RepeatableRead' },
    );
  }
  async target(principal: AuthenticatedPrincipal, id: string) {
    const section = await this.prisma.classSection.findFirst({
      where: { id, organizationId: principal.organizationId },
      include: { teacher: true },
    });
    if (!section || (principal.role === 'TEACHER' && section.teacher.userId !== principal.userId))
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    if (
      principal.role === 'STUDENT' &&
      !(await this.prisma.enrollment.findFirst({
        where: { classSectionId: id, student: { userId: principal.userId } },
      }))
    )
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const rows = await this.prisma.$queryRaw<
      { course_target: number; general_target: number; version: number; total_target: number }[]
    >`SELECT r.course_target,r.general_target,r.version,
      CASE WHEN c.closed_at IS NULL AND s.status='CURRENT' AND NOT EXISTS(SELECT 1 FROM v81_settlement_report_revisions settled WHERE settled.class_section_id=c.id)
      THEN COALESCE(g.total_target_minutes,1200) ELSE r.course_target+r.general_target END AS total_target
      FROM v81_course_rules r JOIN class_sections c ON c.id=r.class_section_id JOIN semesters s ON s.id=c.semester_id
      LEFT JOIN v81_exercise_goal_settings g ON g.organization_id=r.organization_id
      WHERE r.class_section_id=${id}::uuid AND r.published_at IS NOT NULL`;
    const rule = rows[0];
    if (!rule) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return {
      classSectionId: id,
      courseTargetSeconds: rule.course_target * 60,
      generalTargetSeconds: rule.general_target * 60,
      totalTargetSeconds: rule.total_target * 60,
      ruleVersion: rule.version,
    };
  }
}
@Controller()
export class V81ProgressController {
  constructor(private readonly progress: V81ProgressService) {}
  @Get('student-progress')
  @OperationPolicy('listV81StudentProgress')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ProgressQuery) {
    return this.progress.list(principal, query);
  }
  @Get('teacher-progress')
  @OperationPolicy('listV81TeacherProgress')
  listTeacher(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ProgressQuery) {
    return this.progress.listTeacher(principal, query);
  }
  @Get('class-sections/:id/progress-target')
  @OperationPolicy('getV81ProgressTarget')
  target(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param(
      'id',
      new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) }),
    )
    id: string,
  ) {
    return this.progress.target(principal, id);
  }
}
