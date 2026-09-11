# Operation Completion Matrix

Generated from the canonical OpenAPI document, the runtime coverage manifest, and the strict real-HTTP E2E conformance report. Do not edit by hand.

## Summary

| Metric | Count |
| --- | ---: |
| Contract operations | 123 |
| Implemented and conformant | 106 |
| Intentionally disabled and fail-closed | 17 |
| Not implemented | 0 |
| Enabled success coverage | 106/106 |
| Error/access coverage | 123/123 |

## Operations

| Operation | Method | Path | Completion | Runtime conformance | Success status | Error/access status |
| --- | --- | --- | --- | --- | --- | --- |
| getHealthLive | GET | `/health/live` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 500 |
| getHealthReady | GET | `/health/ready` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 503 |
| getSystemMode | GET | `/system-mode` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 503 |
| getCurrentOrganization | GET | `/organizations/current` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getCurrentSemester | GET | `/semesters/current` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| passwordLogin | POST | `/auth/password-login` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 422, 503 |
| refreshSession | POST | `/auth/refresh` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| logoutSession | POST | `/auth/logout` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getCurrentUser | GET | `/me` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| requestCurrentUserEmailChallenge | POST | `/me/email-verification-challenges` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 202 | 401 |
| verifyCurrentUserEmailChallenge | POST | `/me/email-verification-challenges/{challengeId}/verify` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| listStudents | GET | `/students` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getStudent | GET | `/students/{studentId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| updateStudent | PATCH | `/students/{studentId}` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| getTeacher | GET | `/teachers/{teacherId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| listTeacherClassSections | GET | `/teachers/{teacherId}/class-sections` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| listCourses | GET | `/courses` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| createCourse | POST | `/courses` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 409 |
| getCourse | GET | `/courses/{courseId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| updateCourse | PATCH | `/courses/{courseId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 409 |
| listClassSections | GET | `/class-sections` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| createClassSection | POST | `/class-sections` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 409, 422, 503 |
| getClassSection | GET | `/class-sections/{classSectionId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| updateClassSection | PATCH | `/class-sections/{classSectionId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 409, 422 |
| closeClassSection | POST | `/class-sections/{classSectionId}/close` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| listEnrollments | GET | `/enrollments` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| manuallyEnrollStudent | POST | `/class-sections/{classSectionId}/enrollments` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| getEnrollment | GET | `/enrollments/{enrollmentId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| withdrawEnrollment | POST | `/enrollments/{enrollmentId}/withdraw` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 409 |
| removeEnrollment | POST | `/enrollments/{enrollmentId}/remove` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| restoreEnrollment | POST | `/enrollments/{enrollmentId}/restore` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| createCourseInvite | POST | `/class-sections/{classSectionId}/course-invites` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| previewCourseInvite | GET | `/course-invites/{inviteToken}/preview` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 400, 410 |
| issueJoinCapability | POST | `/course-invites/{inviteToken}/join-capabilities` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 400 |
| joinClassSectionWithInvite | POST | `/course-invites/{inviteToken}/join` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401, 409 |
| listRosterImports | GET | `/class-sections/{classSectionId}/roster-imports` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| createRosterImport | POST | `/class-sections/{classSectionId}/roster-imports` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409, 422 |
| getCurrentRosterImport | GET | `/class-sections/{classSectionId}/roster-imports/current` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getRosterImport | GET | `/roster-imports/{rosterImportId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| rollbackRosterImport | POST | `/roster-imports/{rosterImportId}/rollback` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| listRosterEntries | GET | `/roster-imports/{rosterImportId}/entries` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| alignRosterImport | POST | `/roster-imports/{rosterImportId}/align` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 202 | 401 |
| listRosterAlignmentResults | GET | `/roster-alignment-results` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getRosterAlignmentResult | GET | `/roster-alignment-results/{alignmentResultId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| confirmRosterAlignmentResult | POST | `/roster-alignment-results/{alignmentResultId}/confirm` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| resolveRosterAlignmentResult | POST | `/roster-alignment-results/{alignmentResultId}/resolve` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| ignoreRosterAlignmentResult | POST | `/roster-alignment-results/{alignmentResultId}/ignore` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 409 |
| reopenRosterAlignmentResult | POST | `/roster-alignment-results/{alignmentResultId}/reopen` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| startExerciseSession | POST | `/exercise-sessions` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401, 409, 422 |
| getActiveExerciseSession | GET | `/exercise-sessions/active` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getExerciseSession | GET | `/exercise-sessions/{sessionId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| pauseExerciseSession | POST | `/exercise-sessions/{sessionId}/pause` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 409 |
| resumeExerciseSession | POST | `/exercise-sessions/{sessionId}/resume` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| finishExerciseSession | POST | `/exercise-sessions/{sessionId}/finish` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| cancelExerciseSession | POST | `/exercise-sessions/{sessionId}/cancel` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| reconcileExerciseSession | POST | `/exercise-sessions/{sessionId}/reconcile` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 409 |
| listExerciseRecords | GET | `/exercise-records` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| createExerciseRecordDraft | POST | `/exercise-records` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| getExerciseRecord | GET | `/exercise-records/{recordId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| updateExerciseRecordDraft | PATCH | `/exercise-records/{recordId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| submitExerciseRecord | POST | `/exercise-records/{recordId}/submit` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 409, 422 |
| discardExerciseRecord | POST | `/exercise-records/{recordId}/discard` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| withdrawExerciseRecord | POST | `/exercise-records/{recordId}/withdraw` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 409 |
| initiateMediaUpload | POST | `/media-uploads` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401, 422 |
| confirmMediaUpload | POST | `/media-uploads/{uploadSessionId}/confirm` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| getMediaEvidence | GET | `/media/{mediaId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| bindMediaEvidence | POST | `/media/{mediaId}/bind` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| createMediaAccessUrl | POST | `/media/{mediaId}/access-url` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| listExerciseRecordReviews | GET | `/exercise-records/{recordId}/reviews` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| reviewExerciseRecord | POST | `/exercise-records/{recordId}/reviews` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409 |
| reopenExerciseRecordReview | POST | `/exercise-records/{recordId}/reviews/reopen` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| batchReviewExerciseRecords | POST | `/exercise-reviews/batch` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| listScoreRules | GET | `/class-sections/{classSectionId}/score-rules` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| createScoreRule | POST | `/class-sections/{classSectionId}/score-rules` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| getScoreRule | GET | `/score-rules/{scoreRuleId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| submitScoreRuleForApproval | POST | `/score-rules/{scoreRuleId}/submit-approval` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| approveScoreRule | POST | `/score-rules/{scoreRuleId}/approve` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 409 |
| rejectScoreRule | POST | `/score-rules/{scoreRuleId}/reject` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| listStudentScores | GET | `/student-scores` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getStudentScore | GET | `/student-scores/{studentScoreId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| recalculateStudentScore | POST | `/student-scores/{studentScoreId}/recalculate` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 202 | 401 |
| publishStudentScore | POST | `/student-scores/{studentScoreId}/publish` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| openStudentScoreCorrection | POST | `/student-scores/{studentScoreId}/open-correction` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 409 |
| listScoreAdjustments | GET | `/student-scores/{studentScoreId}/adjustments` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| createScoreAdjustment | POST | `/student-scores/{studentScoreId}/adjustments` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| approveScoreAdjustment | POST | `/score-adjustments/{scoreAdjustmentId}/approve` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| rejectScoreAdjustment | POST | `/score-adjustments/{scoreAdjustmentId}/reject` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| listExports | GET | `/exports` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| createExport | POST | `/exports` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| getExport | GET | `/exports/{exportId}` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| createExportDownloadUrl | POST | `/exports/{exportId}/download-url` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| listAuditLogs | GET | `/audit-logs` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| getAuditLog | GET | `/audit-logs/{auditLogId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| requestStudentSignInCode | POST | `/auth/student-sign-in-codes` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 202 | 422 |
| verifyStudentSignInCode | POST | `/auth/student-sign-in-codes/verify` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 422 |
| requestAccountRecovery | POST | `/auth/account-recovery-requests` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 202 | 422 |
| completeAccountRecovery | POST | `/auth/account-recovery-requests/complete` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 422 |
| listNotifications | GET | `/notifications` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| markNotificationRead | POST | `/notifications/{notificationId}/read` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| registerPushDevice | POST | `/push-devices` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401, 409 |
| unregisterPushDevice | DELETE | `/push-devices/{deviceId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getCurrentUserPreferences | GET | `/me/preferences` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 409 |
| updateCurrentUserPreferences | PATCH | `/me/preferences` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| listHelpArticles | GET | `/help-articles` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 422 |
| getHelpArticle | GET | `/help-articles/{articleId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 404 |
| listFeedback | GET | `/feedback` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| createFeedback | POST | `/feedback` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| getFeedback | GET | `/feedback/{feedbackId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| listExemptionApplications | GET | `/exemption-applications` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| createExemptionApplication | POST | `/exemption-applications` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| getExemptionApplication | GET | `/exemption-applications/{applicationId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| updateExemptionApplication | PATCH | `/exemption-applications/{applicationId}` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| submitExemptionApplication | POST | `/exemption-applications/{applicationId}/submit` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| reviewExemptionApplication | POST | `/exemption-applications/{applicationId}/review` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getAppReleasePolicy | GET | `/app-release-policy` | IMPLEMENTED_AND_CONFORMANT | BOTH_VALIDATED | 200 | 503 |
| getSportCatalog | GET | `/sport-catalog` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| getActivityConversionRules | GET | `/activity-conversion-rules` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| startExerciseLocationTrack | POST | `/exercise-sessions/{sessionId}/location-track` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| appendExerciseLocationSamples | POST | `/exercise-sessions/{sessionId}/location-samples` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| finalizeExerciseLocationTrack | POST | `/exercise-sessions/{sessionId}/location-track/finalize` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| getExerciseRecordLocationSummary | GET | `/exercise-records/{recordId}/location-summary` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| getLocationPrivacyPolicy | GET | `/location-privacy-policy` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| updateLocationPrivacyPolicy | PATCH | `/location-privacy-policy` | INTENTIONALLY_DISABLED | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
