import type { RosterReconciliationResult } from "./roster-reconciliation-types";

/** Both statuses mean the expected student has no enrollment in this class. */
export function missingEnrollmentRows(results: RosterReconciliationResult[]) {
  const students = new Map<string, { studentNumber: string; name: string }>();
  for (const result of results) {
    if (result.status !== "MISSING_IN_PLATFORM" && result.status !== "WRONG_COURSE") continue;
    const student = result.officialStudent;
    if (student && !students.has(student.studentNumber)) {
      students.set(student.studentNumber, { studentNumber: student.studentNumber, name: student.name });
    }
  }
  return [...students.values()].sort((a, b) => a.studentNumber.localeCompare(b.studentNumber, "zh-CN", { numeric: true }));
}
