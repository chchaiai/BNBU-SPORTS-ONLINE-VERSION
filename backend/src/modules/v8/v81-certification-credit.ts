import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { recomputeCredits } from './v81-credit-store.js';

export async function approveCertificationCredit(
  tx: Prisma.TransactionClient,
  input: {
    applicationId: string;
    enrollmentId: string;
    organizationId: string;
    actorId: string;
    requestId: string;
    eventId: string;
    version: number;
    courseMinutes: number | undefined;
    generalMinutes: number | undefined;
    reason: string;
    now: Date;
    eventType?: 'APPROVED' | 'ADJUSTED' | 'FACT_CORRECTED';
  },
) {
  const course = input.courseMinutes,
    general = input.generalMinutes;
  if (
    !Number.isInteger(course) ||
    !Number.isInteger(general) ||
    course! < 0 ||
    general! < 0 ||
    course! + general! > 2147483647
  )
    throw new ApplicationError('VALIDATION_FAILED', 422, {
      reason: 'RECOGNITION_ALLOCATION_REQUIRED',
    });
  await tx.$queryRaw`SELECT id FROM enrollments WHERE id=${input.enrollmentId}::uuid FOR UPDATE`;
  const rules = await tx.$queryRaw<
    { course_target: number; general_target: number }[]
  >`SELECT r.course_target,r.general_target FROM v81_course_rules r JOIN enrollments e ON e.class_section_id=r.class_section_id WHERE e.id=${input.enrollmentId}::uuid AND r.published_at IS NOT NULL`;
  const other = await tx.$queryRaw<
    { course: bigint; general: bigint }[]
  >`SELECT coalesce(sum(course_minutes),0)::bigint AS course,coalesce(sum(general_minutes),0)::bigint AS general FROM v81_certification_credits WHERE enrollment_id=${input.enrollmentId}::uuid AND application_id<>${input.applicationId}::uuid AND active=true`;
  if (
    !rules[0] ||
    course! + Number(other[0]?.course ?? 0) > rules[0].course_target ||
    general! + Number(other[0]?.general ?? 0) > rules[0].general_target
  )
    throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'RECOGNITION_TARGET_EXCEEDED' });
  await tx.$executeRaw`INSERT INTO v81_certification_credits(application_id,enrollment_id,organization_id,course_minutes,general_minutes,active,version)
    VALUES(${input.applicationId}::uuid,${input.enrollmentId}::uuid,${input.organizationId}::uuid,${course!},${general!},true,1)
    ON CONFLICT(application_id) DO UPDATE SET course_minutes=EXCLUDED.course_minutes,general_minutes=EXCLUDED.general_minutes,active=true,version=v81_certification_credits.version+1`;
  await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
    VALUES(${input.eventId}::uuid,${input.organizationId}::uuid,'CERTIFICATION_CREDIT',${input.applicationId}::uuid,${input.eventType??'APPROVED'},${input.actorId}::uuid,${input.requestId},${input.version},${JSON.stringify({ courseSeconds: course! * 60, generalSeconds: general! * 60, reason: input.reason, active: true, ...(input.eventType === 'FACT_CORRECTED' ? { correctionReason: input.reason } : {}) })}::jsonb,${input.now},'SUCCEEDED')`;
  return recomputeCredits(tx, input.enrollmentId, input.now);
}
