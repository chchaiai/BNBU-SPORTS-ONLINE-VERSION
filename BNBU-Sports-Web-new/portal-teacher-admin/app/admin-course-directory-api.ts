import { request } from './api-client';

export type DirectorySummary = { courses: number; students: number; teachers: number };
export function courseRequirementLabel(amount: number | null | undefined, unit: string, locale: 'zh' | 'en') {
  if (amount === null) return locale === 'zh' ? '未发布' : 'Not published';
  if (amount === undefined || !Number.isFinite(amount)) return locale === 'zh' ? '暂未提供' : 'Unavailable';
  return `${amount.toLocaleString(locale === 'zh' ? 'zh-CN' : 'en')} ${unit}`.trim();
}
type Metrics = { students: number; submittedStudents: number; totalRecords: number; validRecords: number;
  invalidRecords: number; pendingTeacher: number; pendingSupplement: number; technical: number;
  pendingAi: number; creditedSeconds: number };
export type CourseDirectory = {
  generatedAt: string;
  semester: { id: string; displayName: string } | null;
  summary: DirectorySummary;
  rows: { id: string; courseName: string; teacherId: string; teacherName: string;
    status: 'UPCOMING' | 'ACTIVE'; enrollmentOpen: boolean; checkInWindowMode: string;
    checkInStartDate: string | null; checkInEndDate: string | null;
    dailyStartTime: string | null; dailyEndTime: string | null;
    courseTargetSeconds: number | null; generalTargetSeconds: number | null;
    minimumMinutes?: number | null; maximumMinutes?: number | null; weeklyLimit?: number | null; dailyLimit?: number | null;
    currentMembers: Metrics; removedMembers: Metrics; completedStudents: number | null; completionRate: number | null }[];
};

export async function loadCourseDirectory() {
  const directory = await request<CourseDirectory>('/admin/course-directory');
  return { ...directory, rows: directory.rows.map(section => ({ ...section,
    semesterName: directory.semester?.displayName ?? '',
    activeStudents: section.currentMembers.students,
    removedStudents: section.removedMembers.students,
    submittedStudents: section.currentMembers.submittedStudents,
    totalRecords: section.currentMembers.totalRecords,
    validRecords: section.currentMembers.validRecords,
    invalidRecords: section.currentMembers.invalidRecords,
    creditedSeconds: section.currentMembers.creditedSeconds,
  })) };
}
