import { createHash } from 'node:crypto';

import { ApplicationError } from '../../../common/errors/application-error.js';

export const ROSTER_ALIGNMENT_ALGORITHM_VERSION = 'ROSTER_ALIGNMENT_V2' as const;

export const ROSTER_ALIGNMENT_STATUSES = [
  'MATCHED',
  'MISSING_IN_PLATFORM',
  'EXTRA_IN_PLATFORM',
  'WRONG_COURSE',
  'IDENTITY_CONFLICT',
  'DUPLICATED',
] as const;

export type RosterAlignmentStatus = (typeof ROSTER_ALIGNMENT_STATUSES)[number];

export interface OfficialAlignmentEntry {
  id: string;
  normalizedStudentNumber: string;
  fullName: string;
  gender: string | null;
  gradeYear: number | null;
}

export interface PlatformAlignmentEntry {
  id: string;
  enrollmentId: string;
  studentId: string;
  classSectionId: string;
  normalizedStudentNumber: string;
  fullName: string;
  gender: string | null;
  gradeYear: number | null;
}

export interface AlignmentDifference {
  field: 'FULL_NAME' | 'GENDER' | 'GRADE_YEAR' | 'CLASS_SECTION';
  officialValue: string | number | null;
  platformValue: string | number | null;
}

export interface DeterministicAlignmentResult {
  subjectKey: string;
  normalizedStudentNumber: string;
  rosterEntryId: string | null;
  platformEntryId: string | null;
  enrollmentId: string | null;
  studentId: string | null;
  status: RosterAlignmentStatus;
  differences: AlignmentDifference[];
}

export interface AlignmentComputation {
  platformSnapshotFingerprint: string;
  results: DeterministicAlignmentResult[];
}

interface AlignmentInput {
  organizationId: string;
  semesterId: string;
  targetClassSectionId: string;
  officialEntries: readonly OfficialAlignmentEntry[];
  platformEntries: readonly PlatformAlignmentEntry[];
}

export function normalizeRosterStudentNumber(value: string): string {
  return value.trim().normalize('NFC').toUpperCase();
}

export function normalizeRosterFullName(value: string): string {
  return value.trim().normalize('NFC');
}

export function rosterSubjectKey(
  organizationId: string,
  semesterId: string,
  normalizedStudentNumber: string,
): string {
  return sha256(`ROSTER_SUBJECT_V1\0${organizationId}\0${semesterId}\0${normalizedStudentNumber}`);
}

export function platformSnapshotFingerprint(input: {
  organizationId: string;
  semesterId: string;
  entries: readonly PlatformAlignmentEntry[];
}): string {
  const canonicalEntries = [...input.entries]
    .map((entry) => ({
      enrollmentId: entry.enrollmentId,
      studentId: entry.studentId,
      classSectionId: entry.classSectionId,
      semesterId: input.semesterId,
      normalizedStudentNumber: normalizeRosterStudentNumber(entry.normalizedStudentNumber),
      normalizedFullName: normalizeRosterFullName(entry.fullName),
      gender: entry.gender,
      gradeYear: entry.gradeYear,
      enrollmentStatus: 'ACTIVE' as const,
    }))
    .sort((left, right) =>
      compareCodePoints(
        [left.normalizedStudentNumber, left.classSectionId, left.enrollmentId, left.studentId].join(
          '\0',
        ),
        [
          right.normalizedStudentNumber,
          right.classSectionId,
          right.enrollmentId,
          right.studentId,
        ].join('\0'),
      ),
    );
  return sha256(
    JSON.stringify({
      schemaVersion: 1,
      organizationId: input.organizationId,
      semesterId: input.semesterId,
      entries: canonicalEntries,
    }),
  );
}

export function computeRosterAlignment(input: AlignmentInput): AlignmentComputation {
  const officialByNumber = groupOfficial(input.officialEntries);
  const platformByNumber = groupPlatform(input.platformEntries);
  const targetByNumber = groupPlatform(
    input.platformEntries.filter((entry) => entry.classSectionId === input.targetClassSectionId),
  );
  const candidateNumbers = [
    ...new Set([...officialByNumber.keys(), ...targetByNumber.keys()]),
  ].sort(compareCodePoints);

  const results = candidateNumbers.map((studentNumber) => {
    const official = officialByNumber.get(studentNumber)?.[0] ?? null;
    const semesterMatches = platformByNumber.get(studentNumber) ?? [];
    const targetMatches = targetByNumber.get(studentNumber) ?? [];
    const subjectKey = rosterSubjectKey(input.organizationId, input.semesterId, studentNumber);

    if ((officialByNumber.get(studentNumber)?.length ?? 0) > 1 || semesterMatches.length > 1) {
      return result(subjectKey, studentNumber, official, null, 'DUPLICATED', []);
    }

    const target = targetMatches[0] ?? null;
    if (official !== null && target !== null) {
      const differences = identityDifferences(official, target);
      return result(
        subjectKey,
        studentNumber,
        official,
        target,
        differences.length === 0 ? 'MATCHED' : 'IDENTITY_CONFLICT',
        differences,
      );
    }

    const other = semesterMatches.find(
      (entry) => entry.classSectionId !== input.targetClassSectionId,
    );
    if (official !== null && target === null && other !== undefined) {
      return result(subjectKey, studentNumber, official, other, 'WRONG_COURSE', [
        {
          field: 'CLASS_SECTION',
          officialValue: input.targetClassSectionId,
          platformValue: 'OTHER_CLASS_SECTION',
        },
      ]);
    }
    if (official !== null && semesterMatches.length === 0) {
      return result(subjectKey, studentNumber, official, null, 'MISSING_IN_PLATFORM', []);
    }
    if (official === null && target !== null) {
      return result(subjectKey, studentNumber, null, target, 'EXTRA_IN_PLATFORM', []);
    }
    return integrityFailure('ROSTER_ALIGNMENT_UNCLASSIFIED_SUBJECT');
  });

  return {
    platformSnapshotFingerprint: platformSnapshotFingerprint({
      organizationId: input.organizationId,
      semesterId: input.semesterId,
      entries: input.platformEntries,
    }),
    results,
  };
}

function groupOfficial(
  entries: readonly OfficialAlignmentEntry[],
): Map<string, OfficialAlignmentEntry[]> {
  const grouped = new Map<string, OfficialAlignmentEntry[]>();
  for (const entry of entries) {
    const number = normalizeRosterStudentNumber(entry.normalizedStudentNumber);
    const bucket = grouped.get(number) ?? [];
    bucket.push({ ...entry, normalizedStudentNumber: number });
    grouped.set(number, bucket);
  }
  for (const bucket of grouped.values()) bucket.sort((left, right) => compareCodePoints(left.id, right.id));
  return grouped;
}

function groupPlatform(
  entries: readonly PlatformAlignmentEntry[],
): Map<string, PlatformAlignmentEntry[]> {
  const grouped = new Map<string, PlatformAlignmentEntry[]>();
  for (const entry of entries) {
    const number = normalizeRosterStudentNumber(entry.normalizedStudentNumber);
    const bucket = grouped.get(number) ?? [];
    bucket.push({ ...entry, normalizedStudentNumber: number });
    grouped.set(number, bucket);
  }
  return grouped;
}

function identityDifferences(
  official: OfficialAlignmentEntry,
  platform: PlatformAlignmentEntry,
): AlignmentDifference[] {
  const differences: AlignmentDifference[] = [];
  const officialName = normalizeRosterFullName(official.fullName);
  const platformName = normalizeRosterFullName(platform.fullName);
  if (officialName !== platformName) {
    differences.push({
      field: 'FULL_NAME',
      officialValue: officialName,
      platformValue: platformName,
    });
  }
  if (official.gender !== null && official.gender !== platform.gender) {
    differences.push({
      field: 'GENDER',
      officialValue: official.gender,
      platformValue: platform.gender,
    });
  }
  if (official.gradeYear !== null && official.gradeYear !== platform.gradeYear) {
    differences.push({
      field: 'GRADE_YEAR',
      officialValue: official.gradeYear,
      platformValue: platform.gradeYear,
    });
  }
  return differences;
}

function result(
  subjectKey: string,
  normalizedStudentNumber: string,
  official: OfficialAlignmentEntry | null,
  platform: PlatformAlignmentEntry | null,
  status: RosterAlignmentStatus,
  differences: AlignmentDifference[],
): DeterministicAlignmentResult {
  return {
    subjectKey,
    normalizedStudentNumber,
    rosterEntryId: official?.id ?? null,
    platformEntryId: platform?.id ?? null,
    enrollmentId: platform?.enrollmentId ?? null,
    studentId: platform?.studentId ?? null,
    status,
    differences,
  };
}

function sha256(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

function compareCodePoints(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function integrityFailure(invariant: string): never {
  throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, { invariant });
}
