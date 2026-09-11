import type { CourseState } from '../domain/course.js';

export interface CourseProjection {
  id: string;
  organizationId: string;
  courseCode: string;
  courseName: string;
  description: string | null;
  status: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
  version: number;
}

export function projectCourse(course: CourseState): CourseProjection {
  return {
    id: course.id,
    organizationId: course.organizationId,
    courseCode: course.courseCode,
    courseName: course.courseName,
    description: course.description,
    status: course.status,
    createdBy: course.createdBy,
    createdAt: course.createdAt.toISOString(),
    updatedAt: course.updatedAt.toISOString(),
    deletedAt: course.deletedAt?.toISOString() ?? null,
    version: course.version,
  };
}
