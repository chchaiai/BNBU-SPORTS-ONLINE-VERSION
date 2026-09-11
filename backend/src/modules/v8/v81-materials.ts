import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { readSwimTransfer } from './v81-swim-transfer.js';

export async function appendMaterialVersion(
  tx: Prisma.TransactionClient,
  input: {
    recordId: string;
    organizationId: string;
    mediaIds: readonly string[];
    materialVersion: 1 | 2;
    now: Date;
    swimDelayReason?: string;
  },
) {
  if (
    input.mediaIds.length < 1 ||
    input.mediaIds.length > 7 ||
    new Set(input.mediaIds).size !== input.mediaIds.length
  ) {
    throw new ApplicationError('MEDIA_COUNT_LIMIT_EXCEEDED', 422);
  }
  const record = await tx.exerciseRecord.findFirst({
    where: { id: input.recordId, organizationId: input.organizationId },
  });
  if (!record) throw new ApplicationError('EXERCISE_RECORD_NOT_FOUND', 404);
  const media = await tx.mediaEvidence.findMany({
    where: {
      id: { in: [...input.mediaIds] },
      organizationId: input.organizationId,
      ownerStudentId: record.studentId,
      sessionId: record.sessionId,
      businessPurpose: 'EXERCISE_RECORD',
      uploadStatus: 'AVAILABLE',
    },
  });
  if (media.length !== input.mediaIds.length)
    throw new ApplicationError('MEDIA_NOT_AVAILABLE', 409);
  let images = 0,
    videos = 0,
    size = 0n;
  for (const item of media) {
    const bytes = item.verifiedFileSizeBytes;
    if (bytes === null || bytes <= 0n || !item.verifiedContentSha256)
      throw new ApplicationError('MEDIA_NOT_AVAILABLE', 409);
    size += bytes;
    if (item.mediaType === 'IMAGE') {
      images++;
      if (
        !['image/jpeg', 'image/png'].includes(item.verifiedMimeType ?? '') ||
        bytes > 10n * 1024n * 1024n
      ) {
        throw new ApplicationError('MEDIA_TYPE_NOT_ALLOWED', 415);
      }
    } else if (item.mediaType === 'VIDEO') {
      videos++;
      if (
        item.verifiedMimeType !== 'video/mp4' ||
        bytes > 100n * 1024n * 1024n ||
        item.verifiedDurationSeconds === null ||
        item.verifiedDurationSeconds < 1 ||
        item.verifiedDurationSeconds > 15
      ) {
        throw new ApplicationError('MEDIA_TYPE_NOT_ALLOWED', 415);
      }
      // AVAILABLE is produced only after MediaValidator verifies the audio/video tracks.
    } else throw new ApplicationError('MEDIA_TYPE_NOT_ALLOWED', 415);
  }
  if (images > 6 || videos > 1 || size > 250n * 1024n * 1024n)
    throw new ApplicationError('MEDIA_COUNT_LIMIT_EXCEEDED', 422);
  let forceTeacher = false;
  if (record.sportType !== 'SWIMMING' && input.swimDelayReason?.trim())
    throw new ApplicationError('VALIDATION_FAILED', 422);
  if (record.sportType === 'SWIMMING') {
    const intakes = await tx.$queryRaw<{ intake_kind: string }[]>`
      SELECT intake_kind FROM v81_swim_intakes WHERE record_id=${record.id}::uuid AND organization_id=${input.organizationId}::uuid`;
    const intake = intakes[0];
    if (!intake) throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'SWIM_INTAKE_REQUIRED' });
    const batch = await tx.$queryRaw<{ media_id: string; phase: string; content_sha256: string }[]>`
      SELECT media_id,phase,content_sha256 FROM v81_swim_intake_items WHERE record_id=${record.id}::uuid`;
    const selected = new Set(input.mediaIds);
    if (images < 2 || !batch.some((item) => item.phase === 'BEFORE' && selected.has(item.media_id)) ||
        !batch.some((item) => item.phase === 'AFTER' && selected.has(item.media_id)))
      throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'SWIM_ORIGINAL_BEFORE_AFTER_REQUIRED' });
    if (input.materialVersion === 1 && (batch.length !== selected.size || batch.some((item) => !selected.has(item.media_id))))
      throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'SWIM_LOCKED_BATCH_MISMATCH' });
    for (const item of media) {
      const frozen = batch.find((entry) => entry.media_id === item.id);
      if (frozen && frozen.content_sha256 !== item.verifiedContentSha256)
        throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'SWIM_LOCKED_CONTENT_MISMATCH' });
    }
    forceTeacher = intake.intake_kind === 'OFFLINE_DELAYED';
    if (input.materialVersion === 1) {
      const transfer = await readSwimTransfer(tx, record.id, input.now);
      if (!transfer?.completedAt || !transfer.readyForReview)
        throw new ApplicationError('MEDIA_NOT_AVAILABLE', 409);
      if (transfer.transferLate) {
        if (transfer.completedAt.getTime() > transfer.sessionEndedAt.getTime() + 86400000)
          throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'SWIM_DELAY_WINDOW_EXPIRED' });
        if (!input.swimDelayReason?.trim())
          throw new ApplicationError('VALIDATION_FAILED', 422, { reason: 'SWIM_DELAY_REASON_REQUIRED' });
        forceTeacher = true;
      }
      if (input.swimDelayReason?.trim()) forceTeacher = true;
    }
  }
  await tx.$executeRaw`INSERT INTO v81_material_versions(record_id,organization_id,material_version,accepted_at)
    VALUES(${input.recordId}::uuid,${input.organizationId}::uuid,${input.materialVersion},${input.now})`;
  for (const [index, id] of input.mediaIds.entries()) {
    await tx.$executeRaw`INSERT INTO v81_material_items(record_id,material_version,media_id,position)
      VALUES(${input.recordId}::uuid,${input.materialVersion},${id}::uuid,${index + 1})`;
  }
  return { forceTeacher };
}
