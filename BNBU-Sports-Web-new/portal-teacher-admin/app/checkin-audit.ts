export type AuditStatus = "valid" | "invalid" | "pending" | "supplement" | "technical";

export function isTeacherReviewQueueRecord(record: { auditStatus: AuditStatus; workflowStage?: string }) {
  return record.auditStatus === "invalid" || (record.auditStatus === "pending" &&
    (!record.workflowStage || record.workflowStage === "PENDING_TEACHER"));
}

export interface AttendanceAuditState {
  auditStatus: AuditStatus;
  invalidReason?: string;
  auditRemark?: string;
}

export interface AuditableAttendanceRecord extends AttendanceAuditState {
  creditedMinutes: number;
}

/**
 * Changes only the review conclusion. The server-awarded duration remains an
 * immutable record fact; whether it contributes to the summary is decided by
 * deriveAuditSummary from the current audit result.
 */
export function applyAttendanceAuditState<
  T extends AuditableAttendanceRecord,
>(record: T, state: AttendanceAuditState): T {
  return {
    ...record,
    auditStatus: state.auditStatus,
    invalidReason:
      state.auditStatus === "invalid" ? state.invalidReason : undefined,
    auditRemark: state.auditRemark,
  };
}

export interface AttendanceAuditSummary {
  validCount: number;
  invalidCount: number;
  pendingCount: number;
  validMinutes: number;
  remainingMinutes: number;
  exceededMinutes: number;
  hasReachedTarget: boolean;
  progressPercent: number;
}

export type CreditedDurationHours = number;

export function toCreditedDurationHours(
  minutes: number,
): CreditedDurationHours | null {
  // Display server-awarded whole minutes, including V8.1's 30/45-minute
  // records and retained historical awards. Do not reapply old credit bands.
  if (Number.isSafeInteger(minutes) && minutes >= 0)
    return minutes / 60;
  return null;
}

export function deriveAuditSummary(
  records: readonly AuditableAttendanceRecord[],
  requiredMinutes: number,
): AttendanceAuditSummary {
  const totals = records.reduce(
    (summary, record) => {
      if (record.auditStatus === "valid") {
        summary.validCount += 1;
        summary.validMinutes += Math.max(0, record.creditedMinutes);
      } else if (record.auditStatus === "invalid") {
        summary.invalidCount += 1;
      } else {
        summary.pendingCount += 1;
      }
      return summary;
    },
    { validCount: 0, invalidCount: 0, pendingCount: 0, validMinutes: 0 },
  );

  const normalizedTarget = Math.max(0, requiredMinutes);
  const remainingMinutes = Math.max(0, normalizedTarget - totals.validMinutes);
  const exceededMinutes = Math.max(0, totals.validMinutes - normalizedTarget);
  const hasReachedTarget = totals.validMinutes >= normalizedTarget;
  const progressPercent = normalizedTarget === 0
    ? 100
    : Math.min(100, (totals.validMinutes / normalizedTarget) * 100);

  return {
    ...totals,
    remainingMinutes,
    exceededMinutes,
    hasReachedTarget,
    progressPercent,
  };
}
