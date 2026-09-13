/* eslint-disable */
// Generated from docs/backend-contracts/openapi.yaml. Do not edit.

export const operationPolicies = {
  "getHealthLive": {
    "method": "GET",
    "route": "/health/live",
    "policyId": "PUBLIC-HEALTH-LIVE",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "getHealthReady": {
    "method": "GET",
    "route": "/health/ready",
    "policyId": "PUBLIC-HEALTH-READY",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "getAdminHealth": {
    "method": "GET",
    "route": "/health/admin",
    "policyId": "ADMIN-HEALTH-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "getSystemMode": {
    "method": "GET",
    "route": "/system-mode",
    "policyId": "PUBLIC-SYSTEM-MODE-READ",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "getCurrentOrganization": {
    "method": "GET",
    "route": "/organizations/current",
    "policyId": "ORGANIZATION-CURRENT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "getCurrentSemester": {
    "method": "GET",
    "route": "/semesters/current",
    "policyId": "SEMESTER-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "passwordLogin": {
    "method": "POST",
    "route": "/auth/password-login",
    "policyId": "AUTH-PASSWORD-LOGIN",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "refreshSession": {
    "method": "POST",
    "route": "/auth/refresh",
    "policyId": "AUTH-REFRESH",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "SESSION",
    "resourceResolver": "REFRESH_TOKEN",
    "defaultDeny": true
  },
  "logoutSession": {
    "method": "POST",
    "route": "/auth/logout",
    "policyId": "AUTH-LOGOUT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SESSION",
    "resourceResolver": "AUTHENTICATED_SESSION",
    "defaultDeny": true
  },
  "getCurrentUser": {
    "method": "GET",
    "route": "/me",
    "policyId": "USER-SELF-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "completeCurrentStudentProfile": {
    "method": "POST",
    "route": "/me/student-profile",
    "policyId": "STUDENT-SELF-PROFILE-COMPLETE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "requestCurrentUserEmailChallenge": {
    "method": "POST",
    "route": "/me/email-verification-challenges",
    "policyId": "USER-EMAIL-VERIFY-REQUEST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "verifyCurrentUserEmailChallenge": {
    "method": "POST",
    "route": "/me/email-verification-challenges/{challengeId}/verify",
    "policyId": "USER-EMAIL-VERIFY-COMPLETE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listStudents": {
    "method": "GET",
    "route": "/students",
    "policyId": "STUDENT-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "STUDENT_LIST_SCOPE",
    "defaultDeny": true
  },
  "getStudent": {
    "method": "GET",
    "route": "/students/{studentId}",
    "policyId": "STUDENT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "STUDENT_FROM_PATH",
    "defaultDeny": true
  },
  "updateStudent": {
    "method": "PATCH",
    "route": "/students/{studentId}",
    "policyId": "STUDENT-UPDATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "STUDENT_FROM_PATH",
    "defaultDeny": true
  },
  "getTeacher": {
    "method": "GET",
    "route": "/teachers/{teacherId}",
    "policyId": "TEACHER-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "TEACHER_FROM_PATH",
    "defaultDeny": true
  },
  "listTeacherClassSections": {
    "method": "GET",
    "route": "/teachers/{teacherId}/class-sections",
    "policyId": "TEACHER-CLASS-SECTION-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "TEACHER_FROM_PATH",
    "defaultDeny": true
  },
  "listCourses": {
    "method": "GET",
    "route": "/courses",
    "policyId": "COURSE-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "createCourse": {
    "method": "POST",
    "route": "/courses",
    "policyId": "COURSE-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "getCourse": {
    "method": "GET",
    "route": "/courses/{courseId}",
    "policyId": "COURSE-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "COURSE_FROM_PATH",
    "defaultDeny": true
  },
  "updateCourse": {
    "method": "PATCH",
    "route": "/courses/{courseId}",
    "policyId": "COURSE-UPDATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "COURSE_FROM_PATH",
    "defaultDeny": true
  },
  "listClassSections": {
    "method": "GET",
    "route": "/class-sections",
    "policyId": "CLASS-SECTION-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "CLASS_SECTION_LIST_SCOPE",
    "defaultDeny": true
  },
  "createClassSection": {
    "method": "POST",
    "route": "/class-sections",
    "policyId": "CLASS-SECTION-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "CLASS_SECTION_FROM_REQUEST",
    "defaultDeny": true
  },
  "getClassSection": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}",
    "policyId": "CLASS-SECTION-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "CLASS_SECTION_FROM_PATH",
    "defaultDeny": true
  },
  "updateClassSection": {
    "method": "PATCH",
    "route": "/class-sections/{classSectionId}",
    "policyId": "CLASS-SECTION-UPDATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "CLASS_SECTION_FROM_PATH",
    "defaultDeny": true
  },
  "closeClassSection": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/close",
    "policyId": "CLASS-SECTION-CLOSE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "CLASS_SECTION_FROM_PATH",
    "defaultDeny": true
  },
  "listEnrollments": {
    "method": "GET",
    "route": "/enrollments",
    "policyId": "ENROLLMENT-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "ENROLLMENT_LIST_SCOPE",
    "defaultDeny": true
  },
  "manuallyEnrollStudent": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/enrollments",
    "policyId": "ENROLLMENT-MANUAL-ADD",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "CLASS_SECTION_FROM_PATH",
    "defaultDeny": true
  },
  "getEnrollment": {
    "method": "GET",
    "route": "/enrollments/{enrollmentId}",
    "policyId": "ENROLLMENT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "ENROLLMENT_FROM_PATH",
    "defaultDeny": true
  },
  "withdrawEnrollment": {
    "method": "POST",
    "route": "/enrollments/{enrollmentId}/withdraw",
    "policyId": "ENROLLMENT-WITHDRAW",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "ENROLLMENT_FROM_PATH",
    "defaultDeny": true
  },
  "removeEnrollment": {
    "method": "POST",
    "route": "/enrollments/{enrollmentId}/remove",
    "policyId": "ENROLLMENT-REMOVE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "ENROLLMENT_FROM_PATH",
    "defaultDeny": true
  },
  "restoreEnrollment": {
    "method": "POST",
    "route": "/enrollments/{enrollmentId}/restore",
    "policyId": "ENROLLMENT-RESTORE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "ENROLLMENT_FROM_PATH",
    "defaultDeny": true
  },
  "createCourseInvite": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/course-invites",
    "policyId": "COURSE-INVITE-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "CLASS_SECTION_FROM_PATH",
    "defaultDeny": true
  },
  "previewCourseInvite": {
    "method": "GET",
    "route": "/course-invites/{inviteToken}/preview",
    "policyId": "PUBLIC-COURSE-INVITE-PREVIEW",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "PUBLIC_INVITE",
    "resourceResolver": "COURSE_INVITE_FROM_PATH",
    "defaultDeny": true
  },
  "issueJoinCapability": {
    "method": "POST",
    "route": "/course-invites/{inviteToken}/join-capabilities",
    "policyId": "PUBLIC-JOIN-CAPABILITY-ISSUE",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "PUBLIC_INVITE",
    "resourceResolver": "COURSE_INVITE_FROM_PATH",
    "defaultDeny": true
  },
  "joinClassSectionWithInvite": {
    "method": "POST",
    "route": "/course-invites/{inviteToken}/join",
    "policyId": "ENROLLMENT-JOIN",
    "authentication": "JOIN_CAPABILITY",
    "allowedRoles": [],
    "organizationScope": "CAPABILITY_ORGANIZATION",
    "resourceScope": "CAPABILITY_CLASS_SECTION",
    "resourceResolver": "JOIN_CAPABILITY",
    "defaultDeny": true
  },
  "listRosterImports": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/roster-imports",
    "policyId": "ROSTER-IMPORT-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "ROSTER_CLASS_SECTION_READ_SCOPE",
    "defaultDeny": true
  },
  "createRosterImport": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/roster-imports",
    "policyId": "ROSTER-IMPORT-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "CLASS_SECTION_FROM_PATH",
    "defaultDeny": true
  },
  "getCurrentRosterImport": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/roster-imports/current",
    "policyId": "ROSTER-IMPORT-CURRENT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "ROSTER_CLASS_SECTION_READ_SCOPE",
    "defaultDeny": true
  },
  "getRosterImport": {
    "method": "GET",
    "route": "/roster-imports/{rosterImportId}",
    "policyId": "ROSTER-IMPORT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "ROSTER_IMPORT_READ_SCOPE",
    "defaultDeny": true
  },
  "rollbackRosterImport": {
    "method": "POST",
    "route": "/roster-imports/{rosterImportId}/rollback",
    "policyId": "ROSTER-IMPORT-ROLLBACK",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "ROSTER_IMPORT_FROM_PATH",
    "defaultDeny": true
  },
  "listRosterEntries": {
    "method": "GET",
    "route": "/roster-imports/{rosterImportId}/entries",
    "policyId": "ROSTER-ENTRY-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "ROSTER_IMPORT_READ_SCOPE",
    "defaultDeny": true
  },
  "alignRosterImport": {
    "method": "POST",
    "route": "/roster-imports/{rosterImportId}/align",
    "policyId": "ROSTER-IMPORT-ALIGN",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "ROSTER_IMPORT_FROM_PATH",
    "defaultDeny": true
  },
  "listRosterAlignmentResults": {
    "method": "GET",
    "route": "/roster-alignment-results",
    "policyId": "ROSTER-ALIGNMENT-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "ROSTER_ALIGNMENT_LIST_SCOPE",
    "defaultDeny": true
  },
  "getRosterAlignmentResult": {
    "method": "GET",
    "route": "/roster-alignment-results/{alignmentResultId}",
    "policyId": "ROSTER-ALIGNMENT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "ROSTER_ALIGNMENT_READ_SCOPE",
    "defaultDeny": true
  },
  "confirmRosterAlignmentResult": {
    "method": "POST",
    "route": "/roster-alignment-results/{alignmentResultId}/confirm",
    "policyId": "ROSTER-ALIGNMENT-CONFIRM",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "ROSTER_ALIGNMENT_FROM_PATH",
    "defaultDeny": true
  },
  "resolveRosterAlignmentResult": {
    "method": "POST",
    "route": "/roster-alignment-results/{alignmentResultId}/resolve",
    "policyId": "ROSTER-ALIGNMENT-RESOLVE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "ROSTER_ALIGNMENT_FROM_PATH",
    "defaultDeny": true
  },
  "ignoreRosterAlignmentResult": {
    "method": "POST",
    "route": "/roster-alignment-results/{alignmentResultId}/ignore",
    "policyId": "ROSTER-ALIGNMENT-IGNORE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "ROSTER_ALIGNMENT_FROM_PATH",
    "defaultDeny": true
  },
  "reopenRosterAlignmentResult": {
    "method": "POST",
    "route": "/roster-alignment-results/{alignmentResultId}/reopen",
    "policyId": "ROSTER-ALIGNMENT-REOPEN",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "ROSTER_ALIGNMENT_FROM_PATH",
    "defaultDeny": true
  },
  "startExerciseSession": {
    "method": "POST",
    "route": "/exercise-sessions",
    "policyId": "EXERCISE-SESSION-START",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "ENROLLMENT_FROM_REQUEST",
    "defaultDeny": true
  },
  "getActiveExerciseSession": {
    "method": "GET",
    "route": "/exercise-sessions/active",
    "policyId": "EXERCISE-SESSION-ACTIVE-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_STUDENT",
    "defaultDeny": true
  },
  "getExerciseSession": {
    "method": "GET",
    "route": "/exercise-sessions/{sessionId}",
    "policyId": "EXERCISE-SESSION-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_PATH",
    "defaultDeny": true
  },
  "pauseExerciseSession": {
    "method": "POST",
    "route": "/exercise-sessions/{sessionId}/pause",
    "policyId": "EXERCISE-SESSION-PAUSE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_PATH",
    "defaultDeny": true
  },
  "resumeExerciseSession": {
    "method": "POST",
    "route": "/exercise-sessions/{sessionId}/resume",
    "policyId": "EXERCISE-SESSION-RESUME",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_PATH",
    "defaultDeny": true
  },
  "finishExerciseSession": {
    "method": "POST",
    "route": "/exercise-sessions/{sessionId}/finish",
    "policyId": "EXERCISE-SESSION-FINISH",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_PATH",
    "defaultDeny": true
  },
  "cancelExerciseSession": {
    "method": "POST",
    "route": "/exercise-sessions/{sessionId}/cancel",
    "policyId": "EXERCISE-SESSION-CANCEL",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_PATH",
    "defaultDeny": true
  },
  "reconcileExerciseSession": {
    "method": "POST",
    "route": "/exercise-sessions/{sessionId}/reconcile",
    "policyId": "EXERCISE-SESSION-RECONCILE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_PATH",
    "defaultDeny": true
  },
  "listExerciseRecords": {
    "method": "GET",
    "route": "/exercise-records",
    "policyId": "EXERCISE-RECORD-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "EXERCISE_RECORD_LIST_SCOPE",
    "defaultDeny": true
  },
  "createExerciseRecordDraft": {
    "method": "POST",
    "route": "/exercise-records",
    "policyId": "EXERCISE-RECORD-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_REQUEST",
    "defaultDeny": true
  },
  "getExerciseRecord": {
    "method": "GET",
    "route": "/exercise-records/{recordId}",
    "policyId": "EXERCISE-RECORD-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "updateExerciseRecordDraft": {
    "method": "PATCH",
    "route": "/exercise-records/{recordId}",
    "policyId": "EXERCISE-RECORD-UPDATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "getExerciseRecordEvidenceContext": {
    "method": "GET",
    "route": "/exercise-records/{recordId}/evidence-context",
    "policyId": "EXERCISE-RECORD-EVIDENCE-CONTEXT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "submitExerciseRecord": {
    "method": "POST",
    "route": "/exercise-records/{recordId}/submit",
    "policyId": "EXERCISE-RECORD-SUBMIT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "discardExerciseRecord": {
    "method": "POST",
    "route": "/exercise-records/{recordId}/discard",
    "policyId": "EXERCISE-RECORD-DISCARD",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "withdrawExerciseRecord": {
    "method": "POST",
    "route": "/exercise-records/{recordId}/withdraw",
    "policyId": "EXERCISE-RECORD-WITHDRAW",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "initiateMediaUpload": {
    "method": "POST",
    "route": "/media-uploads",
    "policyId": "MEDIA-UPLOAD-INITIATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "MEDIA_TARGET_FROM_REQUEST",
    "defaultDeny": true
  },
  "confirmMediaUpload": {
    "method": "POST",
    "route": "/media-uploads/{uploadSessionId}/confirm",
    "policyId": "MEDIA-UPLOAD-CONFIRM",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "MEDIA_UPLOAD_FROM_PATH",
    "defaultDeny": true
  },
  "getMediaEvidence": {
    "method": "GET",
    "route": "/media/{mediaId}",
    "policyId": "MEDIA-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "MEDIA_FROM_PATH",
    "defaultDeny": true
  },
  "bindMediaEvidence": {
    "method": "POST",
    "route": "/media/{mediaId}/bind",
    "policyId": "MEDIA-BIND",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "MEDIA_FROM_PATH",
    "defaultDeny": true
  },
  "createMediaAccessUrl": {
    "method": "POST",
    "route": "/media/{mediaId}/access-url",
    "policyId": "MEDIA-ACCESS-URL",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "MEDIA_FROM_PATH",
    "defaultDeny": true
  },
  "listExerciseRecordReviews": {
    "method": "GET",
    "route": "/exercise-records/{recordId}/reviews",
    "policyId": "EXERCISE-REVIEW-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "reviewExerciseRecord": {
    "method": "POST",
    "route": "/exercise-records/{recordId}/reviews",
    "policyId": "EXERCISE-REVIEW-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "reopenExerciseRecordReview": {
    "method": "POST",
    "route": "/exercise-records/{recordId}/reviews/reopen",
    "policyId": "EXERCISE-REVIEW-REOPEN",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "batchReviewExerciseRecords": {
    "method": "POST",
    "route": "/exercise-reviews/batch",
    "policyId": "EXERCISE-REVIEW-BATCH",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "BATCH_EXERCISE_RECORDS_FROM_BODY",
    "defaultDeny": true
  },
  "listScoreRules": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/score-rules",
    "policyId": "SCORE-RULE-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "CLASS_SECTION_FROM_PATH",
    "defaultDeny": true
  },
  "createScoreRule": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/score-rules",
    "policyId": "SCORE-RULE-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "getScoreRule": {
    "method": "GET",
    "route": "/score-rules/{scoreRuleId}",
    "policyId": "SCORE-RULE-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "SCORE_RULE_FROM_PATH",
    "defaultDeny": true
  },
  "submitScoreRuleForApproval": {
    "method": "POST",
    "route": "/score-rules/{scoreRuleId}/submit-approval",
    "policyId": "SCORE-RULE-SUBMIT-APPROVAL",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "SCORE_RULE_FROM_PATH",
    "defaultDeny": true
  },
  "approveScoreRule": {
    "method": "POST",
    "route": "/score-rules/{scoreRuleId}/approve",
    "policyId": "SCORE-RULE-APPROVE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "SCORE_RULE_FROM_PATH",
    "defaultDeny": true
  },
  "rejectScoreRule": {
    "method": "POST",
    "route": "/score-rules/{scoreRuleId}/reject",
    "policyId": "SCORE-RULE-REJECT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "SCORE_RULE_FROM_PATH",
    "defaultDeny": true
  },
  "listStudentScores": {
    "method": "GET",
    "route": "/student-scores",
    "policyId": "STUDENT-SCORE-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "STUDENT_SCORE_LIST_SCOPE",
    "defaultDeny": true
  },
  "getStudentScore": {
    "method": "GET",
    "route": "/student-scores/{studentScoreId}",
    "policyId": "STUDENT-SCORE-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "STUDENT_SCORE_FROM_PATH",
    "defaultDeny": true
  },
  "recalculateStudentScore": {
    "method": "POST",
    "route": "/student-scores/{studentScoreId}/recalculate",
    "policyId": "STUDENT-SCORE-RECALCULATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "STUDENT_SCORE_FROM_PATH",
    "defaultDeny": true
  },
  "publishStudentScore": {
    "method": "POST",
    "route": "/student-scores/{studentScoreId}/publish",
    "policyId": "STUDENT-SCORE-PUBLISH",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "STUDENT_SCORE_FROM_PATH",
    "defaultDeny": true
  },
  "openStudentScoreCorrection": {
    "method": "POST",
    "route": "/student-scores/{studentScoreId}/open-correction",
    "policyId": "STUDENT-SCORE-OPEN-CORRECTION",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "STUDENT_SCORE_FROM_PATH",
    "defaultDeny": true
  },
  "listScoreAdjustments": {
    "method": "GET",
    "route": "/student-scores/{studentScoreId}/adjustments",
    "policyId": "SCORE-ADJUSTMENT-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "STUDENT_SCORE_FROM_PATH",
    "defaultDeny": true
  },
  "createScoreAdjustment": {
    "method": "POST",
    "route": "/student-scores/{studentScoreId}/adjustments",
    "policyId": "SCORE-ADJUSTMENT-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "STUDENT_SCORE_FROM_PATH",
    "defaultDeny": true
  },
  "approveScoreAdjustment": {
    "method": "POST",
    "route": "/score-adjustments/{scoreAdjustmentId}/approve",
    "policyId": "SCORE-ADJUSTMENT-APPROVE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "SCORE_ADJUSTMENT_FROM_PATH",
    "defaultDeny": true
  },
  "rejectScoreAdjustment": {
    "method": "POST",
    "route": "/score-adjustments/{scoreAdjustmentId}/reject",
    "policyId": "SCORE-ADJUSTMENT-REJECT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "SCORE_ADJUSTMENT_FROM_PATH",
    "defaultDeny": true
  },
  "listExports": {
    "method": "GET",
    "route": "/exports",
    "policyId": "EXPORT-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "EXPORT_LIST_SCOPE",
    "defaultDeny": true
  },
  "createExport": {
    "method": "POST",
    "route": "/exports",
    "policyId": "EXPORT-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "EXPORT_SCOPE_FROM_BODY",
    "defaultDeny": true
  },
  "getExport": {
    "method": "GET",
    "route": "/exports/{exportId}",
    "policyId": "EXPORT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "EXPORT_FROM_PATH",
    "defaultDeny": true
  },
  "createExportDownloadUrl": {
    "method": "POST",
    "route": "/exports/{exportId}/download-url",
    "policyId": "EXPORT-DOWNLOAD-URL",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "EXPORT_FROM_PATH",
    "defaultDeny": true
  },
  "listAuditLogs": {
    "method": "GET",
    "route": "/audit-logs",
    "policyId": "AUDIT-LOG-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "getAuditLog": {
    "method": "GET",
    "route": "/audit-logs/{auditLogId}",
    "policyId": "AUDIT-LOG-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "AUDIT_LOG_FROM_PATH",
    "defaultDeny": true
  },
  "requestStudentSignInCode": {
    "method": "POST",
    "route": "/auth/student-sign-in-codes",
    "policyId": "AUTH-STUDENT-CODE-REQUEST",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "verifyStudentSignInCode": {
    "method": "POST",
    "route": "/auth/student-sign-in-codes/verify",
    "policyId": "AUTH-STUDENT-CODE-VERIFY",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "requestAccountRecovery": {
    "method": "POST",
    "route": "/auth/account-recovery-requests",
    "policyId": "AUTH-ACCOUNT-RECOVERY-REQUEST",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "completeAccountRecovery": {
    "method": "POST",
    "route": "/auth/account-recovery-requests/complete",
    "policyId": "AUTH-ACCOUNT-RECOVERY-COMPLETE",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "listNotifications": {
    "method": "GET",
    "route": "/notifications",
    "policyId": "NOTIFICATION-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "markNotificationRead": {
    "method": "POST",
    "route": "/notifications/{notificationId}/read",
    "policyId": "NOTIFICATION-MARK-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "registerPushDevice": {
    "method": "POST",
    "route": "/push-devices",
    "policyId": "PUSH-DEVICE-REGISTER",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "unregisterPushDevice": {
    "method": "DELETE",
    "route": "/push-devices/{deviceId}",
    "policyId": "PUSH-DEVICE-UNREGISTER",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getCurrentUserPreferences": {
    "method": "GET",
    "route": "/me/preferences",
    "policyId": "USER-PREFERENCES-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "updateCurrentUserPreferences": {
    "method": "PATCH",
    "route": "/me/preferences",
    "policyId": "USER-PREFERENCES-UPDATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listHelpArticles": {
    "method": "GET",
    "route": "/help-articles",
    "policyId": "PUBLIC-HELP-ARTICLE-LIST",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "getHelpArticle": {
    "method": "GET",
    "route": "/help-articles/{articleId}",
    "policyId": "PUBLIC-HELP-ARTICLE-READ",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "listFeedback": {
    "method": "GET",
    "route": "/feedback",
    "policyId": "FEEDBACK-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "createFeedback": {
    "method": "POST",
    "route": "/feedback",
    "policyId": "FEEDBACK-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getFeedback": {
    "method": "GET",
    "route": "/feedback/{feedbackId}",
    "policyId": "FEEDBACK-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "listStructuredExemptionApplications": {
    "method": "GET",
    "route": "/exemption-application-details",
    "policyId": "EXEMPTION-APPLICATION-STRUCTURED-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "listExemptionApplications": {
    "method": "GET",
    "route": "/exemption-applications",
    "policyId": "EXEMPTION-APPLICATION-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "createExemptionApplication": {
    "method": "POST",
    "route": "/exemption-applications",
    "policyId": "EXEMPTION-APPLICATION-CREATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_STUDENT",
    "defaultDeny": true
  },
  "getExemptionApplication": {
    "method": "GET",
    "route": "/exemption-applications/{applicationId}",
    "policyId": "EXEMPTION-APPLICATION-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "updateExemptionApplication": {
    "method": "PATCH",
    "route": "/exemption-applications/{applicationId}",
    "policyId": "EXEMPTION-APPLICATION-UPDATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_STUDENT",
    "defaultDeny": true
  },
  "submitExemptionApplication": {
    "method": "POST",
    "route": "/exemption-applications/{applicationId}/submit",
    "policyId": "EXEMPTION-APPLICATION-SUBMIT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_STUDENT",
    "defaultDeny": true
  },
  "reviewExemptionApplication": {
    "method": "POST",
    "route": "/exemption-applications/{applicationId}/review",
    "policyId": "EXEMPTION-APPLICATION-REVIEW",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "TEACHER_CLASS_SECTION",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "getAppReleasePolicy": {
    "method": "GET",
    "route": "/app-release-policy",
    "policyId": "PUBLIC-APP-RELEASE-POLICY-READ",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "getSportCatalog": {
    "method": "GET",
    "route": "/sport-catalog",
    "policyId": "SPORT-CATALOG-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "getActivityConversionRules": {
    "method": "GET",
    "route": "/activity-conversion-rules",
    "policyId": "ACTIVITY-CONVERSION-RULE-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "startExerciseLocationTrack": {
    "method": "POST",
    "route": "/exercise-sessions/{sessionId}/location-track",
    "policyId": "LOCATION-TRACK-START",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_PATH",
    "defaultDeny": true
  },
  "appendExerciseLocationSamples": {
    "method": "POST",
    "route": "/exercise-sessions/{sessionId}/location-samples",
    "policyId": "LOCATION-SAMPLE-APPEND",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_PATH",
    "defaultDeny": true
  },
  "finalizeExerciseLocationTrack": {
    "method": "POST",
    "route": "/exercise-sessions/{sessionId}/location-track/finalize",
    "policyId": "LOCATION-TRACK-FINALIZE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "EXERCISE_SESSION_FROM_PATH",
    "defaultDeny": true
  },
  "getExerciseRecordLocationSummary": {
    "method": "GET",
    "route": "/exercise-records/{recordId}/location-summary",
    "policyId": "LOCATION-SUMMARY-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ROLE_SCOPED",
    "resourceResolver": "EXERCISE_RECORD_FROM_PATH",
    "defaultDeny": true
  },
  "getLocationPrivacyPolicy": {
    "method": "GET",
    "route": "/location-privacy-policy",
    "policyId": "LOCATION-PRIVACY-POLICY-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "updateLocationPrivacyPolicy": {
    "method": "PATCH",
    "route": "/location-privacy-policy",
    "policyId": "LOCATION-PRIVACY-POLICY-UPDATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "getV81CourseRules": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/v81-rules",
    "policyId": "GET-V81-COURSE-RULES",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "saveV81CourseRules": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/v81-rules",
    "policyId": "SAVE-V81-COURSE-RULES",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "setV81ManualMode": {
    "method": "POST",
    "route": "/admin/review-services/manual-mode",
    "policyId": "SET-V81-MANUAL-MODE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "reviewV81Record": {
    "method": "POST",
    "route": "/exercise-records/{recordId}/v81-reviews",
    "policyId": "REVIEW-V81-RECORD",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81RecordWorkflow": {
    "method": "GET",
    "route": "/exercise-records/{recordId}/workflow",
    "policyId": "GET-V81-RECORD-WORKFLOW",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "submitV81Supplement": {
    "method": "POST",
    "route": "/exercise-records/{recordId}/supplements",
    "policyId": "SUBMIT-V81-SUPPLEMENT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "correctV81Record": {
    "method": "POST",
    "route": "/exercise-records/{recordId}/corrections",
    "policyId": "CORRECT-V81-RECORD",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81MaintenanceAnnouncement": {
    "method": "GET",
    "route": "/system-mode/announcement",
    "policyId": "GET-V81-MAINTENANCE-ANNOUNCEMENT",
    "authentication": "PUBLIC",
    "allowedRoles": [],
    "organizationScope": "NONE",
    "resourceScope": "NONE",
    "resourceResolver": "NONE",
    "defaultDeny": true
  },
  "getV81SystemModeHistory": {
    "method": "GET",
    "route": "/system-mode/history",
    "policyId": "GET-V81-SYSTEM-MODE-HISTORY",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "changeV81SystemMode": {
    "method": "POST",
    "route": "/system-mode/changes",
    "policyId": "CHANGE-V81-SYSTEM-MODE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81SupplementClock": {
    "method": "GET",
    "route": "/exercise-records/{recordId}/supplement-clock",
    "policyId": "GET-V81-SUPPLEMENT-CLOCK",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81AccountSecurity": {
    "method": "GET",
    "route": "/auth/account-security",
    "policyId": "GET-V81-ACCOUNT-SECURITY",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "changeOwnV81Password": {
    "method": "POST",
    "route": "/auth/own-password",
    "policyId": "CHANGE-OWN-V81-PASSWORD",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81Subadmins": {
    "method": "GET",
    "route": "/admin/subadmins",
    "policyId": "LIST-V81-SUBADMINS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81VerifiedSubadmin": {
    "method": "POST",
    "route": "/admin/subadmins",
    "policyId": "CREATE-V81-VERIFIED-SUBADMIN",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "setV81SubadminStatus": {
    "method": "POST",
    "route": "/admin/subadmins/{id}/status",
    "policyId": "SET-V81-SUBADMIN-STATUS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81StudentProgress": {
    "method": "GET",
    "route": "/student-progress",
    "policyId": "LIST-V81-STUDENT-PROGRESS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81TeacherProgress": {
    "method": "GET",
    "route": "/teacher-progress",
    "policyId": "LIST-V81-TEACHER-PROGRESS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81ProgressTarget": {
    "method": "GET",
    "route": "/class-sections/{id}/progress-target",
    "policyId": "GET-V81-PROGRESS-TARGET",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81Certifications": {
    "method": "GET",
    "route": "/activity-certification-applications",
    "policyId": "LIST-V81-CERTIFICATIONS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81RecognitionRevisions": {
    "method": "GET",
    "route": "/activity-certification-applications/{id}/recognition-allocation-revisions",
    "policyId": "LIST-V81-RECOGNITION-REVISIONS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "adjustV81Recognition": {
    "method": "POST",
    "route": "/activity-certification-applications/{id}/recognition-allocation-revisions",
    "policyId": "ADJUST-V81-RECOGNITION",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "revokeV81Certification": {
    "method": "POST",
    "route": "/activity-certification-applications/{id}/revoke",
    "policyId": "REVOKE-V81-CERTIFICATION",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81ManualMode": {
    "method": "GET",
    "route": "/admin/review-services/manual-mode/{classSectionId}",
    "policyId": "GET-V81-MANUAL-MODE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81SwimIntake": {
    "method": "GET",
    "route": "/exercise-records/{recordId}/swim-intake",
    "policyId": "GET-V81-SWIM-INTAKE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "acceptV81SwimIntake": {
    "method": "POST",
    "route": "/exercise-records/{recordId}/swim-intake",
    "policyId": "ACCEPT-V81-SWIM-INTAKE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81ProofTodos": {
    "method": "GET",
    "route": "/student/proof-todos",
    "policyId": "LIST-V81-PROOF-TODOS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81FinalGrades": {
    "method": "GET",
    "route": "/enrollments/{enrollmentId}/final-grades",
    "policyId": "LIST-V81-FINAL-GRADES",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "appendV81FinalGrade": {
    "method": "POST",
    "route": "/enrollments/{enrollmentId}/final-grades",
    "policyId": "APPEND-V81-FINAL-GRADE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81SettlementCheck": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/settlement-check",
    "policyId": "GET-V81-SETTLEMENT-CHECK",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81FeedbackDetail": {
    "method": "GET",
    "route": "/admin/feedback/{feedbackId}",
    "policyId": "GET-V81-FEEDBACK-DETAIL",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "handleV81Feedback": {
    "method": "POST",
    "route": "/admin/feedback/{feedbackId}/handling",
    "policyId": "HANDLE-V81-FEEDBACK",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81Feedback": {
    "method": "GET",
    "route": "/admin/feedback",
    "policyId": "LIST-V81-FEEDBACK",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81StudentFeedbackHistory": {
    "method": "GET",
    "route": "/student/feedback/{feedbackId}/history",
    "policyId": "GET-V81-STUDENT-FEEDBACK-HISTORY",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81HelpArticles": {
    "method": "GET",
    "route": "/admin/help-articles",
    "policyId": "LIST-V81-HELP-ARTICLES",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81HelpArticle": {
    "method": "POST",
    "route": "/admin/help-articles",
    "policyId": "CREATE-V81-HELP-ARTICLE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81HelpArticle": {
    "method": "GET",
    "route": "/admin/help-articles/{articleId}",
    "policyId": "GET-V81-HELP-ARTICLE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "saveV81HelpArticle": {
    "method": "POST",
    "route": "/admin/help-articles/{articleId}",
    "policyId": "SAVE-V81-HELP-ARTICLE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81StudentHelpArticles": {
    "method": "GET",
    "route": "/student/help-articles",
    "policyId": "LIST-V81-STUDENT-HELP-ARTICLES",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81StudentHelpArticle": {
    "method": "GET",
    "route": "/student/help-articles/{articleId}",
    "policyId": "GET-V81-STUDENT-HELP-ARTICLE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81EnduranceTables": {
    "method": "GET",
    "route": "/admin/endurance-tables",
    "policyId": "LIST-V81-ENDURANCE-TABLES",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81EnduranceRule": {
    "method": "POST",
    "route": "/admin/endurance-tables/rules",
    "policyId": "CREATE-V81-ENDURANCE-RULE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "updateV81EnduranceRule": {
    "method": "POST",
    "route": "/admin/endurance-tables/rules/{ruleId}",
    "policyId": "UPDATE-V81-ENDURANCE-RULE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "deleteV81EnduranceRule": {
    "method": "POST",
    "route": "/admin/endurance-tables/rules/{ruleId}/delete",
    "policyId": "DELETE-V81-ENDURANCE-RULE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81PhysicalResults": {
    "method": "GET",
    "route": "/enrollments/{enrollmentId}/physical-results",
    "policyId": "LIST-V81-PHYSICAL-RESULTS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "appendV81PhysicalResult": {
    "method": "POST",
    "route": "/enrollments/{enrollmentId}/physical-results",
    "policyId": "APPEND-V81-PHYSICAL-RESULT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81StudentPhysicalResult": {
    "method": "GET",
    "route": "/student/enrollments/{enrollmentId}/physical-result",
    "policyId": "GET-V81-STUDENT-PHYSICAL-RESULT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81PhysicalImports": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/physical-imports",
    "policyId": "LIST-V81-PHYSICAL-IMPORTS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81PhysicalImport": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/physical-imports",
    "policyId": "CREATE-V81-PHYSICAL-IMPORT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81PhysicalImport": {
    "method": "GET",
    "route": "/physical-imports/{importId}",
    "policyId": "GET-V81-PHYSICAL-IMPORT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81PhysicalImportRevisions": {
    "method": "GET",
    "route": "/physical-imports/{importId}/revisions",
    "policyId": "LIST-V81-PHYSICAL-IMPORT-REVISIONS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "reviseV81PhysicalImport": {
    "method": "POST",
    "route": "/physical-imports/{importId}/revisions",
    "policyId": "REVISE-V81-PHYSICAL-IMPORT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "confirmV81PhysicalImport": {
    "method": "POST",
    "route": "/physical-imports/{importId}/confirm",
    "policyId": "CONFIRM-V81-PHYSICAL-IMPORT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81PhysicalImportSource": {
    "method": "GET",
    "route": "/physical-imports/{importId}/source",
    "policyId": "GET-V81-PHYSICAL-IMPORT-SOURCE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81PhysicalXlsxImport": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/physical-imports/xlsx",
    "policyId": "CREATE-V81-PHYSICAL-XLSX-IMPORT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "previewV81TeacherImport": {
    "method": "POST",
    "route": "/admin/teacher-imports/preview",
    "policyId": "PREVIEW-V81-TEACHER-IMPORT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "confirmV81TeacherImport": {
    "method": "POST",
    "route": "/admin/teacher-imports/confirm",
    "policyId": "CONFIRM-V81-TEACHER-IMPORT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81TeacherAccounts": {
    "method": "GET",
    "route": "/admin/teacher-accounts",
    "policyId": "LIST-V81-TEACHER-ACCOUNTS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81Semesters": {
    "method": "GET",
    "route": "/admin/semesters",
    "policyId": "LIST-V81-SEMESTERS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81Semester": {
    "method": "POST",
    "route": "/admin/semesters",
    "policyId": "CREATE-V81-SEMESTER",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "updateV81Semester": {
    "method": "POST",
    "route": "/admin/semesters/{id}",
    "policyId": "UPDATE-V81-SEMESTER",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "previewV81RosterRegistration": {
    "method": "GET",
    "route": "/roster-imports/{rosterImportId}/registration-preview",
    "policyId": "PREVIEW-V81-ROSTER-REGISTRATION",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81RosterConfirmation": {
    "method": "GET",
    "route": "/roster-imports/{rosterImportId}/confirmation",
    "policyId": "GET-V81-ROSTER-CONFIRMATION",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "confirmV81Roster": {
    "method": "POST",
    "route": "/roster-imports/{rosterImportId}/confirmation",
    "policyId": "CONFIRM-V81-ROSTER",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "previewV81CompositeRoster": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/composite-roster",
    "policyId": "PREVIEW-V81-COMPOSITE-ROSTER",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "exportV81CompositeRosterPreview": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/composite-roster/export",
    "policyId": "EXPORT-V81-COMPOSITE-ROSTER-PREVIEW",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81RosterSource": {
    "method": "GET",
    "route": "/roster-imports/{rosterImportId}/source",
    "policyId": "GET-V81-ROSTER-SOURCE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81OwnRosterStatus": {
    "method": "GET",
    "route": "/enrollments/{enrollmentId}/roster-status",
    "policyId": "GET-V81-OWN-ROSTER-STATUS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81AdminRosterSummary": {
    "method": "GET",
    "route": "/admin/class-sections/{classSectionId}/roster-summary",
    "policyId": "GET-V81-ADMIN-ROSTER-SUMMARY",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81AdminCourseDirectory": {
    "method": "GET",
    "route": "/admin/course-directory",
    "policyId": "GET-V81-ADMIN-COURSE-DIRECTORY",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81AdminPhysicalSummary": {
    "method": "GET",
    "route": "/admin/class-sections/{classSectionId}/physical-summary",
    "policyId": "GET-V81-ADMIN-PHYSICAL-SUMMARY",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81OcrRosterBatch": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/ocr-roster-batches",
    "policyId": "CREATE-V81-OCR-ROSTER-BATCH",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81OcrPhysicalBatch": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/ocr-physical-batches",
    "policyId": "CREATE-V81-OCR-PHYSICAL-BATCH",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81OcrBatches": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/ocr-batches",
    "policyId": "LIST-V81-OCR-BATCHES",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81OcrBatch": {
    "method": "GET",
    "route": "/ocr-batches/{batchId}",
    "policyId": "GET-V81-OCR-BATCH",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81OcrPageSource": {
    "method": "GET",
    "route": "/ocr-batches/{batchId}/pages/{pageId}/source",
    "policyId": "GET-V81-OCR-PAGE-SOURCE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81OcrPageRecognition": {
    "method": "GET",
    "route": "/ocr-batches/{batchId}/pages/{pageId}/recognition",
    "policyId": "GET-V81-OCR-PAGE-RECOGNITION",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81OcrJob": {
    "method": "POST",
    "route": "/ocr-batches/{batchId}/pages/{pageId}/recognition",
    "policyId": "CREATE-V81-OCR-JOB",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81OcrJob": {
    "method": "GET",
    "route": "/ocr-jobs/{jobId}",
    "policyId": "GET-V81-OCR-JOB",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81OcrDraft": {
    "method": "GET",
    "route": "/ocr-batches/{batchId}/draft",
    "policyId": "GET-V81-OCR-DRAFT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81OcrDraft": {
    "method": "POST",
    "route": "/ocr-batches/{batchId}/draft",
    "policyId": "CREATE-V81-OCR-DRAFT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "reviseV81OcrDraft": {
    "method": "POST",
    "route": "/ocr-batches/{batchId}/draft/revisions",
    "policyId": "REVISE-V81-OCR-DRAFT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81OcrPhysicalConfirmation": {
    "method": "GET",
    "route": "/ocr-batches/{batchId}/physical-confirmations",
    "policyId": "GET-V81-OCR-PHYSICAL-CONFIRMATION",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "confirmV81OcrPhysicalRows": {
    "method": "POST",
    "route": "/ocr-batches/{batchId}/physical-confirmations",
    "policyId": "CONFIRM-V81-OCR-PHYSICAL-ROWS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81OcrRosterConfirmation": {
    "method": "GET",
    "route": "/ocr-batches/{batchId}/roster-confirmation",
    "policyId": "GET-V81-OCR-ROSTER-CONFIRMATION",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "confirmV81OcrRoster": {
    "method": "POST",
    "route": "/ocr-batches/{batchId}/roster-confirmation",
    "policyId": "CONFIRM-V81-OCR-ROSTER",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81RosterBasis": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/roster-basis",
    "policyId": "GET-V81-ROSTER-BASIS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "selectV81RosterBasis": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/roster-basis",
    "policyId": "SELECT-V81-ROSTER-BASIS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81ConfirmedRosterSnapshots": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/roster-basis/snapshots",
    "policyId": "LIST-V81-CONFIRMED-ROSTER-SNAPSHOTS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81MakeupWindows": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/makeup-windows",
    "policyId": "LIST-V81-MAKEUP-WINDOWS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81MakeupWindow": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/makeup-windows",
    "policyId": "CREATE-V81-MAKEUP-WINDOW",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "revokeV81MakeupWindow": {
    "method": "POST",
    "route": "/makeup-windows/{windowId}/revocation",
    "policyId": "REVOKE-V81-MAKEUP-WINDOW",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81OwnMakeupWindows": {
    "method": "GET",
    "route": "/enrollments/{enrollmentId}/makeup-windows",
    "policyId": "LIST-V81-OWN-MAKEUP-WINDOWS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81SemesterSwitchCheck": {
    "method": "GET",
    "route": "/admin/semesters/{id}/switch-check",
    "policyId": "GET-V81-SEMESTER-SWITCH-CHECK",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81RuleTemplates": {
    "method": "GET",
    "route": "/rule-templates",
    "policyId": "LIST-V81-RULE-TEMPLATES",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN",
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "publishV81RuleTemplate": {
    "method": "POST",
    "route": "/rule-templates",
    "policyId": "PUBLISH-V81-RULE-TEMPLATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81RuleTemplate": {
    "method": "GET",
    "route": "/rule-templates/{id}",
    "policyId": "GET-V81-RULE-TEMPLATE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN",
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81AuditEvents": {
    "method": "GET",
    "route": "/admin/audit-events",
    "policyId": "LIST-V81-AUDIT-EVENTS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81AuditEvent": {
    "method": "GET",
    "route": "/admin/audit-events/{source}/{eventId}",
    "policyId": "GET-V81-AUDIT-EVENT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81RuntimeArchive": {
    "method": "POST",
    "route": "/admin/runtime-archives",
    "policyId": "CREATE-V81-RUNTIME-ARCHIVE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81RuntimeArchive": {
    "method": "GET",
    "route": "/admin/runtime-archives/{id}",
    "policyId": "GET-V81-RUNTIME-ARCHIVE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "cancelV81RuntimeArchive": {
    "method": "POST",
    "route": "/admin/runtime-archives/{id}/cancellation",
    "policyId": "CANCEL-V81-RUNTIME-ARCHIVE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81RuntimeArchiveDownload": {
    "method": "POST",
    "route": "/admin/runtime-archives/{id}/download-url",
    "policyId": "CREATE-V81-RUNTIME-ARCHIVE-DOWNLOAD",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "downloadV81RuntimeArchive": {
    "method": "GET",
    "route": "/admin/runtime-archives/{id}/content",
    "policyId": "DOWNLOAD-V81-RUNTIME-ARCHIVE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "setV81SubadminPermissions": {
    "method": "POST",
    "route": "/admin/subadmins/{id}/permissions",
    "policyId": "SET-V81-SUBADMIN-PERMISSIONS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "requestCurrentUserAccountDeletionChallenge": {
    "method": "POST",
    "route": "/me/account-deletion-challenges",
    "policyId": "REQUEST-CURRENT-USER-ACCOUNT-DELETION-CHALLENGE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81OcrService": {
    "method": "GET",
    "route": "/admin/review-services/ocr",
    "policyId": "GET-V81-OCR-SERVICE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81OcrServiceRevisions": {
    "method": "GET",
    "route": "/admin/review-services/ocr/revisions",
    "policyId": "LIST-V81-OCR-SERVICE-REVISIONS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "saveV81OcrService": {
    "method": "POST",
    "route": "/admin/review-services/ocr/revisions",
    "policyId": "SAVE-V81-OCR-SERVICE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "requestV81SubadminIdentity": {
    "method": "POST",
    "route": "/admin/subadmin-identity-challenges",
    "policyId": "REQUEST-V81-SUBADMIN-IDENTITY",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "verifyV81SubadminIdentity": {
    "method": "POST",
    "route": "/admin/subadmin-identity-challenges/{id}/verify",
    "policyId": "VERIFY-V81-SUBADMIN-IDENTITY",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "updateV81VerifiedSubadmin": {
    "method": "POST",
    "route": "/admin/subadmins/{id}/profile",
    "policyId": "UPDATE-V81-VERIFIED-SUBADMIN",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "deleteV81TeacherAccount": {
    "method": "POST",
    "route": "/admin/teachers/{id}/delete",
    "policyId": "DELETE-V81-TEACHER-ACCOUNT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "deleteV81Course": {
    "method": "POST",
    "route": "/class-sections/{id}/delete",
    "policyId": "DELETE-V81-COURSE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "deleteV81StudentAccount": {
    "method": "POST",
    "route": "/admin/students/{id}/delete",
    "policyId": "DELETE-V81-STUDENT-ACCOUNT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "deleteV81Subadmin": {
    "method": "POST",
    "route": "/admin/subadmins/{id}/delete",
    "policyId": "DELETE-V81-SUBADMIN",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81TeacherCourse": {
    "method": "POST",
    "route": "/teacher/courses",
    "policyId": "CREATE-V81-TEACHER-COURSE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "revokeV81CourseInvite": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/course-invites/revocations",
    "policyId": "REVOKE-V81-COURSE-INVITE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81SettlementReports": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/settlement-reports",
    "policyId": "V81-SETTLEMENT-REPORT-LIST",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "confirmV81Settlement": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/settlement-reports",
    "policyId": "V81-SETTLEMENT-CONFIRM",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81SettlementReport": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/settlement-reports/{version}",
    "policyId": "V81-SETTLEMENT-REPORT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "exportV81SettlementReport": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/settlement-reports/{version}/export",
    "policyId": "V81-SETTLEMENT-REPORT-EXPORT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "previewV81Settlement": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/settlement-preview",
    "policyId": "V81-SETTLEMENT-PREVIEW",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81StudentSettlementResult": {
    "method": "GET",
    "route": "/student/enrollments/{enrollmentId}/settlement-result",
    "policyId": "V81-STUDENT-SETTLEMENT-READ",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "switchV81Semester": {
    "method": "POST",
    "route": "/admin/semesters/{id}/switch",
    "policyId": "V81-SEMESTER-SWITCH",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "ORGANIZATION",
    "resourceResolver": "PRINCIPAL_ORGANIZATION",
    "defaultDeny": true
  },
  "getV81AdminSettlementSummary": {
    "method": "GET",
    "route": "/admin/class-sections/{classSectionId}/settlement-summary",
    "policyId": "V81-ADMIN-SETTLEMENT-SUMMARY",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "correctV81FinalGrade": {
    "method": "POST",
    "route": "/enrollments/{enrollmentId}/final-grades/corrections",
    "policyId": "V81-FINAL-GRADE-CORRECT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "correctV81PhysicalResult": {
    "method": "POST",
    "route": "/enrollments/{enrollmentId}/physical-results/corrections",
    "policyId": "V81-PHYSICAL-RESULT-CORRECT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "reportClientError": {
    "method": "POST",
    "route": "/audit-logs/client-errors",
    "policyId": "CLIENT-ERROR-REPORT",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT",
      "TEACHER",
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "listV81TeacherSemesters": {
    "method": "GET",
    "route": "/teacher/semesters",
    "policyId": "LIST-V81-TEACHER-SEMESTERS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "issueMemberJoinCapability": {
    "method": "POST",
    "route": "/course-invites/{inviteToken}/join-capabilities/member",
    "policyId": "MEMBER-JOIN-CAPABILITY-ISSUE",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81HistorySettings": {
    "method": "GET",
    "route": "/class-sections/{classSectionId}/history-settings",
    "policyId": "GET-V81HISTORY-SETTINGS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER",
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "saveV81HistorySettings": {
    "method": "POST",
    "route": "/class-sections/{classSectionId}/history-settings",
    "policyId": "SAVE-V81HISTORY-SETTINGS",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "createV81HistoricalSession": {
    "method": "POST",
    "route": "/enrollments/{enrollmentId}/historical-sessions",
    "policyId": "CREATE-V81-HISTORICAL-SESSION",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "STUDENT"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "getV81ExerciseGoal": {
    "method": "GET",
    "route": "/admin/exercise-goal",
    "policyId": "GET-V81-EXERCISE-GOAL",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN",
      "TEACHER"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  },
  "saveV81ExerciseGoal": {
    "method": "POST",
    "route": "/admin/exercise-goal",
    "policyId": "SAVE-V81-EXERCISE-GOAL",
    "authentication": "ACCESS_TOKEN",
    "allowedRoles": [
      "ADMIN"
    ],
    "organizationScope": "PRINCIPAL_ORGANIZATION",
    "resourceScope": "SELF",
    "resourceResolver": "PRINCIPAL_USER",
    "defaultDeny": true
  }
} as const;

export type OperationId = keyof typeof operationPolicies;
export type OperationPolicy = (typeof operationPolicies)[OperationId];
