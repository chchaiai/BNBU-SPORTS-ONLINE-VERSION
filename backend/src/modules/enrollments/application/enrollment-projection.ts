import type { AuthProjection } from '../../auth/auth.service.js';
import type { ClassSectionProjection } from '../../class-sections/application/class-section-projection.js';
import type { CourseProjection } from '../../courses/application/course-projection.js';
import type { EnrollmentState } from '../domain/enrollment.js';
import type { EnrollmentView } from '../domain/enrollment.repository.js';
import { ApplicationError } from '../../../common/errors/application-error.js';

export interface EnrollmentProjection {
  id: string;
  organizationId: string;
  semesterId: string;
  classSectionId: string;
  studentId: string;
  source: string;
  sourceReferenceId: string | null;
  status: string;
  joinedAt: string;
  endedAt: string | null;
  endReason: string | null;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
  version: number;
}

export function projectEnrollment(state: EnrollmentState): EnrollmentProjection {
  return {
    id: state.id,
    organizationId: state.organizationId,
    semesterId: state.semesterId,
    classSectionId: state.classSectionId,
    studentId: state.studentId,
    source: state.source,
    sourceReferenceId: state.sourceReferenceId,
    status: state.status,
    joinedAt: state.joinedAt.toISOString(),
    endedAt: state.endedAt?.toISOString() ?? null,
    endReason: state.endReason,
    createdBy: state.createdBy,
    createdAt: state.createdAt.toISOString(),
    updatedAt: state.updatedAt.toISOString(),
    version: state.version,
  };
}

export interface JoinResultProjection {
  studentProfile: {
    id: string;
    organizationId: string;
    userId: string;
    studentNumber: string;
    fullName: string;
    gender: string;
    gradeYear: number;
    collegeName: string | null;
    majorName: string | null;
    administrativeClassName: string | null;
    status: string;
    createdAt: string;
    updatedAt: string;
    deletedAt: string | null;
    version: number;
  };
  enrollment: EnrollmentProjection;
  course: CourseProjection;
  classSection: ClassSectionProjection;
  authSession: AuthProjection;
}

export function projectJoinResult(
  view: EnrollmentView,
  authSession: AuthProjection,
): JoinResultProjection {
  if ('retired' in view.student) throw new ApplicationError('USER_NOT_FOUND', 404);
  return {
    studentProfile: {
      ...view.student,
      organizationId: view.enrollment.organizationId,
      createdAt: view.student.createdAt.toISOString(),
      updatedAt: view.student.updatedAt.toISOString(),
      deletedAt: view.student.deletedAt?.toISOString() ?? null,
    },
    enrollment: projectEnrollment(view.enrollment),
    course: projectJoinCourse(view),
    classSection: projectJoinClassSection(view),
    authSession,
  };
}

function projectJoinCourse(view: EnrollmentView): CourseProjection {
  const course = view.classSection.course;
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

function projectJoinClassSection(view: EnrollmentView): ClassSectionProjection {
  const section = view.classSection;
  const date = (value: Date | null): string | null => value?.toISOString().slice(0, 10) ?? null;
  const time = (value: Date | null): string | null => value?.toISOString().slice(11, 19) ?? null;
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
    checkInStartDate: date(section.checkInStartDate),
    checkInEndDate: date(section.checkInEndDate),
    dailyStartTime: time(section.dailyStartTime),
    dailyEndTime: time(section.dailyEndTime),
    submissionDeadlineAt: section.submissionDeadlineAt?.toISOString() ?? null,
    excludedDates: section.excludedDates.map((value) => value.toISOString().slice(0, 10)),
    createdAt: section.createdAt.toISOString(),
    updatedAt: section.updatedAt.toISOString(),
    version: section.version,
  };
}
