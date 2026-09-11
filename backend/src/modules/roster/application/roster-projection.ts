import type { UserRole } from '../../../common/http/request-context.js';

export interface OfficialRosterImportProjection {
  id: string;
  organizationId: string;
  classSectionId: string;
  versionNumber: number;
  source: string;
  status: string;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  duplicatedRowCount: number;
  importedAt: string;
  importedBy: string;
  isCurrent: boolean;
  supersededAt: string | null;
  failureCode: string | null;
  version: number;
  createdAt: string;
}

export interface OfficialRosterEntryProjection {
  id: string;
  organizationId: string;
  rosterImportId: string;
  classSectionId: string;
  studentNumber: string | null;
  fullName: string | null;
  gender: string | null;
  gradeYear: number | null;
  collegeName: string | null;
  majorName: string | null;
  administrativeClassName: string | null;
  sourceRowNumber: number;
  rowValidationStatus: string;
  rowErrorCodes: string[];
}

export interface RosterAlignmentRunProjection {
  id: string;
  organizationId: string;
  classSectionId: string;
  rosterImportId: string;
  comparisonRevision: number;
  algorithmVersion: string;
  platformSnapshotFingerprint: string;
  platformSnapshotAt: string;
  status: string;
  startedBy: string;
  startedAt: string;
  completedAt: string | null;
  failureCode: string | null;
  resultCount: number;
  isCurrent: boolean;
}

export interface AlignmentDifferenceProjection {
  field: string;
  officialValue: string | number | null;
  platformValue: string | number | null;
}

export interface RosterAlignmentResultProjection {
  id: string;
  organizationId: string;
  alignmentRunId: string;
  rosterImportId: string;
  classSectionId: string;
  subjectKey: string;
  rosterEntryId: string | null;
  enrollmentId: string | null;
  studentId: string | null;
  comparisonRevision: number;
  status: string;
  differences: AlignmentDifferenceProjection[];
  resolutionStatus: string;
  lastResolutionAction: string | null;
  resolutionNote: string | null;
  currentResolutionVersion: number;
  supersededAt: string | null;
  createdAt: string;
  version: number;
}

interface ImportRecord {
  id: string;
  organizationId: string;
  classSectionId: string;
  versionNumber: number;
  source: string;
  status: string;
  totalRowCount: number;
  validRowCount: number;
  invalidRowCount: number;
  duplicatedRowCount: number;
  importedAt: Date;
  importedBy: string;
  isCurrent: boolean;
  supersededAt: Date | null;
  failureCode: string | null;
  version: number;
  createdAt: Date;
}

export function projectRosterImport(record: ImportRecord): OfficialRosterImportProjection {
  return {
    id: record.id,
    organizationId: record.organizationId,
    classSectionId: record.classSectionId,
    versionNumber: record.versionNumber,
    source: record.source,
    status: record.status,
    totalRowCount: record.totalRowCount,
    validRowCount: record.validRowCount,
    invalidRowCount: record.invalidRowCount,
    duplicatedRowCount: record.duplicatedRowCount,
    importedAt: record.importedAt.toISOString(),
    importedBy: record.importedBy,
    isCurrent: record.isCurrent,
    supersededAt: record.supersededAt?.toISOString() ?? null,
    failureCode: record.failureCode,
    version: record.version,
    createdAt: record.createdAt.toISOString(),
  };
}

interface EntryRecord {
  id: string;
  organizationId: string;
  rosterImportId: string;
  classSectionId: string;
  normalizedStudentNumber: string | null;
  fullName: string | null;
  gender: string | null;
  gradeYear: number | null;
  collegeName: string | null;
  majorName: string | null;
  administrativeClassName: string | null;
  sourceRowNumber: number;
  rowValidationStatus: string;
  rowErrorCodes: unknown;
}

export function projectRosterEntry(
  record: EntryRecord,
  role: UserRole,
): OfficialRosterEntryProjection {
  const discloseIdentity = role === 'TEACHER';
  return {
    id: record.id,
    organizationId: record.organizationId,
    rosterImportId: record.rosterImportId,
    classSectionId: record.classSectionId,
    studentNumber: discloseIdentity ? record.normalizedStudentNumber : null,
    fullName: discloseIdentity ? record.fullName : null,
    gender: discloseIdentity ? record.gender : null,
    gradeYear: discloseIdentity ? record.gradeYear : null,
    collegeName: discloseIdentity ? record.collegeName : null,
    majorName: discloseIdentity ? record.majorName : null,
    administrativeClassName: discloseIdentity ? record.administrativeClassName : null,
    sourceRowNumber: record.sourceRowNumber,
    rowValidationStatus: record.rowValidationStatus,
    rowErrorCodes: stringArray(record.rowErrorCodes),
  };
}

interface RunRecord {
  id: string;
  organizationId: string;
  classSectionId: string;
  rosterImportId: string;
  comparisonRevision: number;
  algorithmVersion: string;
  platformSnapshotFingerprint: string;
  platformSnapshotAt: Date;
  status: string;
  startedBy: string;
  startedAt: Date;
  completedAt: Date | null;
  failureCode: string | null;
  resultCount: number;
  isCurrent: boolean;
}

export function projectAlignmentRun(record: RunRecord): RosterAlignmentRunProjection {
  return {
    id: record.id,
    organizationId: record.organizationId,
    classSectionId: record.classSectionId,
    rosterImportId: record.rosterImportId,
    comparisonRevision: record.comparisonRevision,
    algorithmVersion: record.algorithmVersion,
    platformSnapshotFingerprint: record.platformSnapshotFingerprint,
    platformSnapshotAt: record.platformSnapshotAt.toISOString(),
    status: record.status,
    startedBy: record.startedBy,
    startedAt: record.startedAt.toISOString(),
    completedAt: record.completedAt?.toISOString() ?? null,
    failureCode: record.failureCode,
    resultCount: record.resultCount,
    isCurrent: record.isCurrent,
  };
}

interface ResultRecord {
  id: string;
  organizationId: string;
  alignmentRunId: string;
  rosterImportId: string;
  classSectionId: string;
  subjectKey: string;
  rosterEntryId: string | null;
  enrollmentId: string | null;
  studentId: string | null;
  comparisonRevision: number;
  status: string;
  differences: unknown;
  resolutionStatus: string;
  lastResolutionAction: string | null;
  resolutionNote: string | null;
  currentResolutionVersion: number;
  supersededAt: Date | null;
  createdAt: Date;
  version: number;
}

export function projectAlignmentResult(
  record: ResultRecord,
  role: UserRole,
): RosterAlignmentResultProjection {
  const differences = differenceArray(record.differences);
  const admin = role === 'ADMIN';
  const crossClassPlatformReference = record.status === 'WRONG_COURSE';
  return {
    id: record.id,
    organizationId: record.organizationId,
    alignmentRunId: record.alignmentRunId,
    rosterImportId: record.rosterImportId,
    classSectionId: record.classSectionId,
    subjectKey: record.subjectKey,
    rosterEntryId: admin ? null : record.rosterEntryId,
    enrollmentId: admin || crossClassPlatformReference ? null : record.enrollmentId,
    studentId: admin || crossClassPlatformReference ? null : record.studentId,
    comparisonRevision: record.comparisonRevision,
    status: record.status,
    differences: admin
      ? differences.map(({ field }) => ({ field, officialValue: null, platformValue: null }))
      : differences,
    resolutionStatus: record.resolutionStatus,
    lastResolutionAction: record.lastResolutionAction,
    resolutionNote: admin ? null : record.resolutionNote,
    currentResolutionVersion: record.currentResolutionVersion,
    supersededAt: record.supersededAt?.toISOString() ?? null,
    createdAt: record.createdAt.toISOString(),
    version: record.version,
  };
}

function stringArray(value: unknown): string[] {
  return Array.isArray(value)
    ? value.filter((entry): entry is string => typeof entry === 'string')
    : [];
}

function differenceArray(value: unknown): AlignmentDifferenceProjection[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((entry) => {
    if (typeof entry !== 'object' || entry === null) return [];
    const object = entry as Record<string, unknown>;
    if (typeof object.field !== 'string') return [];
    const scalar = (candidate: unknown): string | number | null =>
      typeof candidate === 'string' || typeof candidate === 'number' ? candidate : null;
    return [
      {
        field: object.field,
        officialValue: scalar(object.officialValue),
        platformValue: scalar(object.platformValue),
      },
    ];
  });
}
