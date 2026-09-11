import { request } from "./api-client";
import type { PublicReasonId } from "./review-public-reasons";

export function getSettlementCheck(classSectionId: string) {
  return request<{ classSectionId: string; checkedAt: string; ready: boolean;
    checks: { code: string; status: 'CLEAR' | 'BLOCKED' | 'UNAVAILABLE'; count: number | null }[] }>(
    `/class-sections/${encodeURIComponent(classSectionId)}/settlement-check`,
  );
}

export type FinalGradeRevision = {
  enrollmentId: string; version: number; finalGrade: number; published: boolean; createdAt: string;
};
export function listFinalGradeRevisions(enrollmentId: string, beforeVersion?: number) {
  return request<{ items: FinalGradeRevision[]; nextBeforeVersion: number | null }>(
    `/enrollments/${encodeURIComponent(enrollmentId)}/final-grades?limit=100${beforeVersion ? `&beforeVersion=${beforeVersion}` : ''}`,
  );
}
export function appendFinalGrade(enrollmentId: string,
  input: { finalGrade: number; published: boolean; expectedVersion: number; correctionReason?: string }, idempotencyKey: string) {
  return request<FinalGradeRevision>(`/enrollments/${encodeURIComponent(enrollmentId)}/final-grades${input.correctionReason !== undefined ? '/corrections' : ''}`, {
    method: 'POST', body: input, headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export type ManualReviewMode = {
  classSectionId: string;
  enabled: boolean;
  reason: string | null;
  version: number;
  updatedAt: string | null;
};
export const fetchManualReviewMode = (classSectionId: string) =>
  request<ManualReviewMode>(`/admin/review-services/manual-mode/${encodeURIComponent(classSectionId)}`);

export function setManualReviewMode(
  input: { classSectionId: string; enabled: boolean; reason: string; expectedVersion: number },
  idempotencyKey: string,
) {
  return request('/admin/review-services/manual-mode', {
    method: 'POST', body: input, headers: { 'Idempotency-Key': idempotencyKey },
  });
}

export function approveCertification(
  applicationId: string,
  input: {
    expectedVersion: number;
    courseMinutes: number;
    generalMinutes: number;
    publicComment: string;
  },
  idempotencyKey: string,
) {
  return request(
    `/exemption-applications/${encodeURIComponent(applicationId)}/review`,
    {
      method: "POST",
      body: { ...input, decision: "APPROVE" },
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

export function revokeCertification(
  applicationId: string,
  input: {
    expectedVersion: number;
    reason: string;
  },
  idempotencyKey: string,
) {
  return request(
    `/activity-certification-applications/${encodeURIComponent(applicationId)}/revoke`,
    {
      method: "POST",
      body: input,
      headers: { "Idempotency-Key": idempotencyKey },
    },
  );
}

export function adjustRecognition(applicationId:string,input:{expectedVersion:number;reason:string;courseMinutes:number;generalMinutes:number},idempotencyKey:string){
  return request(`/activity-certification-applications/${encodeURIComponent(applicationId)}/recognition-allocation-revisions`,{
    method:'POST',body:input,headers:{'Idempotency-Key':idempotencyKey},
  });
}

export type RecordWorkflow = {
  recordId: string;
  stage:
    | "PENDING_AI"
    | "TECHNICAL"
    | "PENDING_TEACHER"
    | "AWAITING_SUPPLEMENT"
    | "VALID"
    | "INVALID";
  materialVersion: 1 | 2;
  supplementUsed: boolean;
  publicReason: string | null;
  publicComment: string | null;
  version: number;
  materials: { materialVersion: 1 | 2; mediaId: string; position: number }[];
  supplement: {
    deadline: string;
    remainingMs: number;
    paused: boolean;
    expired: boolean;
  } | null;
  credit: {
    eligibleMinutes: number;
    creditedMinutes: number;
    reason: string | null;
  } | null;
};

const reasonCodes: Record<PublicReasonId, string> = {
  UnclearEvidence: "UNCLEAR_EVIDENCE",
  MissingRequiredEvidence: "MISSING_REQUIRED_EVIDENCE",
  EvidenceDoesNotMatchSession: "SESSION_MISMATCH",
  InconsistentEvidence: "INCONSISTENT_EVIDENCE",
  AuthenticityRequiresClarification: "AUTHENTICITY_REQUIRES_CLARIFICATION",
  ConfirmedReuseOrMisuse: "CONFIRMED_REUSE_OR_MISUSE",
};
export const fetchRecordWorkflow = (recordId: string) =>
  request<RecordWorkflow>(
    `/exercise-records/${encodeURIComponent(recordId)}/workflow`,
  );

export function decideRecord(
  recordId: string,
  input: {
    action: "VALID" | "INVALID" | "RETURN_FOR_SUPPLEMENT";
    reason?: PublicReasonId;
    publicComment?: string;
    supplementHours?: 24 | 72;
    expectedVersion: number;
  },
  idempotencyKey: string,
) {
  return request(
    `/exercise-records/${encodeURIComponent(recordId)}/v81-reviews`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        action: input.action,
        expectedVersion: input.expectedVersion,
        ...(input.reason ? { reasonCode: reasonCodes[input.reason] } : {}),
        ...(input.publicComment ? { publicComment: input.publicComment } : {}),
        ...(input.action === "RETURN_FOR_SUPPLEMENT"
          ? { supplementHours: input.supplementHours ?? 24 }
          : {}),
      },
    },
  );
}
export function correctRecord(
  recordId: string,
  input: {
    action: "VALID" | "INVALID";
    reason?: PublicReasonId;
    publicComment?: string;
    correctionReason: string;
    expectedVersion: number;
  },
  idempotencyKey: string,
) {
  return request(
    `/exercise-records/${encodeURIComponent(recordId)}/corrections`,
    {
      method: "POST",
      headers: { "Idempotency-Key": idempotencyKey },
      body: {
        action: input.action,
        expectedVersion: input.expectedVersion,
        correctionReason: input.correctionReason,
        ...(input.reason ? { reasonCode: reasonCodes[input.reason] } : {}),
        ...(input.publicComment ? { publicComment: input.publicComment } : {}),
      },
    },
  );
}
