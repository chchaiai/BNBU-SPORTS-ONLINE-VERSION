import type { Prisma } from '../../generated/prisma/client.js';
import { selectCredits, type CreditCandidate, type CreditRules } from './domain/crediting.js';

export async function recomputeCredits(
  tx: Prisma.TransactionClient,
  enrollmentId: string,
  now: Date,
) {
  await tx.$queryRaw`SELECT id FROM enrollments WHERE id=${enrollmentId}::uuid FOR UPDATE`;
  const rules = await tx.$queryRaw<(CreditRules & { organizationId: string })[]>`
    SELECT r.minimum_minutes AS "minimumMinutes",r.weekly_limit AS "weeklyLimit",r.course_target AS "courseTarget",r.general_target AS "generalTarget",r.organization_id AS "organizationId"
    FROM v81_course_rules r JOIN enrollments e ON e.class_section_id=r.class_section_id WHERE e.id=${enrollmentId}::uuid AND r.published_at IS NOT NULL`;
  if (!rules[0]) throw new Error('V81_PUBLISHED_RULES_REQUIRED');
  const records = await tx.$queryRaw<
    (Omit<CreditCandidate, 'startedAt' | 'businessDate' | 'actualSeconds'> & {
      startedAt: Date;
      businessDate: Date;
      actualSeconds: bigint;
    })[]
  >`
    SELECT r.id,r.credit_type AS category,s.started_at AS "startedAt",r.business_date AS "businessDate",r.actual_duration_seconds AS "actualSeconds",
    (w.stage='VALID') AS valid,COALESCE(p.selected,false) AS "previouslySelected"
    FROM exercise_records r JOIN exercise_sessions s ON s.id=r.session_id JOIN v81_record_workflows w ON w.record_id=r.id
    LEFT JOIN v81_credit_projections p ON p.record_id=r.id WHERE r.enrollment_id=${enrollmentId}::uuid`;
  const certifications = await tx.$queryRaw<{ course: bigint; general: bigint }[]>`
    SELECT COALESCE(sum(course_minutes),0)::bigint AS course,COALESCE(sum(general_minutes),0)::bigint AS general
    FROM v81_certification_credits WHERE enrollment_id=${enrollmentId}::uuid AND active=true`;
  const recognized = {
    course: Math.min(rules[0].courseTarget, Number(certifications[0]?.course ?? 0)),
    general: Math.min(rules[0].generalTarget, Number(certifications[0]?.general ?? 0)),
  };
  const result = selectCredits(
    records.map((r) => ({
      ...r,
      startedAt: r.startedAt.toISOString(),
      businessDate: r.businessDate.toISOString().slice(0, 10),
      actualSeconds: Number(r.actualSeconds),
    })),
    rules[0],
    recognized,
  );
  for (const item of result.records)
    await tx.$executeRaw`
    INSERT INTO v81_credit_projections(record_id,organization_id,eligible_minutes,credited_minutes,selected,reason,updated_at)
    VALUES(${item.id}::uuid,${rules[0].organizationId}::uuid,${item.eligibleMinutes},${item.creditedMinutes},${item.selected},${item.reason},${now})
    ON CONFLICT(record_id) DO UPDATE SET eligible_minutes=EXCLUDED.eligible_minutes,credited_minutes=EXCLUDED.credited_minutes,selected=EXCLUDED.selected,reason=EXCLUDED.reason,version=v81_credit_projections.version+1,updated_at=EXCLUDED.updated_at`;
  return { ...result, recognized };
}
