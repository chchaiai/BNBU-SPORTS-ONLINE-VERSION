import type { components } from "./openapi.generated";
import type {
  OfficialRosterSnapshot,
  OfficialRosterStudent,
  PlatformCourseMember,
  RosterCourseReference,
  RosterReconciliationResult,
  RosterReconciliationStatus,
} from "./roster-reconciliation-types";

type ApiRosterImport = components["schemas"]["OfficialRosterImport"];
type ApiRosterEntry = components["schemas"]["OfficialRosterEntry"];
type ApiAlignmentResult = components["schemas"]["RosterAlignmentResult"];

export const ROSTER_API_PATHS = {
  rosterVersions: (classSectionId: string) =>
    `/class-sections/${encodeURIComponent(classSectionId)}/roster-imports`,
  currentRoster: (classSectionId: string) =>
    `/class-sections/${encodeURIComponent(classSectionId)}/roster-imports/current`,
  uploadRoster: (classSectionId: string) =>
    `/class-sections/${encodeURIComponent(classSectionId)}/roster-imports`,
  rosterEntries: (rosterImportId: string) =>
    `/roster-imports/${encodeURIComponent(rosterImportId)}/entries`,
  align: (rosterImportId: string) =>
    `/roster-imports/${encodeURIComponent(rosterImportId)}/align`,
  alignmentResults: "/roster-alignment-results",
  confirm: (resultId: string) =>
    `/roster-alignment-results/${encodeURIComponent(resultId)}/confirm`,
  reopen: (resultId: string) =>
    `/roster-alignment-results/${encodeURIComponent(resultId)}/reopen`,
} as const;

function mapGender(value: string | null): string | undefined {
  if (value === "MALE") return "男";
  if (value === "FEMALE") return "女";
  if (value === "OTHER") return "其他";
  return undefined;
}

export function mapRosterVersion(value: ApiRosterImport) {
  return {
    id: value.id,
    courseId: value.classSectionId,
    versionNumber: value.versionNumber,
    importedAt: value.importedAt,
    totalRows: value.totalRowCount,
    validRows: value.validRowCount,
    invalidRows: value.invalidRowCount,
    duplicatedRows: value.duplicatedRowCount,
    isCurrent: value.isCurrent,
    source: value.source,
    status: value.status,
    version: value.version,
  };
}

export function mapRosterEntry(
  value: ApiRosterEntry,
  course?: RosterCourseReference,
): OfficialRosterStudent {
  return {
    id: value.id,
    courseId: value.classSectionId,
    studentNumber: value.studentNumber ?? "",
    name: value.fullName ?? "",
    gender: mapGender(value.gender),
    grade: value.gradeYear === null ? undefined : `${value.gradeYear}级`,
    college: value.collegeName ?? undefined,
    major: value.majorName ?? undefined,
    administrativeClass: value.administrativeClassName ?? undefined,
    courseName: course?.name,
    courseCode: course?.code,
    teachingClassCode: course?.teachingClassCode,
    sourceRow: value.sourceRowNumber,
  };
}

const STATUS_REASON: Record<RosterReconciliationStatus, string> = {
  MATCHED: "已加入本班，名单信息一致。",
  MISSING_IN_PLATFORM: "还未加入本班，请提醒学生使用本班邀请码或二维码加入。",
  EXTRA_IN_PLATFORM: "已加入本班，但不在导入名单中，请核实是否选了这门课。",
  WRONG_COURSE: "目前加入了其他班级，请联系学生核实选课情况。",
  IDENTITY_CONFLICT: "学号相同，但姓名、性别或入学年份不同，请核实学生信息。",
  DUPLICATED: "同一学号出现多次，请先核实重复的学生信息。",
};

function findPlatformMember(
  raw: ApiAlignmentResult,
  members: PlatformCourseMember[],
): PlatformCourseMember | undefined {
  if (raw.enrollmentId) {
    const byEnrollment = members.find((member) => member.id === raw.enrollmentId);
    if (byEnrollment) return byEnrollment;
  }
  if (raw.studentId)
    return members.find((member) => member.studentId === raw.studentId);
  return undefined;
}

export function mapAlignmentResult(
  raw: ApiAlignmentResult,
  entriesById: Map<string, OfficialRosterStudent>,
  members: PlatformCourseMember[],
): RosterReconciliationResult {
  const official = raw.rosterEntryId ? entriesById.get(raw.rosterEntryId) : undefined;
  const duplicateRows = raw.status === 'DUPLICATED' && official
    ? [...entriesById.values()].filter(entry => entry.studentNumber.trim().normalize('NFC').toUpperCase()
      === official.studentNumber.trim().normalize('NFC').toUpperCase()).sort((a,b) => (a.sourceRow ?? 0) - (b.sourceRow ?? 0)) : [];
  return {
    id: raw.id,
    courseId: raw.classSectionId,
    officialStudent: raw.rosterEntryId
      ? entriesById.get(raw.rosterEntryId)
      : undefined,
    platformMember: findPlatformMember(raw, members),
    status: raw.status,
    differences: raw.differences.map((difference) => ({
      field: difference.field,
      officialValue: difference.officialValue,
      platformValue: difference.platformValue,
    })),
    reason: duplicateRows.length > 1
      ? `${STATUS_REASON[raw.status]} 原始名单行：${duplicateRows.map(row => `${row.sourceRow}（${row.name}）`).join('、')}。`
      : STATUS_REASON[raw.status],
    resolutionStatus: raw.resolutionStatus,
    teacherNote: raw.resolutionNote ?? undefined,
    updatedAt: raw.createdAt,
    version: raw.version,
    lastResolutionAction: raw.lastResolutionAction ?? undefined,
  };
}

export function deriveStats(
  currentRoster: OfficialRosterSnapshot | null,
  results: RosterReconciliationResult[],
  members: PlatformCourseMember[],
  courseId: string,
  latestAlignmentAt?: string,
) {
  const count = (status: RosterReconciliationStatus) =>
    results.filter((result) => result.status === status).length;
  const resultTimestamp = results.reduce<string | undefined>(
    (latest, result) =>
      latest === undefined || result.updatedAt > latest
        ? result.updatedAt
        : latest,
    undefined,
  );
  return {
    officialTotal: currentRoster && (currentRoster.version.duplicatedRows > 0 || currentRoster.version.invalidRows > 0)
      ? null : currentRoster?.version.validRows ?? 0,
    platformTotal: members.filter((member) => member.courseId === courseId)
      .length,
    matched: count("MATCHED"),
    notJoined: count("MISSING_IN_PLATFORM"),
    wrongCourse: count("WRONG_COURSE"),
    otherExceptions:
      count("EXTRA_IN_PLATFORM") +
      count("IDENTITY_CONFLICT") +
      count("DUPLICATED"),
    pending: results.filter((result) => result.resolutionStatus === "PENDING")
      .length,
    lastReconciledAt: latestAlignmentAt ?? resultTimestamp,
  };
}
