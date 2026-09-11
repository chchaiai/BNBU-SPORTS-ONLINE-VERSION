import { ERROR_HTTP_STATUS } from './error-http-status.js';

export interface PublicErrorDetails {
  fieldErrors?: unknown[];
  resourceType?: string;
  resourceId?: string;
  currentState?: string;
  allowedActions?: string[];
  expectedVersion?: number;
  actualVersion?: number;
  retryAfterSeconds?: number;
  idempotencyKey?: string;
  itemErrors?: unknown[];
  migrationReference?: string;
}

export interface ErrorDetails extends PublicErrorDetails {
  invariant?: string;
  dependency?: string;
  category?: string;
  source?: string;
  resource?: string;
  field?: string;
  currentVersion?: number | null;
  capability?: string;
  platform?: string;
  reason?: string;
  alignmentRunId?: string;
  rosterImportId?: string;
  failureCode?: string | null;
  actionType?: string;
  operationId?: string;
  requiredStatus?: string;
  missingParameters?: readonly string[];
  invalidParameters?: readonly string[];
  metadataKey?: string;
}

export function publicErrorDetails(details: ErrorDetails): PublicErrorDetails {
  const actualVersion = details.actualVersion ?? details.currentVersion ?? undefined;
  const itemErrors = details.itemErrors?.map((item) => {
    if (item === null || typeof item !== 'object' || Array.isArray(item)) return item;
    const entry = item as Record<string, unknown>;
    const nested = entry.details;
    return {
      ...entry,
      ...(nested !== null && typeof nested === 'object' && !Array.isArray(nested)
        ? { details: publicErrorDetails(nested) }
        : {}),
    };
  });
  return {
    ...(details.fieldErrors === undefined ? {} : { fieldErrors: details.fieldErrors }),
    ...(details.resourceType === undefined ? {} : { resourceType: details.resourceType }),
    ...(details.resourceId === undefined ? {} : { resourceId: details.resourceId }),
    ...(details.currentState === undefined ? {} : { currentState: details.currentState }),
    ...(details.allowedActions === undefined ? {} : { allowedActions: details.allowedActions }),
    ...(details.expectedVersion === undefined ? {} : { expectedVersion: details.expectedVersion }),
    ...(actualVersion === undefined ? {} : { actualVersion }),
    ...(details.retryAfterSeconds === undefined
      ? {}
      : { retryAfterSeconds: details.retryAfterSeconds }),
    ...(details.idempotencyKey === undefined ? {} : { idempotencyKey: details.idempotencyKey }),
    ...(itemErrors === undefined ? {} : { itemErrors }),
    ...(details.migrationReference === undefined
      ? {}
      : { migrationReference: details.migrationReference }),
  };
}

const ERROR_MESSAGES = {
  AUTH_REQUIRED: 'A valid authentication session is required.',
  AUTH_CREDENTIAL_INVALID: 'The authentication credential is invalid.',
  AUTH_TOKEN_INVALID: 'The access token is invalid.',
  AUTH_TOKEN_EXPIRED: 'The access token has expired.',
  AUTH_SESSION_REVOKED: 'The authentication session is no longer active.',
  AUTH_ACCOUNT_DISABLED: 'The account is disabled.',
  AUTH_RATE_LIMITED: 'Too many authentication attempts.',
  AUTH_VERIFICATION_CODE_INVALID: 'The authentication verification code is invalid.',
  USER_NOT_FOUND: 'The user or profile was not found.',
  USER_PROFILE_INVALID: 'The student profile data is invalid.',
  USER_IDENTITY_CONFLICT: 'The student identity conflicts with an existing account.',
  USER_STATUS_NOT_ACTIVE: 'The user status does not allow this action.',
  VALIDATION_FAILED: 'One or more request fields are invalid.',
  VALIDATION_FIELD_REQUIRED: 'A required request field is missing.',
  VALIDATION_FORMAT_INVALID: 'A request field has an invalid format.',
  VALIDATION_ENUM_UNSUPPORTED: 'A request field contains an unsupported enum value.',
  VALIDATION_DURATION_INVALID: 'A duration field is invalid.',
  PERMISSION_DENIED: 'The requested action is not permitted.',
  PERMISSION_RESOURCE_NOT_FOUND: 'The requested resource was not found.',
  PERMISSION_RESOURCE_SCOPE_DENIED:
    'The requested action is outside the authorized resource scope.',
  PERMISSION_COURSE_SCOPE_DENIED: 'The requested class section is outside the teacher scope.',
  PERMISSION_AUDIT_SCOPE_DENIED: 'Raw audit logs are restricted to organization administrators.',
  COURSE_NOT_FOUND: 'The course was not found.',
  COURSE_CLASS_SECTION_NOT_FOUND: 'The class section was not found.',
  COURSE_CLASS_SECTION_NOT_WRITABLE: 'The class section is not writable.',
  COURSE_CLASS_SECTION_NOT_JOINABLE: 'The class section is not open for joining.',
  COURSE_SEMESTER_ARCHIVED: 'The semester is archived.',
  COURSE_TEACHER_ASSIGNMENT_CONFLICT: 'The teacher assignment cannot be changed.',
  COURSE_CHECKIN_WINDOW_CLOSED: 'The class section check-in window is closed.',
  COURSE_WRITE_DISABLED: 'Writes to this course are disabled.',
  COURSE_INVITE_INVALID: 'The course invite is invalid.',
  COURSE_INVITE_EXPIRED: 'The course invite has expired.',
  COURSE_INVITE_REVOKED: 'The course invite was revoked.',
  AUTH_JOIN_CAPABILITY_INVALID: 'The Join Capability is invalid.',
  AUTH_JOIN_CAPABILITY_EXPIRED: 'The Join Capability has expired.',
  AUTH_JOIN_CAPABILITY_ALREADY_USED: 'The Join Capability has already been used.',
  ENROLLMENT_NOT_FOUND: 'The enrollment was not found.',
  ENROLLMENT_NOT_ACTIVE: 'The enrollment is not active.',
  ENROLLMENT_ALREADY_ACTIVE: 'The student already has an active enrollment.',
  ENROLLMENT_SEMESTER_CONFLICT: 'The student already has an active enrollment this semester.',
  ENROLLMENT_TRANSITION_NOT_ALLOWED: 'The enrollment transition is not allowed.',
  ENROLLMENT_WITHDRAWAL_DISABLED: 'Student self-withdrawal is disabled.',
  ENROLLMENT_REJOIN_DISABLED: 'Student self-rejoin is disabled.',
  ENROLLMENT_HAS_BLOCKING_WORK: 'The enrollment has work that blocks this transition.',
  ROSTER_IMPORT_NOT_FOUND: 'The official roster import was not found.',
  ROSTER_FILE_INVALID: 'The official roster file is invalid.',
  ROSTER_SCHEMA_INVALID: 'The official roster schema or row structure is invalid.',
  ROSTER_IMPORT_DUPLICATE: 'The official roster import already exists.',
  ROSTER_IMPORT_NOT_READY: 'The official roster import is not ready for alignment.',
  ROSTER_IMPORT_FAILED: 'The official roster import failed validation.',
  ROSTER_IMPORT_SOURCE_UNSUPPORTED: 'The official roster import source is not supported.',
  ROSTER_ALIGNMENT_IN_PROGRESS: 'A roster alignment is already in progress.',
  ROSTER_ALIGNMENT_SNAPSHOT_STALE: 'The roster alignment snapshot is stale.',
  ROSTER_ALIGNMENT_INPUT_VERSION_CONFLICT:
    'The roster alignment input version conflicts with the current resource.',
  ROSTER_ALIGNMENT_EXCEPTION: 'An unresolved roster alignment exception blocks this action.',
  ROSTER_RESOLUTION_INVALID: 'The roster resolution request is invalid.',
  ROSTER_ALIGNMENT_RESULT_SUPERSEDED: 'The roster alignment result was superseded.',
  ROSTER_IGNORE_NOT_ALLOWED: 'Ignoring roster alignment results is not allowed.',
  ROSTER_RESOLUTION_EVIDENCE_REQUIRED: 'Traceable roster resolution evidence is required.',
  SESSION_NOT_FOUND: 'The exercise session was not found.',
  SESSION_ALREADY_ACTIVE: 'The student already has an active exercise session.',
  SESSION_OUTSIDE_TIME_WINDOW: 'The server time is outside the allowed exercise window.',
  SESSION_TRANSITION_NOT_ALLOWED: 'The exercise session transition is not allowed.',
  SESSION_DURATION_CAP_REACHED: 'The exercise session reached the 7200 second duration cap.',
  SESSION_ALREADY_COMPLETED: 'The exercise session is already completed.',
  SESSION_ALREADY_USED: 'The exercise session has already been used.',
  SESSION_NOT_COMPLETED: 'The exercise session is not completed.',
  SESSION_EXPIRATION_NOT_ALLOWED: 'The exercise session cannot be expired by this operation.',
  SESSION_RESUME_WINDOW_EXPIRED: 'The exercise session cannot be resumed in the current window.',
  SESSION_TIMELINE_INVALID: 'The exercise session timeline is invalid.',
  SESSION_EVENT_OUT_OF_ORDER: 'The exercise session event is out of order.',
  SESSION_RECONCILIATION_REQUIRED: 'The exercise session requires conservative reconciliation.',
  EXERCISE_RECORD_NOT_FOUND: 'The exercise record was not found.',
  EXERCISE_RECORD_ALREADY_EXISTS_FOR_SESSION: 'An exercise record already exists for this session.',
  EXERCISE_RECORD_DUPLICATE_SUBMISSION: 'An equivalent exercise record submission already exists.',
  EXERCISE_RECORD_DURATION_NOT_CREDITABLE:
    'The exercise duration cannot be credited under the current rules.',
  EXERCISE_RECORD_MEDIA_INCOMPLETE:
    'The exercise record does not have complete eligible media evidence.',
  EXERCISE_RECORD_DAILY_LIMIT_REACHED: 'The daily exercise record submission limit was reached.',
  EXERCISE_RECORD_WITHDRAWAL_NOT_ALLOWED: 'Exercise record withdrawal is not allowed.',
  MEDIA_EVIDENCE_REQUIRED: 'Media evidence is required.',
  MEDIA_COUNT_LIMIT_EXCEEDED: 'The exercise session media limit was exceeded.',
  MEDIA_SIZE_EXCEEDED: 'The declared or observed media size exceeds the configured limit.',
  MEDIA_VIDEO_DURATION_EXCEEDED: 'The exercise evidence video exceeds 15 recorded seconds.',
  MEDIA_AUDIO_TRACK_REQUIRED: 'The exercise evidence video must contain an audio track.',
  MEDIA_LOCATION_METADATA_NOT_ALLOWED:
    'Exercise evidence must not contain GPS or container location metadata.',
  MEDIA_TYPE_NOT_ALLOWED: 'The media type or MIME type is not allowed.',
  MEDIA_CAPTURE_SOURCE_NOT_ALLOWED: 'The media capture source is not allowed.',
  MEDIA_UPLOAD_SESSION_EXPIRED: 'The media upload session has expired.',
  MEDIA_OBJECT_NOT_FOUND: 'The private media object was not found.',
  MEDIA_INTEGRITY_MISMATCH: 'The uploaded media does not match its declaration.',
  MEDIA_BIND_TARGET_INVALID: 'The media bind target is invalid.',
  MEDIA_ALREADY_BOUND: 'The media is already bound.',
  MEDIA_PURPOSE_MISMATCH: 'The media business purpose does not match.',
  MEDIA_NOT_AVAILABLE: 'The media is not available.',
  MEDIA_ACCESS_DENIED: 'Original media access is not authorized.',
  MEDIA_BOUND_TO_IMMUTABLE_RECORD: 'The media is bound to an immutable record.',
  MEDIA_HAS_ACTIVE_BINDING: 'The media has an active binding.',
  MEDIA_PROCESSING_ALREADY_STARTED: 'Media processing already started.',
  MEDIA_PROCESSING_INCOMPLETE: 'Media processing is incomplete.',
  MEDIA_VERIFICATION_INCOMPLETE: 'Media verification is incomplete.',
  MEDIA_TRANSITION_NOT_ALLOWED: 'The media transition is not allowed.',
  MEDIA_FAILURE_NOT_RETRYABLE: 'The failed media cannot be retried.',
  MEDIA_RETENTION_HOLD: 'The media is protected by a retention hold.',
  EXEMPTION_APPLICATION_NOT_FOUND: 'The exemption application was not found.',
  EXEMPTION_APPLICATION_TRANSITION_NOT_ALLOWED:
    'The exemption application transition is not allowed.',
  EXEMPTION_APPLICATION_MEDIA_INVALID:
    'The exemption application media is not eligible for this application.',
  PERMISSION_EXEMPTION_REVIEW_SCOPE_DENIED:
    'The exemption application is outside the responsible teacher scope.',
  REVIEW_NOT_FOUND: 'The review record was not found.',
  REVIEW_ALREADY_INITIALIZED: 'The initial review already exists.',
  REVIEW_ALREADY_STARTED: 'The review has already started.',
  REVIEW_ALREADY_COMPLETED: 'The review has already been completed.',
  REVIEW_RESULT_REQUIRED: 'A review result is required.',
  REVIEW_INVALID_REASON_REQUIRED: 'An invalid review requires an approved reason code.',
  REVIEW_CHANGE_NOT_ALLOWED: 'The requested review change is not allowed.',
  REVIEW_BATCH_ITEM_FAILED: 'The review batch item failed.',
  REVIEW_CREDIT_OVERRIDE_NOT_APPROVED: 'Credited duration override is not approved.',
  REVIEW_CREDIT_DURATION_INVALID: 'The credited duration override is invalid.',
  SCORE_NOT_FOUND: 'The student score was not found.',
  SCORE_ALREADY_EXISTS: 'The student score already exists.',
  SCORE_RULE_NOT_FOUND: 'The score rule was not found.',
  SCORE_RULE_NOT_CONFIGURED: 'No active score rule is configured for this class section.',
  SCORE_RULE_APPROVAL_REQUIRED: 'The score rule requires two eligible administrator approvals.',
  SCORE_RULE_SELF_APPROVAL_NOT_ALLOWED: 'The score rule creator cannot approve the rule.',
  SCORE_RULE_DISTINCT_APPROVER_REQUIRED:
    'A different eligible administrator must approve the rule.',
  SCORE_SOURCE_DATA_INCONSISTENT: 'The score source data violates an invariant.',
  SCORE_INPUT_INCOMPLETE: 'The score input is incomplete.',
  SCORE_INPUT_INVALID: 'The score input is invalid.',
  SCORE_INPUT_VERSION_CONFLICT: 'The score input version has changed.',
  SCORE_SOURCE_NOT_CHANGED: 'The score source has not changed.',
  SCORE_ADJUSTMENT_INVALID: 'The score adjustment is invalid.',
  SCORE_ADJUSTMENT_NOT_ALLOWED: 'The score adjustment is not allowed.',
  SCORE_ADJUSTMENT_APPROVAL_REQUIRED: 'The score adjustment requires administrator approval.',
  SCORE_ADJUSTMENT_SELF_APPROVAL_NOT_ALLOWED:
    'The score adjustment requester cannot approve the adjustment.',
  SCORE_ADJUSTMENT_EVIDENCE_INVALID: 'The score adjustment evidence reference is invalid.',
  SCORE_NOT_PUBLISHABLE: 'The current score revision is not publishable.',
  SCORE_LOCKED: 'The published score is locked.',
  SCORE_CORRECTION_NOT_ALLOWED: 'Archived score correction windows are not available in V1.',
  PERMISSION_REVIEW_SCOPE_DENIED: 'The exercise record is outside the teacher review scope.',
  CONFLICT_IDEMPOTENCY_KEY_REUSED: 'The idempotency key was reused for a different request.',
  CONFLICT_REQUEST_IN_PROGRESS: 'The same idempotent request is still in progress.',
  CONFLICT_VERSION_MISMATCH: 'The resource version does not match the expected version.',
  CONFLICT_RESOURCE_ALREADY_EXISTS: 'The resource already exists.',
  CONFLICT_STATE_TRANSITION: 'The requested resource state transition is not allowed.',
  CONFLICT_UNSUPPORTED_RESOURCE_STATE: 'The resource is not in a supported state for this action.',
  SYSTEM_INTERNAL_ERROR: 'An unexpected server error occurred.',
  SYSTEM_SERVICE_UNAVAILABLE: 'A required service dependency is unavailable.',
  SYSTEM_READ_ONLY: 'The system is currently read-only.',
  SYSTEM_MAINTENANCE: 'The system is currently in maintenance mode.',
  SYSTEM_MODE_UNSUPPORTED: 'The current system mode does not support this request.',
  SYSTEM_DATA_INTEGRITY_ERROR: 'A required data invariant is not satisfied.',
  SYSTEM_DEPENDENCY_TIMEOUT: 'A required service dependency timed out.',
  AUDIT_WRITE_FAILED: 'The audit record could not be written.',
  AUDIT_RETENTION_POLICY_REQUIRED: 'An approved audit retention policy is required.',
  COURSE_DEADLINE_PASSED: 'The course submission deadline has passed.',
} as const;

export type FoundationErrorCode = keyof typeof ERROR_MESSAGES;

export class ApplicationError extends Error {
  constructor(
    readonly code: FoundationErrorCode,
    readonly status: number,
    readonly details: ErrorDetails = {},
    message: string = ERROR_MESSAGES[code],
  ) {
    const canonicalStatus = ERROR_HTTP_STATUS[code];
    if (status !== canonicalStatus) {
      throw new TypeError(
        `ApplicationError ${code} must use canonical HTTP status ${String(canonicalStatus)}, received ${String(status)}`,
      );
    }
    super(message);
    this.name = 'ApplicationError';
  }
}

export function applicationErrorFromSnapshot(snapshot: {
  code: FoundationErrorCode;
  status: number;
  message: string;
  details: ErrorDetails;
}): ApplicationError {
  return new ApplicationError(
    snapshot.code,
    ERROR_HTTP_STATUS[snapshot.code],
    snapshot.details,
    snapshot.message,
  );
}
