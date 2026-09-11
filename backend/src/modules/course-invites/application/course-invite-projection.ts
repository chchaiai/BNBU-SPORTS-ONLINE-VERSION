import type { CourseInvitePolicyContext } from '../../../common/policy/qr-join-policy-resolver.js';

export interface CourseInviteProjection {
  inviteToken: string;
  classSectionId: string;
  expiresAt: string;
}

export interface CourseInvitePreviewProjection {
  classSectionId: string;
  displayName: string;
  courseCode: string;
  courseName: string;
  semesterDisplayName: string;
  teacherDisplayName: string;
  enrollmentOpen: boolean;
  expiresAt: string;
}

export function projectCourseInvitePreview(
  context: CourseInvitePolicyContext,
): CourseInvitePreviewProjection {
  return {
    classSectionId: context.classSectionId,
    displayName: context.classSection.displayName,
    courseCode: context.classSection.course.courseCode,
    courseName: context.classSection.course.courseName,
    semesterDisplayName: context.classSection.semester.displayName,
    teacherDisplayName: context.classSection.teacher.fullName,
    enrollmentOpen: context.classSection.isEnrollmentOpen,
    expiresAt: context.expiresAt.toISOString(),
  };
}
