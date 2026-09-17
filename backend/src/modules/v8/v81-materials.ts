import {isHistoricalSession} from './v81-history-backfill.js';
import { enqueueAiReview } from './v81-ai-review-store.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';

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
): Promise<{forceTeacher:boolean}> {
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
        bytes > 200n * 1024n * 1024n ||
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
  const historical = await isHistoricalSession(tx, record.sessionId);
  const forceTeacher = historical;
  await tx.$executeRaw`INSERT INTO v81_material_versions(record_id,organization_id,material_version,accepted_at)
    VALUES(${input.recordId}::uuid,${input.organizationId}::uuid,${input.materialVersion},${input.now})`;
  for (const [index, id] of input.mediaIds.entries()) {
    await tx.$executeRaw`INSERT INTO v81_material_items(record_id,material_version,media_id,position)
      VALUES(${input.recordId}::uuid,${input.materialVersion},${id}::uuid,${index + 1})`;
  }
  await enqueueAiReview(tx, input);
  return { forceTeacher };
}
