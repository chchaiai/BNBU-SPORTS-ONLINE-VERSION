export const COURSE_STATUSES = ['ACTIVE', 'INACTIVE'] as const;
export type CourseStatus = (typeof COURSE_STATUSES)[number];

export function isCourseStatus(value: string): value is CourseStatus {
  return (COURSE_STATUSES as readonly string[]).includes(value);
}
