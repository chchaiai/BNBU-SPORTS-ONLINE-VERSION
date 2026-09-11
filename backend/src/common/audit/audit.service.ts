import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import type { UserRole } from '../http/request-context.js';
import { SecureDigestService } from '../security/secure-digest.service.js';
import { Clock } from '../time/clock.js';
import { IdGenerator } from '../time/id-generator.js';
import { ApplicationError } from '../errors/application-error.js';

const FOUNDATION_METADATA_ALLOWLIST = {
  CLIENT_ERROR_REPORTED: new Set(['reportedByClient', 'platform', 'category', 'errorCode', 'retryable', 'httpStatus', 'method']),
  AUTHENTICATION_SUCCEEDED: new Set(['credentialType']),
  AUTHENTICATION_FAILED: new Set(['credentialType']),
  AUTH_SESSION_REVOKED: new Set(['revokeSource']),
  USER_PROFILE_UPDATED: new Set(['changedFields']),
  USER_STATUS_CHANGED: new Set(['previousStatus', 'nextStatus']),
  COURSE_CREATED: new Set(['changedFields']),
  COURSE_UPDATED: new Set(['changedFields']),
  COURSE_STATUS_CHANGED: new Set(['changedFields', 'previousStatus', 'nextStatus']),
  CLASS_SECTION_CREATED: new Set(['changedFields']),
  CLASS_SECTION_UPDATED: new Set(['changedFields']),
  CLASS_SECTION_CLOSED: new Set(['changedFields', 'previousStatus', 'nextStatus']),
  COURSE_INVITE_CHANGED: new Set(['classSectionId']),
  ENROLLMENT_CREATED: new Set(['classSectionId', 'source']),
  ENROLLMENT_STATUS_CHANGED: new Set([
    'classSectionId',
    'previousStatus',
    'nextStatus',
    'reasonCode',
  ]),
  ROSTER_IMPORTED: new Set([
    'classSectionId',
    'versionNumber',
    'totalRowCount',
    'validRowCount',
    'invalidRowCount',
    'duplicatedRowCount',
  ]),
  ROSTER_ALIGNED: new Set([
    'classSectionId',
    'rosterImportId',
    'comparisonRevision',
    'resultCount',
  ]),
  ROSTER_RESOLUTION_CHANGED: new Set([
    'classSectionId',
    'previousStatus',
    'nextStatus',
    'action',
    'evidenceType',
  ]),
  ROSTER_VERSION_ROLLED_BACK: new Set([
    'classSectionId',
    'previousRosterImportId',
    'currentRosterImportId',
  ]),
  EXERCISE_SESSION_STARTED: new Set([
    'classSectionId',
    'nextStatus',
    'actualDurationSeconds',
    'pausedDurationSeconds',
  ]),
  EXERCISE_SESSION_PAUSED: new Set([
    'classSectionId',
    'previousStatus',
    'nextStatus',
    'actualDurationSeconds',
    'pausedDurationSeconds',
  ]),
  EXERCISE_SESSION_RESUMED: new Set([
    'classSectionId',
    'previousStatus',
    'nextStatus',
    'actualDurationSeconds',
    'pausedDurationSeconds',
  ]),
  EXERCISE_SESSION_COMPLETED: new Set([
    'classSectionId',
    'previousStatus',
    'nextStatus',
    'actualDurationSeconds',
    'pausedDurationSeconds',
    'endReason',
  ]),
  EXERCISE_SESSION_CANCELLED: new Set([
    'classSectionId',
    'previousStatus',
    'nextStatus',
    'actualDurationSeconds',
    'pausedDurationSeconds',
    'endReason',
  ]),
  EXERCISE_SESSION_RECONCILED: new Set([
    'classSectionId',
    'previousStatus',
    'nextStatus',
    'acceptedEventCount',
    'rejectedEventCount',
  ]),
  EXERCISE_RECORD_DRAFT_CREATED: new Set(['classSectionId', 'sessionId', 'nextStatus']),
  EXERCISE_RECORD_DRAFT_UPDATED: new Set([
    'classSectionId',
    'sessionId',
    'previousStatus',
    'nextStatus',
    'changedFields',
  ]),
  EXERCISE_RECORD_SUBMITTED: new Set([
    'classSectionId',
    'sessionId',
    'previousStatus',
    'nextStatus',
    'mediaCount',
    'creditedDurationSeconds',
  ]),
  EXERCISE_RECORD_DISCARDED: new Set([
    'classSectionId',
    'sessionId',
    'previousStatus',
    'nextStatus',
    'reasonCode',
  ]),
  REVIEW_RESULT_CHANGED: new Set([
    'recordId',
    'reviewId',
    'reviewVersion',
    'recordVersion',
    'previousResult',
    'nextResult',
    'reasonCode',
  ]),
  SCORE_RULE_CHANGED: new Set(['classSectionId', 'status']),
  SCORE_RECALCULATED: new Set(['classSectionId', 'calculationRevision']),
  SCORE_ADJUSTED: new Set(['classSectionId', 'status']),
  SCORE_PUBLISHED: new Set(['classSectionId', 'calculationRevision']),
  SCORE_LOCKED: new Set(['classSectionId', 'calculationRevision']),
  MEDIA_UPLOAD_INITIATED: new Set([
    'sessionId',
    'enrollmentId',
    'businessPurpose',
    'mediaType',
    'nextStatus',
  ]),
  MEDIA_UPLOAD_CONFIRMED: new Set([
    'sessionId',
    'enrollmentId',
    'businessPurpose',
    'mediaType',
    'previousStatus',
    'nextStatus',
  ]),
  MEDIA_BOUND: new Set([
    'sessionId',
    'enrollmentId',
    'businessPurpose',
    'mediaType',
    'previousStatus',
    'nextStatus',
  ]),
  MEDIA_PROCESSING_CHANGED: new Set([
    'sessionId',
    'enrollmentId',
    'businessPurpose',
    'mediaType',
    'previousStatus',
    'nextStatus',
    'resultCode',
  ]),
  MEDIA_ACCESSED: new Set(['sessionId', 'enrollmentId', 'businessPurpose', 'mediaType', 'purpose']),
  AUTH_CHALLENGE_ISSUED: new Set(['challengePurpose', 'deliveryChannel']),
  AUTH_CREDENTIAL_RECOVERED: new Set(['requestedRole']),
  NOTIFICATION_CREATED: new Set(['notificationType']),
  NOTIFICATION_READ: new Set([]),
  PUSH_DEVICE_REGISTERED: new Set(['platform']),
  PUSH_DEVICE_UNREGISTERED: new Set([]),
  USER_PREFERENCES_UPDATED: new Set(['changedFields']),
  FEEDBACK_CREATED: new Set(['category']),
  EXEMPTION_APPLICATION_CHANGED: new Set(['previousStatus', 'nextStatus', 'classSectionId']),
  LOCATION_POLICY_CHANGED: new Set(['policyVersion', 'collectionEnabled']),
  LOCATION_CONSENT_CHANGED: new Set(['policyVersion', 'nextStatus', 'reasonCode']),
  LOCATION_TRACK_CHANGED: new Set([
    'policyVersion',
    'previousStatus',
    'nextStatus',
    'acceptedSampleCount',
    'rejectedSampleCount',
    'reasonCode',
  ]),
  LOCATION_RETENTION_APPLIED: new Set(['policyVersion', 'dataClass', 'deletedRowCount']),
  SYSTEM_MODE_CHANGED: new Set(['previousMode', 'nextMode']),
  AUDIT_LOG_READ: new Set(['readKind', 'resultCount']),
} as const;

const SENSITIVE_METADATA_KEY =
  /(?:token|authorization|cookie|password|secret|database.?url|storage.?key|signed.?url|evidence|internal.?note|student.?number|email|phone|request.?body|stack|sql|constraint)/iu;

function sanitizeMetadataValue(value: unknown, depth: number): unknown {
  if (depth > 5) return '[REDACTED]';
  if (value === null || typeof value === 'boolean' || typeof value === 'number') return value;
  if (typeof value === 'string') return value.length <= 500 ? value : `${value.slice(0, 500)}…`;
  if (Array.isArray(value)) {
    return value.slice(0, 50).map((item) => sanitizeMetadataValue(item, depth + 1));
  }
  if (typeof value !== 'object') return '[REDACTED]';
  const record = value as Record<string, unknown>;
  return Object.fromEntries(
    Object.entries(record)
      .slice(0, 50)
      .map(([key, nested]) => [
        key,
        SENSITIVE_METADATA_KEY.test(key) ? '[REDACTED]' : sanitizeMetadataValue(nested, depth + 1),
      ]),
  );
}

export function projectSafeAuditMetadata(
  actionType: string,
  metadata: unknown,
): Record<string, unknown> {
  if (!Object.hasOwn(FOUNDATION_METADATA_ALLOWLIST, actionType)) return {};
  if (typeof metadata !== 'object' || metadata === null || Array.isArray(metadata)) return {};
  const allowed = FOUNDATION_METADATA_ALLOWLIST[actionType as FoundationAuditAction];
  return Object.fromEntries(
    Object.entries(metadata as Record<string, unknown>)
      .filter(([key]) => (allowed as ReadonlySet<string>).has(key))
      .map(([key, value]) => [key, sanitizeMetadataValue(value, 0)]),
  );
}

export type FoundationAuditAction = keyof typeof FOUNDATION_METADATA_ALLOWLIST;

export interface AppendAuditInput {
  organizationId: string;
  actorUserId: string | null;
  actorRoleSnapshot: UserRole | null;
  permissionId: string;
  actionType: FoundationAuditAction;
  targetType: string;
  targetId: string | null;
  requestId: string;
  idempotencyKeyReference?: string | null;
  outcome: 'SUCCEEDED' | 'REJECTED' | 'FAILED';
  reasonCode?: string | null;
  safeMetadata?: Record<string, unknown>;
  sourceIp?: string;
  deviceFingerprint?: string;
}

@Injectable()
export class AuditService {
  constructor(
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
    private readonly digest: SecureDigestService,
  ) {}

  async append(transaction: Prisma.TransactionClient, input: AppendAuditInput): Promise<void> {
    const allowedKeys = FOUNDATION_METADATA_ALLOWLIST[input.actionType];
    const metadata = input.safeMetadata ?? {};
    for (const key of Object.keys(metadata)) {
      if (!(allowedKeys as ReadonlySet<string>).has(key)) {
        throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
          invariant: 'AUDIT_METADATA_KEY_NOT_ALLOWLISTED',
          actionType: input.actionType,
          metadataKey: key,
        });
      }
    }

    await transaction.auditLog.create({
      data: {
        id: this.idGenerator.next(),
        organizationId: input.organizationId,
        actorUserId: input.actorUserId,
        actorRoleSnapshot: input.actorRoleSnapshot,
        permissionId: input.permissionId,
        actionType: input.actionType,
        targetType: input.targetType,
        targetId: input.targetId,
        requestId: input.requestId,
        idempotencyKeyReference: input.idempotencyKeyReference ?? null,
        outcome: input.outcome,
        reasonCode: input.reasonCode ?? null,
        safeMetadata: metadata as Prisma.InputJsonValue,
        sourceIpHash:
          input.sourceIp === undefined
            ? null
            : this.digest.digest('audit-source-ip', input.sourceIp),
        deviceFingerprintHash:
          input.deviceFingerprint === undefined
            ? null
            : this.digest.digest('audit-device-fingerprint', input.deviceFingerprint),
        occurredAt: this.clock.now(),
      },
    });
  }
}
