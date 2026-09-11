import { Controller, Get, Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/database/prisma.service.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { Clock } from '../../common/time/clock.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { categoryProgress } from './domain/progress-accounting.js';

type Aggregate = { classSectionId: string; active: boolean; students: bigint; submittedStudents: bigint;
  totalRecords: bigint; validRecords: bigint; invalidRecords: bigint; pendingTeacher: bigint;
  pendingSupplement: bigint; technical: bigint; pendingAi: bigint; creditedSeconds: bigint };
const count = (value: bigint | undefined) => {
  const number = Number(value ?? 0n);
  if (!Number.isSafeInteger(number) || number < 0) throw new Error('COURSE_AGGREGATE_OVERFLOW');
  return number;
};
const metrics = (row?: Aggregate) => Object.fromEntries(
  ['students', 'submittedStudents', 'totalRecords', 'validRecords', 'invalidRecords', 'pendingTeacher',
    'pendingSupplement', 'technical', 'pendingAi', 'creditedSeconds'].map(key => [key, count(row?.[key as keyof Aggregate] as bigint | undefined)]));

@Injectable()
export class V81AdminCourseDirectoryService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock) {}
  async get(principal: AuthenticatedPrincipal) {
    return this.prisma.$transaction(async tx => {
      await requireAdminAccess(tx, principal, 'COURSE_VIEW');
      const semester = await tx.semester.findFirst({ where: { organizationId: principal.organizationId, status: 'CURRENT' },
        select: { id: true, displayName: true } });
      const generatedAt = this.clock.now().toISOString();
      if (!semester) return { generatedAt, semester: null, summary: { courses: 0, students: 0, teachers: 0 }, rows: [] };
      const sections = await tx.classSection.findMany({ where: { organizationId: principal.organizationId,
        semesterId: semester.id, status: { in: ['UPCOMING', 'ACTIVE'] } }, include: { teacher: { select: { fullName: true } } },
        orderBy: [{ displayName: 'asc' }, { id: 'asc' }] });
      const aggregates = await tx.$queryRaw<Aggregate[]>`
        SELECT e.class_section_id AS "classSectionId",(e.status='ACTIVE') AS active,
          count(DISTINCT e.student_id) AS students,
          count(DISTINCT e.student_id) FILTER(WHERE r.id IS NOT NULL) AS "submittedStudents",
          count(r.id) AS "totalRecords",count(r.id) FILTER(WHERE w.stage='VALID') AS "validRecords",
          count(r.id) FILTER(WHERE w.stage='INVALID') AS "invalidRecords",
          count(r.id) FILTER(WHERE w.stage='PENDING_TEACHER') AS "pendingTeacher",
          count(r.id) FILTER(WHERE w.stage='AWAITING_SUPPLEMENT') AS "pendingSupplement",
          count(r.id) FILTER(WHERE w.stage='TECHNICAL') AS technical,
          count(r.id) FILTER(WHERE w.stage='PENDING_AI') AS "pendingAi",
          coalesce(sum(CASE WHEN w.stage='VALID' THEN coalesce(p.credited_minutes,0)*60 ELSE 0 END),0)::bigint AS "creditedSeconds"
        FROM enrollments e JOIN class_sections s ON s.id=e.class_section_id
        LEFT JOIN exercise_records r ON r.enrollment_id=e.id AND r.status NOT IN ('DRAFT','CANCELLED')
        LEFT JOIN v81_record_workflows w ON w.record_id=r.id
        LEFT JOIN v81_credit_projections p ON p.record_id=r.id
        WHERE s.organization_id=${principal.organizationId}::uuid AND s.semester_id=${semester.id}::uuid
          AND s.status IN ('UPCOMING','ACTIVE') GROUP BY e.class_section_id,(e.status='ACTIVE')`;
      const members = await tx.enrollment.findMany({ where: { organizationId: principal.organizationId, status: 'ACTIVE',
        classSection: { semesterId: semester.id, status: { in: ['UPCOMING', 'ACTIVE'] } } },
        select: { studentId: true }, distinct: ['studentId'] });
      const rules = await tx.$queryRaw<{ classSectionId: string; course: number; general: number }[]>`
        SELECT class_section_id AS "classSectionId",course_target AS course,general_target AS general
        FROM v81_course_rules WHERE organization_id=${principal.organizationId}::uuid AND published_at IS NOT NULL`;
      const progress = await tx.$queryRaw<{ classSectionId: string; course: bigint; general: bigint; recognizedCourse: bigint; recognizedGeneral: bigint }[]>`
        SELECT e.class_section_id AS "classSectionId",coalesce(x.course,0)::bigint AS course,
          coalesce(x.general,0)::bigint AS general,coalesce(c.course,0)::bigint AS "recognizedCourse",
          coalesce(c.general,0)::bigint AS "recognizedGeneral"
        FROM enrollments e JOIN class_sections s ON s.id=e.class_section_id
        LEFT JOIN LATERAL (SELECT
          sum(p.credited_minutes) FILTER(WHERE r.credit_type='COURSE_RELATED') AS course,
          sum(p.credited_minutes) FILTER(WHERE r.credit_type='GENERAL') AS general
          FROM exercise_records r JOIN v81_record_workflows w ON w.record_id=r.id AND w.stage='VALID'
          JOIN v81_credit_projections p ON p.record_id=r.id
          WHERE r.enrollment_id=e.id AND r.organization_id=e.organization_id) x ON true
        LEFT JOIN LATERAL (SELECT sum(course_minutes) AS course,sum(general_minutes) AS general
          FROM v81_certification_credits WHERE enrollment_id=e.id AND organization_id=e.organization_id AND active=true) c ON true
        WHERE e.organization_id=${principal.organizationId}::uuid AND e.status='ACTIVE'
          AND s.semester_id=${semester.id}::uuid AND s.status IN ('UPCOMING','ACTIVE')`;
      return { generatedAt, semester, summary: { courses: sections.length, students: members.length,
        teachers: new Set(sections.map(section => section.teacherId)).size }, rows: sections.map(section => {
        const rule = rules.find(item => item.classSectionId === section.id);
        const students = progress.filter(item => item.classSectionId === section.id);
        const completedStudents = rule ? students.filter(item =>
          categoryProgress(rule.course, item.course, item.recognizedCourse).remainingSeconds === 0 &&
          categoryProgress(rule.general, item.general, item.recognizedGeneral).remainingSeconds === 0).length : null;
        return { id: section.id, courseName: section.displayName, teacherId: section.teacherId,
          teacherName: section.teacher.fullName, status: section.status, enrollmentOpen: section.isEnrollmentOpen,
          checkInWindowMode: section.checkInWindowMode,
          checkInStartDate: section.checkInStartDate?.toISOString().slice(0, 10) ?? null,
          checkInEndDate: section.checkInEndDate?.toISOString().slice(0, 10) ?? null,
          dailyStartTime: section.dailyStartTime?.toISOString().slice(11, 19) ?? null,
          dailyEndTime: section.dailyEndTime?.toISOString().slice(11, 19) ?? null,
          courseTargetSeconds: rule ? rule.course * 60 : null, generalTargetSeconds: rule ? rule.general * 60 : null,
          currentMembers: metrics(aggregates.find(item => item.classSectionId === section.id && item.active)),
          removedMembers: metrics(aggregates.find(item => item.classSectionId === section.id && !item.active)),
          completedStudents, completionRate: completedStudents !== null && students.length > 0
            ? completedStudents / students.length * 100 : null };
      }) };
    }, { isolationLevel: 'RepeatableRead' });
  }
}
@Controller('admin/course-directory')
export class V81AdminCourseDirectoryController {
  constructor(private readonly service: V81AdminCourseDirectoryService) {}
  @Get() @OperationPolicy('getV81AdminCourseDirectory')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.service.get(principal); }
}
