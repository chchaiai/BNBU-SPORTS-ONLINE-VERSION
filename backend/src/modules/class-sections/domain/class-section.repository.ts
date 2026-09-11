import type { ClassSectionState } from './class-section.js';
import type { ClassSectionStatus } from './class-section-status.js';

export interface ClassSectionCursorPosition {
  value: string;
  id: string;
}

export interface TeacherReference {
  id: string;
  organizationId: string;
  userId: string;
  status: string;
  deletedAt: Date | null;
}

export interface CourseReference {
  id: string;
  organizationId: string;
  status: string;
  deletedAt: Date | null;
}

export interface SemesterReference {
  id: string;
  organizationId: string;
  status: string;
  startDate: string;
  endDate: string;
}

export type ClassSectionSortField =
  'classCode' | 'displayName' | 'status' | 'createdAt' | 'updatedAt';

export interface ClassSectionListQuery {
  organizationId: string;
  teacherId?: string;
  courseId?: string;
  semesterId?: string;
  status?: ClassSectionStatus;
  search?: string;
  studentUserId?: string;
  sortField: ClassSectionSortField;
  sortDirection: 'asc' | 'desc';
  position: ClassSectionCursorPosition | null;
  limit: number;
}

export interface ClassSectionPage {
  items: ClassSectionState[];
  hasMore: boolean;
}

export abstract class ClassSectionRepository {
  abstract findTeacherByUser(
    organizationId: string,
    userId: string,
    transaction?: object,
  ): Promise<TeacherReference | null>;

  abstract findTeacherById(
    organizationId: string,
    teacherId: string,
    transaction?: object,
  ): Promise<TeacherReference | null>;

  abstract findCourse(
    organizationId: string,
    courseId: string,
    transaction?: object,
  ): Promise<CourseReference | null>;

  abstract findSemester(
    organizationId: string,
    semesterId: string,
    transaction?: object,
  ): Promise<SemesterReference | null>;

  abstract findById(
    organizationId: string,
    classSectionId: string,
    transaction?: object,
  ): Promise<ClassSectionState | null>;

  abstract findStudentVisibleById(
    organizationId: string,
    classSectionId: string,
    studentUserId: string,
  ): Promise<ClassSectionState | null>;

  abstract create(state: ClassSectionState, transaction: object): Promise<ClassSectionState>;

  abstract update(
    state: ClassSectionState,
    expectedVersion: number,
    replaceExcludedDates: boolean,
    transaction: object,
  ): Promise<ClassSectionState | null>;

  abstract close(
    state: ClassSectionState,
    expectedVersion: number,
    transaction: object,
  ): Promise<ClassSectionState | null>;

  abstract list(query: ClassSectionListQuery): Promise<ClassSectionPage>;
}
