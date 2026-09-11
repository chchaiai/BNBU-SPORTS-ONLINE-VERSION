import { Injectable, Logger, type OnApplicationBootstrap, type OnModuleDestroy } from '@nestjs/common';
import type { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../../common/database/prisma.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { categoryProgress } from './domain/progress-accounting.js';
import { V81SettlementCheckService } from './v81-settlement-check.js';
import { appendV81SystemEvent } from './v81-system-event.js';

const leadMs = 14 * 86400000;
export function courseReminderDue(publishedAt: Date, deadline: Date, now: Date) {
  return now >= publishedAt && now.getTime() >= deadline.getTime() - leadMs && now < deadline;
}
@Injectable()
export class V81CourseRemindersService {
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock,
    private readonly ids: IdGenerator, private readonly settlement: V81SettlementCheckService) {}
  async process(organizationId: string, classId: string, after: string | null = null) {
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${organizationId}::uuid FOR NO KEY UPDATE`;
      await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${classId}::uuid AND organization_id=${organizationId}::uuid FOR UPDATE`;
      return this.processInTransaction(tx, organizationId, classId, after);
    }, { timeout: 30000 });
  }
  async processInTransaction(tx: Prisma.TransactionClient, organizationId: string, classId: string, after: string | null = null) {
    const now = this.clock.now();
    if ((await tx.systemPolicy.findUnique({ where: { organizationId } }))?.systemMode !== 'NORMAL') return null;
    const section = await tx.classSection.findFirst({ where: { id: classId, organizationId, semester: { status: 'CURRENT' } },
      include: { teacher: { include: { user: true } }, organization: true } });
    if (!section) return null;
    const rule = (await tx.$queryRaw<{ course_target: number; general_target: number; version: number; published_at: Date | null; regular_deadline: Date }[]>`
      SELECT course_target,general_target,version,published_at,regular_deadline FROM v81_course_rules WHERE class_section_id=${classId}::uuid AND organization_id=${organizationId}::uuid`)[0];
    if (!rule?.published_at || !courseReminderDue(rule.published_at, rule.regular_deadline, now)) return null;
    const deadline = new Intl.DateTimeFormat('en-GB', { timeZone: section.organization.timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(rule.regular_deadline) + ` (${section.organization.timezone})`;
    const write = async (userId: string, targetType: string, targetId: string, remaining: number | null, pendingKinds: number, facts: Record<string, unknown>) => {
      const english = (await tx.userPreference.findUnique({ where: { userId } }))?.locale === 'en';
      const id = this.ids.next();
      const body = remaining === null
        ? (english ? `Regular deadline: ${deadline}. ${pendingKinds} categories of teaching work need attention.` : `常规截止：${deadline}。有 ${pendingKinds} 类教学待办需要处理。`)
        : (english ? `Regular deadline: ${deadline}. Remaining target: ${remaining} minutes. Pending records/applications: ${pendingKinds}.`
          : `常规截止：${deadline}。剩余目标 ${remaining} 分钟，待处理记录及申请 ${pendingKinds} 项。`);
      const inserted = await tx.$queryRaw<{ id: string }[]>`INSERT INTO notifications(id,organization_id,recipient_user_id,notification_type,title,body,target_type,target_id,created_at,version)
        VALUES(${id}::uuid,${organizationId}::uuid,${userId}::uuid,'COURSE_DEADLINE_REMINDER',${english ? 'Course deadline reminder' : '课程截止提醒'},${body},${targetType},${targetId}::uuid,${now},1)
        ON CONFLICT DO NOTHING RETURNING id`;
      if (inserted.length) await appendV81SystemEvent(tx, { organizationId, resourceType: 'COURSE_REMINDER', resourceId: id,
        eventType: 'CREATED', requestId: this.ids.next(), version: 1, occurredAt: now, outcome: 'SUCCEEDED',
        facts: { classSectionId: classId, ruleVersion: rule.version, deadline: rule.regular_deadline.toISOString(), evaluatedAt: now.toISOString(), ...facts } });
    };
    if (!after && section.teacher.user.status === 'ACTIVE' && !section.teacher.user.deletedAt) {
      const check = await this.settlement.checkInTransaction(tx, organizationId, classId);
      const blocked = check.checks.filter(c => c.status === 'BLOCKED' && (c.count ?? 0) > 0);
      if (blocked.length) await write(section.teacher.userId, 'CLASS_SECTION', classId, null, blocked.length, { checks: blocked });
    }
    const members = await tx.enrollment.findMany({ where: { organizationId, classSectionId: classId, status: 'ACTIVE',
      student: { status: 'ACTIVE', deletedAt: null, user: { status: 'ACTIVE', deletedAt: null } }, ...(after ? { id: { gt: after } } : {}) },
      include: { student: true }, orderBy: { id: 'asc' }, take: 101 });
    for (const member of members.slice(0, 100)) {
      const totals = (await tx.$queryRaw<{ course: bigint; general: bigint; course_cert: bigint; general_cert: bigint; pending: bigint }[]>`
        SELECT coalesce(sum(p.credited_minutes) FILTER(WHERE w.stage='VALID' AND r.credit_type='COURSE_RELATED'),0)::bigint AS course,
          coalesce(sum(p.credited_minutes) FILTER(WHERE w.stage='VALID' AND r.credit_type='GENERAL'),0)::bigint AS general,
          (SELECT coalesce(sum(course_minutes),0)::bigint FROM v81_certification_credits WHERE enrollment_id=${member.id}::uuid AND active=true) AS course_cert,
          (SELECT coalesce(sum(general_minutes),0)::bigint FROM v81_certification_credits WHERE enrollment_id=${member.id}::uuid AND active=true) AS general_cert,
          count(*) FILTER(WHERE r.id IS NOT NULL AND (w.stage IS NULL OR w.stage NOT IN ('VALID','INVALID'))) +
            (SELECT count(*) FROM exemption_applications WHERE enrollment_id=${member.id}::uuid AND status IN ('SUBMITTED','SUPPLEMENT_REQUIRED')) AS pending
        FROM exercise_records r LEFT JOIN v81_record_workflows w ON w.record_id=r.id LEFT JOIN v81_credit_projections p ON p.record_id=r.id
        WHERE r.enrollment_id=${member.id}::uuid AND r.organization_id=${organizationId}::uuid`)[0]!;
      const course = categoryProgress(rule.course_target, totals.course, totals.course_cert);
      const general = categoryProgress(rule.general_target, totals.general, totals.general_cert);
      const remaining = (course.remainingSeconds + general.remainingSeconds) / 60;
      if (remaining > 0 || totals.pending > 0n) await write(member.student.userId, 'ENROLLMENT', member.id, remaining, Number(totals.pending), { course, general, pending: Number(totals.pending) });
    }
    return members.length > 100 ? members[99]!.id : null;
  }
}
@Injectable()
export class V81CourseReminderWorker implements OnApplicationBootstrap, OnModuleDestroy {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private cursor: string | null = null;
  private pending: { id: string; organization_id: string; after: string } | null = null;
  private readonly logger = new Logger(V81CourseReminderWorker.name);
  constructor(private readonly prisma: PrismaService, private readonly clock: Clock, private readonly reminders: V81CourseRemindersService) {}
  onApplicationBootstrap() { this.timer = setInterval(() => void this.tick(), 5000); this.timer.unref(); }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); this.timer = null; }
  async tick() {
    if (this.running) return;
    this.running = true;
    let processingId: string | null = null;
    try {
      const now = this.clock.now();
      const item = this.pending ?? (await this.prisma.$queryRaw<{ id: string; organization_id: string }[]>`
        SELECT c.id,c.organization_id FROM class_sections c JOIN v81_course_rules r ON r.class_section_id=c.id JOIN semesters s ON s.id=c.semester_id
        WHERE s.status='CURRENT' AND r.published_at IS NOT NULL AND r.published_at<=${now} AND r.regular_deadline>${now}
          AND r.regular_deadline<=${new Date(now.getTime() + leadMs)} AND (${this.cursor}::uuid IS NULL OR c.id>${this.cursor}::uuid)
        ORDER BY c.id LIMIT 1`)[0];
      if (!item) { this.cursor = null; return; }
      processingId = item.id;
      const after = await this.reminders.process(item.organization_id, item.id, this.pending?.after ?? null);
      this.pending = after ? { ...item, after } : null;
      if (!after) this.cursor = item.id;
    } catch {
      if (processingId) { this.cursor = processingId; this.pending = null; }
      this.logger.error('Course reminder scan failed; unfinished work will retry without duplicate notifications.');
    }
    finally { this.running = false; }
  }
}
