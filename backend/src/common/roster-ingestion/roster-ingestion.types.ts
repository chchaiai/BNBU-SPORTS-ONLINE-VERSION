export const ROSTER_CANONICAL_FIELDS = [
  'studentNumber',
  'fullName',
  'gender',
  'gradeYear',
  'collegeName',
  'majorName',
  'administrativeClassName',
] as const;

export type RosterCanonicalField = (typeof ROSTER_CANONICAL_FIELDS)[number];

export interface RosterFieldMappingSnapshot {
  studentNumber: string;
  fullName: string | null;
  gender: string | null;
  gradeYear: string | null;
  collegeName: string | null;
  majorName: string | null;
  administrativeClassName: string | null;
}

export interface ReceivedRosterUpload {
  source: 'FILE';
  fileFormat: 'CSV' | 'XLSX';
  sourceSheet?: string | null;
  sanitizedOriginalFileName: string;
  sourceFileStorageKey: string;
  fileChecksumSha256: string;
  fileSizeBytes: number;
  fieldMappingSnapshot: RosterFieldMappingSnapshot;
}

export type RosterRowValidationStatus = 'VALID' | 'INVALID' | 'DUPLICATED';

export interface ParsedRosterRow {
  sourceRowNumber: number;
  normalizedStudentNumber: string | null;
  rawStudentNumberSafe: string | null;
  fullName: string | null;
  gender: 'MALE' | 'FEMALE' | 'OTHER' | null;
  gradeYear: number | null;
  collegeName: string | null;
  majorName: string | null;
  administrativeClassName: string | null;
  rowValidationStatus: RosterRowValidationStatus;
  rowErrorCodes: string[];
  rawRowSnapshotSafe: Readonly<Record<RosterCanonicalField, string | null>>;
}

export interface ParsedRosterCsv {
  rows: ParsedRosterRow[];
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  duplicatedRowCount: number;
}
