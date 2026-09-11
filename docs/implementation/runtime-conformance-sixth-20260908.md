# Operation Completion Matrix

Generated from the canonical OpenAPI document, the runtime coverage manifest, and the strict real-HTTP E2E conformance report. Do not edit by hand.

## Summary

| Metric | Count |
| --- | ---: |
| Contract operations | 249 |
| Runtime validation complete | 163 |
| Runtime validation incomplete | 86 |
| No observed response | 0 |
| Intentionally disabled with validated denial | 17/17 |
| Overall gate passed | false |
| Gate failures | 88 |
| Enabled success coverage | 146/232 |
| Error/access coverage | 249/249 |

Runtime evidence does not by itself establish business completeness or deployment readiness. Missing evidence is not a claim that implementation is absent.

## Operations

| Operation | Method | Path | Completion | Runtime conformance | Success status | Error/access status |
| --- | --- | --- | --- | --- | --- | --- |
| getHealthLive | GET | `/health/live` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 500 |
| getHealthReady | GET | `/health/ready` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 503 |
| getAdminHealth | GET | `/health/admin` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| getSystemMode | GET | `/system-mode` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 503 |
| getCurrentOrganization | GET | `/organizations/current` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getCurrentSemester | GET | `/semesters/current` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| passwordLogin | POST | `/auth/password-login` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 422, 503 |
| refreshSession | POST | `/auth/refresh` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| logoutSession | POST | `/auth/logout` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getCurrentUser | GET | `/me` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| requestCurrentUserEmailChallenge | POST | `/me/email-verification-challenges` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 202 | 401 |
| verifyCurrentUserEmailChallenge | POST | `/me/email-verification-challenges/{challengeId}/verify` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| listStudents | GET | `/students` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getStudent | GET | `/students/{studentId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| updateStudent | PATCH | `/students/{studentId}` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 403 |
| getTeacher | GET | `/teachers/{teacherId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| listTeacherClassSections | GET | `/teachers/{teacherId}/class-sections` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| listCourses | GET | `/courses` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| createCourse | POST | `/courses` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401, 403 |
| getCourse | GET | `/courses/{courseId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| updateCourse | PATCH | `/courses/{courseId}` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listClassSections | GET | `/class-sections` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| createClassSection | POST | `/class-sections` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 409, 422, 503 |
| getClassSection | GET | `/class-sections/{classSectionId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| updateClassSection | PATCH | `/class-sections/{classSectionId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 409, 422 |
| closeClassSection | POST | `/class-sections/{classSectionId}/close` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| listEnrollments | GET | `/enrollments` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| manuallyEnrollStudent | POST | `/class-sections/{classSectionId}/enrollments` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| getEnrollment | GET | `/enrollments/{enrollmentId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| withdrawEnrollment | POST | `/enrollments/{enrollmentId}/withdraw` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 409 |
| removeEnrollment | POST | `/enrollments/{enrollmentId}/remove` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| restoreEnrollment | POST | `/enrollments/{enrollmentId}/restore` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| createCourseInvite | POST | `/class-sections/{classSectionId}/course-invites` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| previewCourseInvite | GET | `/course-invites/{inviteToken}/preview` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 400, 410 |
| issueJoinCapability | POST | `/course-invites/{inviteToken}/join-capabilities` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 400, 422 |
| joinClassSectionWithInvite | POST | `/course-invites/{inviteToken}/join` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 409 |
| listRosterImports | GET | `/class-sections/{classSectionId}/roster-imports` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| createRosterImport | POST | `/class-sections/{classSectionId}/roster-imports` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409, 422 |
| getCurrentRosterImport | GET | `/class-sections/{classSectionId}/roster-imports/current` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getRosterImport | GET | `/roster-imports/{rosterImportId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| rollbackRosterImport | POST | `/roster-imports/{rosterImportId}/rollback` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| listRosterEntries | GET | `/roster-imports/{rosterImportId}/entries` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| alignRosterImport | POST | `/roster-imports/{rosterImportId}/align` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 202 | 401 |
| listRosterAlignmentResults | GET | `/roster-alignment-results` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getRosterAlignmentResult | GET | `/roster-alignment-results/{alignmentResultId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| confirmRosterAlignmentResult | POST | `/roster-alignment-results/{alignmentResultId}/confirm` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| resolveRosterAlignmentResult | POST | `/roster-alignment-results/{alignmentResultId}/resolve` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| ignoreRosterAlignmentResult | POST | `/roster-alignment-results/{alignmentResultId}/ignore` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 409 |
| reopenRosterAlignmentResult | POST | `/roster-alignment-results/{alignmentResultId}/reopen` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| startExerciseSession | POST | `/exercise-sessions` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 409, 422 |
| getActiveExerciseSession | GET | `/exercise-sessions/active` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getExerciseSession | GET | `/exercise-sessions/{sessionId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| pauseExerciseSession | POST | `/exercise-sessions/{sessionId}/pause` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 409 |
| resumeExerciseSession | POST | `/exercise-sessions/{sessionId}/resume` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| finishExerciseSession | POST | `/exercise-sessions/{sessionId}/finish` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| cancelExerciseSession | POST | `/exercise-sessions/{sessionId}/cancel` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| reconcileExerciseSession | POST | `/exercise-sessions/{sessionId}/reconcile` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 409 |
| listExerciseRecords | GET | `/exercise-records` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| createExerciseRecordDraft | POST | `/exercise-records` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 409 |
| getExerciseRecord | GET | `/exercise-records/{recordId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| updateExerciseRecordDraft | PATCH | `/exercise-records/{recordId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| getExerciseRecordEvidenceContext | GET | `/exercise-records/{recordId}/evidence-context` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| submitExerciseRecord | POST | `/exercise-records/{recordId}/submit` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| discardExerciseRecord | POST | `/exercise-records/{recordId}/discard` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| withdrawExerciseRecord | POST | `/exercise-records/{recordId}/withdraw` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 409 |
| initiateMediaUpload | POST | `/media-uploads` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 422 |
| confirmMediaUpload | POST | `/media-uploads/{uploadSessionId}/confirm` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| getMediaEvidence | GET | `/media/{mediaId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| bindMediaEvidence | POST | `/media/{mediaId}/bind` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| createMediaAccessUrl | POST | `/media/{mediaId}/access-url` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| listExerciseRecordReviews | GET | `/exercise-records/{recordId}/reviews` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| reviewExerciseRecord | POST | `/exercise-records/{recordId}/reviews` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409, 422 |
| reopenExerciseRecordReview | POST | `/exercise-records/{recordId}/reviews/reopen` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| batchReviewExerciseRecords | POST | `/exercise-reviews/batch` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| listScoreRules | GET | `/class-sections/{classSectionId}/score-rules` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401, 403 |
| createScoreRule | POST | `/class-sections/{classSectionId}/score-rules` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401, 403 |
| getScoreRule | GET | `/score-rules/{scoreRuleId}` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| submitScoreRuleForApproval | POST | `/score-rules/{scoreRuleId}/submit-approval` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| approveScoreRule | POST | `/score-rules/{scoreRuleId}/approve` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| rejectScoreRule | POST | `/score-rules/{scoreRuleId}/reject` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listStudentScores | GET | `/student-scores` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getStudentScore | GET | `/student-scores/{studentScoreId}` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| recalculateStudentScore | POST | `/student-scores/{studentScoreId}/recalculate` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| publishStudentScore | POST | `/student-scores/{studentScoreId}/publish` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| openStudentScoreCorrection | POST | `/student-scores/{studentScoreId}/open-correction` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401 |
| listScoreAdjustments | GET | `/student-scores/{studentScoreId}/adjustments` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createScoreAdjustment | POST | `/student-scores/{studentScoreId}/adjustments` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| approveScoreAdjustment | POST | `/score-adjustments/{scoreAdjustmentId}/approve` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| rejectScoreAdjustment | POST | `/score-adjustments/{scoreAdjustmentId}/reject` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listExports | GET | `/exports` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 403 |
| createExport | POST | `/exports` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 403 |
| getExport | GET | `/exports/{exportId}` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 403 |
| createExportDownloadUrl | POST | `/exports/{exportId}/download-url` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 403 |
| listAuditLogs | GET | `/audit-logs` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| getAuditLog | GET | `/audit-logs/{auditLogId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| requestStudentSignInCode | POST | `/auth/student-sign-in-codes` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 202 | 422 |
| verifyStudentSignInCode | POST | `/auth/student-sign-in-codes/verify` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 422 |
| requestAccountRecovery | POST | `/auth/account-recovery-requests` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 202 | 422 |
| completeAccountRecovery | POST | `/auth/account-recovery-requests/complete` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 422 |
| listNotifications | GET | `/notifications` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| markNotificationRead | POST | `/notifications/{notificationId}/read` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| registerPushDevice | POST | `/push-devices` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 409 |
| unregisterPushDevice | DELETE | `/push-devices/{deviceId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| getCurrentUserPreferences | GET | `/me/preferences` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 409 |
| updateCurrentUserPreferences | PATCH | `/me/preferences` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| listHelpArticles | GET | `/help-articles` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 422 |
| getHelpArticle | GET | `/help-articles/{articleId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 404 |
| listFeedback | GET | `/feedback` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| createFeedback | POST | `/feedback` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403 |
| getFeedback | GET | `/feedback/{feedbackId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| listStructuredExemptionApplications | GET | `/exemption-application-details` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| listExemptionApplications | GET | `/exemption-applications` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| createExemptionApplication | POST | `/exemption-applications` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 422 |
| getExemptionApplication | GET | `/exemption-applications/{applicationId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| updateExemptionApplication | PATCH | `/exemption-applications/{applicationId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| submitExemptionApplication | POST | `/exemption-applications/{applicationId}/submit` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 422 |
| reviewExemptionApplication | POST | `/exemption-applications/{applicationId}/review` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getAppReleasePolicy | GET | `/app-release-policy` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 503 |
| getSportCatalog | GET | `/sport-catalog` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 403, 503 |
| getActivityConversionRules | GET | `/activity-conversion-rules` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 403, 503 |
| startExerciseLocationTrack | POST | `/exercise-sessions/{sessionId}/location-track` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| appendExerciseLocationSamples | POST | `/exercise-sessions/{sessionId}/location-samples` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| finalizeExerciseLocationTrack | POST | `/exercise-sessions/{sessionId}/location-track/finalize` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| getExerciseRecordLocationSummary | GET | `/exercise-records/{recordId}/location-summary` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 503 |
| getLocationPrivacyPolicy | GET | `/location-privacy-policy` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 403, 503 |
| updateLocationPrivacyPolicy | PATCH | `/location-privacy-policy` | RUNTIME_CONFORMANT | INTENTIONALLY_DISABLED_VALIDATED | - | 401, 403 |
| getV81CourseRules | GET | `/class-sections/{classSectionId}/v81-rules` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| saveV81CourseRules | POST | `/class-sections/{classSectionId}/v81-rules` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 404, 409, 422 |
| setV81ManualMode | POST | `/admin/review-services/manual-mode` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| reviewV81Record | POST | `/exercise-records/{recordId}/v81-reviews` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81RecordWorkflow | GET | `/exercise-records/{recordId}/workflow` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| submitV81Supplement | POST | `/exercise-records/{recordId}/supplements` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| correctV81Record | POST | `/exercise-records/{recordId}/corrections` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81MaintenanceAnnouncement | GET | `/system-mode/announcement` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 503 |
| getV81SystemModeHistory | GET | `/system-mode/history` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| changeV81SystemMode | POST | `/system-mode/changes` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 409, 422 |
| getV81SupplementClock | GET | `/exercise-records/{recordId}/supplement-clock` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81AccountSecurity | GET | `/auth/account-security` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 503 |
| changeOwnV81Password | POST | `/auth/own-password` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 422, 503 |
| listV81Subadmins | GET | `/admin/subadmins` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| createV81VerifiedSubadmin | POST | `/admin/subadmins` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 422 |
| setV81SubadminStatus | POST | `/admin/subadmins/{id}/status` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 409, 422 |
| listV81StudentProgress | GET | `/student-progress` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81ProgressTarget | GET | `/class-sections/{id}/progress-target` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81Certifications | GET | `/activity-certification-applications` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81RecognitionRevisions | GET | `/activity-certification-applications/{id}/recognition-allocation-revisions` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| revokeV81Certification | POST | `/activity-certification-applications/{id}/revoke` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81ManualMode | GET | `/admin/review-services/manual-mode/{classSectionId}` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| acceptV81SwimIntake | POST | `/exercise-records/{recordId}/swim-intake` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81SwimIntake | GET | `/exercise-records/{recordId}/swim-intake` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81ProofTodos | GET | `/student/proof-todos` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81FinalGrades | GET | `/enrollments/{enrollmentId}/final-grades` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| appendV81FinalGrade | POST | `/enrollments/{enrollmentId}/final-grades` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409, 422 |
| getV81SettlementCheck | GET | `/class-sections/{classSectionId}/settlement-check` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getV81FeedbackDetail | GET | `/admin/feedback/{feedbackId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| handleV81Feedback | POST | `/admin/feedback/{feedbackId}/handling` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409 |
| listV81Feedback | GET | `/admin/feedback` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| getV81StudentFeedbackHistory | GET | `/student/feedback/{feedbackId}/history` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| createV81HelpArticle | POST | `/admin/help-articles` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403 |
| listV81HelpArticles | GET | `/admin/help-articles` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| saveV81HelpArticle | POST | `/admin/help-articles/{articleId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409 |
| getV81HelpArticle | GET | `/admin/help-articles/{articleId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| listV81StudentHelpArticles | GET | `/student/help-articles` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| getV81StudentHelpArticle | GET | `/student/help-articles/{articleId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| listV81EnduranceTables | GET | `/admin/endurance-tables` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createV81EnduranceRule | POST | `/admin/endurance-tables/rules` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| updateV81EnduranceRule | POST | `/admin/endurance-tables/rules/{ruleId}` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| deleteV81EnduranceRule | POST | `/admin/endurance-tables/rules/{ruleId}/delete` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81PhysicalResults | GET | `/enrollments/{enrollmentId}/physical-results` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| appendV81PhysicalResult | POST | `/enrollments/{enrollmentId}/physical-results` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 409 |
| getV81StudentPhysicalResult | GET | `/student/enrollments/{enrollmentId}/physical-result` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createV81PhysicalImport | POST | `/class-sections/{classSectionId}/physical-imports` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81PhysicalImports | GET | `/class-sections/{classSectionId}/physical-imports` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81PhysicalImport | GET | `/physical-imports/{importId}` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| reviseV81PhysicalImport | POST | `/physical-imports/{importId}/revisions` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81PhysicalImportRevisions | GET | `/physical-imports/{importId}/revisions` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| confirmV81PhysicalImport | POST | `/physical-imports/{importId}/confirm` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81PhysicalImportSource | GET | `/physical-imports/{importId}/source` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createV81PhysicalXlsxImport | POST | `/class-sections/{classSectionId}/physical-imports/xlsx` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| previewV81TeacherImport | POST | `/admin/teacher-imports/preview` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| confirmV81TeacherImport | POST | `/admin/teacher-imports/confirm` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81TeacherAccounts | GET | `/admin/teacher-accounts` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createV81Semester | POST | `/admin/semesters` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403 |
| listV81Semesters | GET | `/admin/semesters` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| updateV81Semester | POST | `/admin/semesters/{id}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409 |
| previewV81RosterRegistration | GET | `/roster-imports/{rosterImportId}/registration-preview` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81RosterConfirmation | GET | `/roster-imports/{rosterImportId}/confirmation` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| confirmV81Roster | POST | `/roster-imports/{rosterImportId}/confirmation` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| previewV81CompositeRoster | GET | `/class-sections/{classSectionId}/composite-roster` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| exportV81CompositeRosterPreview | GET | `/class-sections/{classSectionId}/composite-roster/export` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81RosterSource | GET | `/roster-imports/{rosterImportId}/source` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81OwnRosterStatus | GET | `/enrollments/{enrollmentId}/roster-status` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81AdminRosterSummary | GET | `/admin/class-sections/{classSectionId}/roster-summary` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81AdminCourseDirectory | GET | `/admin/course-directory` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81AdminPhysicalSummary | GET | `/admin/class-sections/{classSectionId}/physical-summary` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createV81OcrRosterBatch | POST | `/class-sections/{classSectionId}/ocr-roster-batches` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createV81OcrPhysicalBatch | POST | `/class-sections/{classSectionId}/ocr-physical-batches` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81OcrBatches | GET | `/class-sections/{classSectionId}/ocr-batches` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81OcrBatch | GET | `/ocr-batches/{batchId}` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81OcrPageSource | GET | `/ocr-batches/{batchId}/pages/{pageId}/source` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81OcrPageRecognition | GET | `/ocr-batches/{batchId}/pages/{pageId}/recognition` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createV81OcrJob | POST | `/ocr-batches/{batchId}/pages/{pageId}/recognition` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81OcrJob | GET | `/ocr-jobs/{jobId}` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81OcrDraft | GET | `/ocr-batches/{batchId}/draft` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createV81OcrDraft | POST | `/ocr-batches/{batchId}/draft` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| reviseV81OcrDraft | POST | `/ocr-batches/{batchId}/draft/revisions` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81OcrPhysicalConfirmation | GET | `/ocr-batches/{batchId}/physical-confirmations` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| confirmV81OcrPhysicalRows | POST | `/ocr-batches/{batchId}/physical-confirmations` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81OcrRosterConfirmation | GET | `/ocr-batches/{batchId}/roster-confirmation` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| confirmV81OcrRoster | POST | `/ocr-batches/{batchId}/roster-confirmation` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81RosterBasis | GET | `/class-sections/{classSectionId}/roster-basis` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| selectV81RosterBasis | POST | `/class-sections/{classSectionId}/roster-basis` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81ConfirmedRosterSnapshots | GET | `/class-sections/{classSectionId}/roster-basis/snapshots` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81MakeupWindows | GET | `/class-sections/{classSectionId}/makeup-windows` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| createV81MakeupWindow | POST | `/class-sections/{classSectionId}/makeup-windows` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409, 422 |
| revokeV81MakeupWindow | POST | `/makeup-windows/{windowId}/revocation` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409 |
| listV81OwnMakeupWindows | GET | `/enrollments/{enrollmentId}/makeup-windows` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404, 422 |
| getV81SemesterSwitchCheck | GET | `/admin/semesters/{id}/switch-check` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404, 422 |
| listV81RuleTemplates | GET | `/rule-templates` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403 |
| publishV81RuleTemplate | POST | `/rule-templates` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 409, 422 |
| getV81RuleTemplate | GET | `/rule-templates/{id}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| listV81AuditEvents | GET | `/admin/audit-events` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 422 |
| getV81AuditEvent | GET | `/admin/audit-events/{source}/{eventId}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 404 |
| createV81RuntimeArchive | POST | `/admin/runtime-archives` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| getV81RuntimeArchive | GET | `/admin/runtime-archives/{id}` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| cancelV81RuntimeArchive | POST | `/admin/runtime-archives/{id}/cancellation` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| createV81RuntimeArchiveDownload | POST | `/admin/runtime-archives/{id}/download-url` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| downloadV81RuntimeArchive | GET | `/admin/runtime-archives/{id}/content` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| setV81SubadminPermissions | POST | `/admin/subadmins/{id}/permissions` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| requestCurrentUserAccountDeletionChallenge | POST | `/me/account-deletion-challenges` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401, 403, 503 |
| getV81OcrService | GET | `/admin/review-services/ocr` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| listV81OcrServiceRevisions | GET | `/admin/review-services/ocr/revisions` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| saveV81OcrService | POST | `/admin/review-services/ocr/revisions` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| requestV81SubadminIdentity | POST | `/admin/subadmin-identity-challenges` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 429 |
| verifyV81SubadminIdentity | POST | `/admin/subadmin-identity-challenges/{id}/verify` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401 |
| updateV81VerifiedSubadmin | POST | `/admin/subadmins/{id}/profile` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 409 |
| deleteV81Subadmin | POST | `/admin/subadmins/{id}/delete` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 422 |
| createV81TeacherCourse | POST | `/teacher/courses` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 409, 503 |
| revokeV81CourseInvite | POST | `/class-sections/{classSectionId}/course-invites/revocations` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| confirmV81Settlement | POST | `/class-sections/{classSectionId}/settlement-reports` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409, 422 |
| listV81SettlementReports | GET | `/class-sections/{classSectionId}/settlement-reports` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getV81SettlementReport | GET | `/class-sections/{classSectionId}/settlement-reports/{version}` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| exportV81SettlementReport | GET | `/class-sections/{classSectionId}/settlement-reports/{version}/export` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| previewV81Settlement | GET | `/class-sections/{classSectionId}/settlement-preview` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401 |
| getV81StudentSettlementResult | GET | `/student/enrollments/{enrollmentId}/settlement-result` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| switchV81Semester | POST | `/admin/semesters/{id}/switch` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 201 | 401, 403, 404, 409, 422, 500, 503 |
| getV81AdminSettlementSummary | GET | `/admin/class-sections/{classSectionId}/settlement-summary` | RUNTIME_CONFORMANT | BOTH_VALIDATED | 200 | 401, 403, 404 |
| correctV81FinalGrade | POST | `/enrollments/{enrollmentId}/final-grades/corrections` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
| correctV81PhysicalResult | POST | `/enrollments/{enrollmentId}/physical-results/corrections` | RUNTIME_VALIDATION_INCOMPLETE | ERROR_RESPONSE_VALIDATED | - | 401 |
