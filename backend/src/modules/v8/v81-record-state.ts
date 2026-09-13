import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { appendMaterialVersion } from './v81-materials.js';

export async function requiredCourseThreshold(
  transaction: Prisma.TransactionClient,
  classSectionId: string,
  recordId?: string,
): Promise<number> {
  if (recordId) {
    const snapshot = await transaction.$queryRaw<{ minimum_minutes: number }[]>`
      SELECT s.minimum_minutes FROM v81_record_rule_snapshots s
      JOIN exercise_records r ON r.id=s.record_id
      WHERE r.id=${recordId}::uuid AND r.class_section_id=${classSectionId}::uuid`;
    if (snapshot[0]) return snapshot[0].minimum_minutes;
  }
  const rows = await transaction.$queryRaw<{ minimum_minutes: number }[]>`
    SELECT minimum_minutes FROM v81_course_rules WHERE class_section_id = ${classSectionId}::uuid AND published_at IS NOT NULL
  `;
  if (!rows[0])
    throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, {
      reason: 'V81_PUBLISHED_RULES_REQUIRED',
    });
  return rows[0].minimum_minutes;
}

export async function initializeRecordWorkflow(
  transaction: Prisma.TransactionClient,
  input: {
    recordId: string;
    organizationId: string;
    now: Date;
    mediaIds: readonly string[];
    swimDelayReason?: string;
  },
) {
  const manual = await transaction.$queryRaw<{ enabled: boolean }[]>`
    SELECT m.enabled FROM v81_manual_modes m JOIN exercise_records r ON r.class_section_id=m.class_section_id
    WHERE r.id=${input.recordId}::uuid AND m.organization_id=${input.organizationId}::uuid
  `;
  const material = await appendMaterialVersion(transaction, { ...input, materialVersion: 1 });
  // Current release is human-review-first. An explicit course override remains
  // authoritative; an unconfigured course must not strand work at a future AI gate.
  const stage = (manual[0]?.enabled ?? true) || material.forceTeacher ? 'PENDING_TEACHER' : 'PENDING_AI';
  await transaction.$executeRaw`
    INSERT INTO v81_record_workflows(record_id, organization_id, stage, teacher_round_started_at, updated_at)
    VALUES (${input.recordId}::uuid, ${input.organizationId}::uuid, ${stage}, ${stage === 'PENDING_TEACHER' ? input.now : null}, ${input.now})
  `;
}
