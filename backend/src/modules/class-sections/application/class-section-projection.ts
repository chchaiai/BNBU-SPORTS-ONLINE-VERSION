import type { ClassSectionState } from '../domain/class-section.js';

export interface ClassSectionProjection {
  id: string;
  organizationId: string;
  courseId: string;
  semesterId: string;
  teacherId: string;
  classCode: string;
  displayName: string;
  status: string;
  isEnrollmentOpen: boolean;
  checkInWindowMode: string;
  checkInStartDate: string | null;
  checkInEndDate: string | null;
  dailyStartTime: string | null;
  dailyEndTime: string | null;
  submissionDeadlineAt: string | null;
  excludedDates: string[];
  createdAt: string;
  updatedAt: string;
  version: number;
}

export function projectClassSection(section: ClassSectionState): ClassSectionProjection {
  return {
    id: section.id,
    organizationId: section.organizationId,
    courseId: section.courseId,
    semesterId: section.semesterId,
    teacherId: section.teacherId,
    classCode: section.classCode,
    displayName: section.displayName,
    status: section.status,
    isEnrollmentOpen: section.isEnrollmentOpen,
    checkInWindowMode: section.checkInWindowMode,
    checkInStartDate: section.checkInStartDate,
    checkInEndDate: section.checkInEndDate,
    dailyStartTime: section.dailyStartTime,
    dailyEndTime: section.dailyEndTime,
    submissionDeadlineAt: section.submissionDeadlineAt?.toISOString() ?? null,
    excludedDates: [...section.excludedDates],
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
    version: section.version,
  };
}
