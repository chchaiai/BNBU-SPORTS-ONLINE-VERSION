import type { UserRole } from '../../../common/http/request-context.js';
import type { EnrollmentEventSource, EnrollmentStatus } from './enrollment-status.js';
import type { EnrollmentState } from './enrollment.js';

export interface EnrollmentView {
  enrollment: EnrollmentState;
  student: {
    id: string;
    userId: string;
    studentNumber: string;
    fullName: string;
    gender: string;
    gradeYear: number;
    collegeName: string | null;
    majorName: string | null;
    administrativeClassName: string | null;
    status: string;
    createdAt: Date;
    updatedAt: Date;
    deletedAt: Date | null;
    version: number;
  } | { id: string; userId: string; retired: true; deletedAt: Date | null };
  classSection: {
    id: string;
    organizationId: string;
    courseId: string;
    semesterId: string;
    teacherId: string;
    teacherUserId: string;
    classCode: string;
    displayName: string;
    status: string;
    isEnrollmentOpen: boolean;
    checkInWindowMode: string;
    checkInStartDate: Date | null;
    checkInEndDate: Date | null;
    dailyStartTime: Date | null;
    dailyEndTime: Date | null;
    submissionDeadlineAt: Date | null;
    excludedDates: Date[];
    createdAt: Date;
    updatedAt: Date;
    version: number;
    course: {
      id: string;
      organizationId: string;
      courseCode: string;
      courseName: string;
      description: string | null;
      status: string;
      createdBy: string;
      createdAt: Date;
      updatedAt: Date;
      deletedAt: Date | null;
      version: number;
    };
    semester: { id: string; status: string; endDate: Date };
  };
}

export interface EnrollmentCursorPosition {
  value: string;
  id: string;
}

export interface EnrollmentListQuery {
  organizationId: string;
  role: UserRole;
  studentId?: string;
  teacherUserId?: string;
  classSectionId?: string;
  semesterId?: string;
  status?: EnrollmentStatus;
  sortDirection: 'asc' | 'desc';
  position: EnrollmentCursorPosition | null;
  limit: number;
}

export interface EnrollmentPage {
  items: EnrollmentView[];
  hasMore: boolean;
}

export interface AppendEnrollmentEventInput {
  id: string;
  organizationId: string;
  enrollmentId: string;
  fromStatus: EnrollmentStatus | null;
  toStatus: EnrollmentStatus;
  source: EnrollmentEventSource;
  reason: string | null;
  actorUserId: string;
  actorRoleSnapshot: UserRole;
  requestId: string;
  idempotencyKeyReference: string | null;
  occurredAt: Date;
  enrollmentVersion: number;
}

export abstract class EnrollmentRepository {
  abstract findViewById(
    organizationId: string,
    enrollmentId: string,
    transaction?: object,
  ): Promise<EnrollmentView | null>;

  abstract lockViewById(
    organizationId: string,
    enrollmentId: string,
    transaction: object,
  ): Promise<EnrollmentView | null>;

  abstract findStudentByUser(
    organizationId: string,
    userId: string,
    transaction?: object,
  ): Promise<{ id: string; status: string; deletedAt: Date | null } | null>;

  abstract findStudentById(
    organizationId: string,
    studentId: string,
    transaction?: object,
  ): Promise<{ id: string; userId: string; status: string; deletedAt: Date | null } | null>;

  abstract findForClassStudent(
    classSectionId: string,
    studentId: string,
    transaction: object,
  ): Promise<EnrollmentState | null>;

  abstract findActiveForSemesterStudent(
    organizationId: string,
    semesterId: string,
    studentId: string,
    transaction: object,
  ): Promise<EnrollmentState | null>;

  abstract create(state: EnrollmentState, transaction: object): Promise<EnrollmentState>;

  abstract update(
    state: EnrollmentState,
    expectedVersion: number,
    transaction: object,
  ): Promise<EnrollmentState | null>;

  abstract appendEvent(input: AppendEnrollmentEventInput, transaction: object): Promise<void>;

  abstract list(query: EnrollmentListQuery): Promise<EnrollmentPage>;
}
