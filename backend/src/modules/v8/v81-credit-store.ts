import type { Prisma } from '../../generated/prisma/client.js';
import { mondayOf, selectCredits, type CreditCandidate, type CreditRules } from './domain/crediting.js';

export async function recomputeCredits(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  now: Date,
) {
  await tx.$queryRaw`SELECT id FROM enrollments WHERE id=${enrollmentId}::uuid FOR UPDATE`;
  const rules = await tx.$queryRaw<(CreditRules & { organizationId: string })[]>`
    SELECT r.minimum_minutes AS "minimumMinutes",r.weekly_limit AS "weeklyLimit",r.daily_limit AS "dailyLimit",r.course_target AS "courseTarget",r.general_target AS "generalTarget",r.organization_id AS "organizationId"
    FROM v81_course_rules r JOIN enrollments e ON e.class_section_id=r.class_section_id WHERE e.id=${enrollmentId}::uuid AND r.published_at IS NOT NULL`;
  if (!rules[0]) throw new Error('V81_PUBLISHED_RULES_REQUIRED');
  const records = await tx.$queryRaw<
    (Omit<CreditCandidate, 'startedAt' | 'businessDate' | 'actualSeconds'> & {
      startedAt: Date;
      businessDate: Date;
      actualSeconds: bigint;
      ruleVersion: number;
      minimumMinutes: number;
      weeklyLimit: number;
      dailyLimit: number;
    })[]
  >`
    SELECT r.id,r.credit_type AS category,s.started_at AS "startedAt",r.business_date AS "businessDate",r.actual_duration_seconds AS "actualSeconds",
    (w.stage='VALID') AS valid,COALESCE(p.selected,false) AS "previouslySelected",
    snapshot.rule_version AS "ruleVersion", snapshot.minimum_minutes AS "minimumMinutes",
    snapshot.weekly_limit AS "weeklyLimit", snapshot.daily_limit AS "dailyLimit", snapshot.maximum_minutes AS "maximumMinutes"
    FROM exercise_records r JOIN exercise_sessions s ON s.id=r.session_id JOIN v81_record_workflows w ON w.record_id=r.id
    JOIN v81_record_rule_snapshots snapshot ON snapshot.record_id=r.id
    LEFT JOIN v81_credit_projections p ON p.record_id=r.id WHERE r.enrollment_id=${enrollmentId}::uuid`;
  const certifications = await tx.$queryRaw<{ course: bigint; general: bigint }[]>`
    SELECT COALESCE(sum(course_minutes),0)::bigint AS course,COALESCE(sum(general_minutes),0)::bigint AS general
    FROM v81_certification_credits WHERE enrollment_id=${enrollmentId}::uuid AND active=true`;
  const recognized = {
    course: Math.min(rules[0].courseTarget, Number(certifications[0]?.course ?? 0)),
    general: Math.min(rules[0].generalTarget, Number(certifications[0]?.general ?? 0)),
  };
  const candidates = records.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      businessDate: r.businessDate.toISOString().slice(0, 10),
      actualSeconds: Number(r.actualSeconds),
    }));
  // Resolve older rule cohorts first. A new rule cannot displace their credit;
  // their selected records still consume day/week capacity for newer cohorts.
  const reserved = { days: new Map<string, number>(), weeks: new Map<string, number>() };
  let totals = recognized;
  const result = { courseMinutes: recognized.course, generalMinutes: recognized.general,
    totalMinutes: recognized.course + recognized.general,
    records: [] as ReturnType<typeof selectCredits>['records'] };
  for (const version of [...new Set(candidates.map(r => r.ruleVersion))].sort((a,b) => a-b)) {
    const cohort = candidates.filter(r => r.ruleVersion === version);
    const first = cohort[0]!;
    const computed = selectCredits(cohort, { ...rules[0], minimumMinutes: first.minimumMinutes,
      weeklyLimit: first.weeklyLimit, dailyLimit: first.dailyLimit }, totals, reserved);
    result.records.push(...computed.records);
    result.courseMinutes = computed.courseMinutes;
    result.generalMinutes = computed.generalMinutes;
    result.totalMinutes = computed.totalMinutes;
    totals = { course: computed.courseMinutes, general: computed.generalMinutes };
    for (const item of computed.records.filter(r => r.selected)) {
      const date = cohort.find(r => r.id === item.id)!.businessDate;
      const week = mondayOf(date);
      reserved.days.set(date, (reserved.days.get(date) ?? 0) + 1);
      reserved.weeks.set(week, (reserved.weeks.get(week) ?? 0) + 1);
    }
  }
  for (const item of result.records)
    await tx.$executeRaw`
    INSERT INTO v81_credit_projections(record_id,organization_id,eligible_minutes,credited_minutes,selected,reason,updated_at)
    VALUES(${item.id}::uuid,${rules[0].organizationId}::uuid,${item.eligibleMinutes},${item.creditedMinutes},${item.selected},${item.reason},${now})
    ON CONFLICT(record_id) DO UPDATE SET eligible_minutes=EXCLUDED.eligible_minutes,credited_minutes=EXCLUDED.credited_minutes,selected=EXCLUDED.selected,reason=EXCLUDED.reason,version=v81_credit_projections.version+1,updated_at=EXCLUDED.updated_at`;
  return { ...result, recognized };
}
