import type { CourseState } from './course.js';
import type { CourseStatus } from './course-status.js';

export interface CourseCursorPosition {
  value: string;
  id: string;
}

export type CourseSortField = 'courseCode' | 'courseName' | 'status' | 'createdAt' | 'updatedAt';
export type SortDirection = 'asc' | 'desc';

export interface CourseListQuery {
  organizationId: string;
  status?: CourseStatus;
  search?: string;
  studentUserId?: string;
  sortField: CourseSortField;
  sortDirection: SortDirection;
  position: CourseCursorPosition | null;
  limit: number;
}

export interface CoursePage {
  items: CourseState[];
  hasMore: boolean;
}

export abstract class CourseRepository {
  abstract findById(
    organizationId: string,
    courseId: string,
    transaction?: object,
  ): Promise<CourseState | null>;

  abstract findStudentVisibleById(
    organizationId: string,
    courseId: string,
    studentUserId: string,
  ): Promise<CourseState | null>;

  abstract create(state: CourseState, transaction: object): Promise<CourseState>;

  abstract update(
    state: CourseState,
    expectedVersion: number,
    transaction: object,
  ): Promise<CourseState | null>;

  abstract list(query: CourseListQuery): Promise<CoursePage>;
}
