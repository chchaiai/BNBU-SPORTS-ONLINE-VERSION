export const ENROLLMENT_STATUSES = ['ACTIVE', 'WITHDRAWN', 'REMOVED'] as const;
export type EnrollmentStatus = (typeof ENROLLMENT_STATUSES)[number];

export const ENROLLMENT_SOURCES = ['OFFICIAL_IMPORT', 'QR_CODE', 'MANUAL', 'SYSTEM_SYNC'] as const;
export type EnrollmentSource = (typeof ENROLLMENT_SOURCES)[number];

export type EnrollmentEventSource =
  | 'QR_JOIN'
  | 'MANUAL_ENROLLMENT'
  | 'TEACHER_REMOVAL'
  | 'TEACHER_RESTORE'
  | 'STUDENT_WITHDRAWAL'
  | 'SYSTEM';
