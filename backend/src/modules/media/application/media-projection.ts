import type { MediaEvidence } from '../../../generated/prisma/client.js';

export interface MediaEvidenceProjection {
  id: string;
  organizationId: string;
  ownerStudentId: string;
  sessionId: string | null;
  enrollmentId: string | null;
  recordId: string | null;
  businessPurpose: string;
  mediaType: string;
  declaredMimeType: string;
  verifiedMimeType: string | null;
  declaredFileSizeBytes: number;
  verifiedFileSizeBytes: number | null;
  captureSource: string;
  uploadStatus: string;
  uploadedAt: string | null;
  boundAt: string | null;
  declaredContentSha256: string | null;
  verifiedContentSha256: string | null;
  declaredDurationSeconds: number | null;
  verifiedDurationSeconds: number | null;
  version: number;
}

function safeNumber(value: bigint | null): number | null {
  if (value === null) return null;
  const number = Number(value);
  if (!Number.isSafeInteger(number)) throw new Error('Media byte size exceeds safe JSON integer');
  return number;
}

export function mediaProjection(
  media: MediaEvidence & { recordAssociation?: { recordId: string } | null },
): MediaEvidenceProjection {
  return {
    id: media.id,
    organizationId: media.organizationId,
    ownerStudentId: media.ownerStudentId,
    sessionId: media.sessionId,
    enrollmentId: media.enrollmentId,
    recordId: media.recordAssociation?.recordId ?? null,
    businessPurpose: media.businessPurpose,
    mediaType: media.mediaType,
    declaredMimeType: media.declaredMimeType,
    verifiedMimeType: media.verifiedMimeType,
    declaredFileSizeBytes: safeNumber(media.declaredFileSizeBytes) ?? 0,
    verifiedFileSizeBytes: safeNumber(media.verifiedFileSizeBytes),
    captureSource: media.captureSource,
    uploadStatus: media.uploadStatus,
    uploadedAt: media.uploadedAt?.toISOString() ?? null,
    boundAt: media.boundAt?.toISOString() ?? null,
    declaredContentSha256: media.declaredContentSha256,
    verifiedContentSha256: media.verifiedContentSha256,
    declaredDurationSeconds: media.declaredDurationSeconds,
    verifiedDurationSeconds: media.verifiedDurationSeconds,
    version: media.version,
  };
}
