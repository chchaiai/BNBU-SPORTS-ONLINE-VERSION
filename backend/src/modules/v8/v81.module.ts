import {V81HistoryBackfillController,V81HistoryBackfillService} from './v81-history-backfill.js';
import { AI_REVIEW_PROVIDER } from './ai-review-provider.js';
import { TencentAiReviewProvider } from './tencent-ai-review-provider.js';
import { V81AiReviewWorker } from './v81-ai-review.worker.js';
import {V81CourseDeletionController,V81CourseDeletionService} from './v81-course-deletion.js';
import { V81StudentMediaErasureWorker } from './v81-student-media-erasure.js';
import { V81StudentDeletionController, V81StudentDeletionService } from './v81-student-deletion.js';
import { V81MakeupWindowsController, V81MakeupWindowsService } from './v81-makeup-windows.js';
import {V81TeacherCoursesController} from './v81-teacher-courses.js';
import {V81TeacherDeletionController,V81TeacherDeletionService} from './v81-teacher-deletion.js';
import {V81InviteRevocationController} from './v81-invite-revocation.js';
import { V81AccountDeletionController, V81AccountDeletionService } from './v81-account-deletion.js';
import { ClientCapabilitiesModule } from '../client-capabilities/client-capabilities.module.js';
import { V81RuleTemplatesController, V81RuleTemplatesService } from './v81-rule-templates.js';
import { V81CourseRemindersService, V81CourseReminderWorker } from './v81-course-reminders.js';
import { V81AuditEventsController, V81AuditEventsService } from './v81-audit-events.js';
import { V81RuntimeArchivesController, V81RuntimeArchivesService, V81RuntimeArchiveWorker } from './v81-runtime-archives.js';
import { V81RosterBasisController, V81RosterBasisService } from './v81-roster-basis.js';
import { V81OcrRosterConfirmationController, V81OcrRosterConfirmationService } from './v81-ocr-roster-confirmation.js';
import { V81OcrPhysicalConfirmationController, V81OcrPhysicalConfirmationService } from './v81-ocr-physical-confirmation.js';
import { V81OcrDraftsController, V81OcrDraftsService } from './v81-ocr-drafts.js';
import { V81OcrWorker } from './v81-ocr.worker.js';
import { V81OcrGovernanceController, V81OcrGovernanceService } from './v81-ocr-governance.js';
import { TencentOcrProvider } from './tencent-ocr-provider.js';
import { RUNTIME_CONFIG } from '../../common/config/runtime-config.module.js';
import type { RuntimeConfig } from '../../common/config/environment.js';
import { V81AdminCourseDirectoryController, V81AdminCourseDirectoryService } from './v81-admin-course-directory.js';
import { V81AdminPhysicalSummaryController, V81AdminPhysicalSummaryService } from './v81-admin-physical-summary.js';
import { V81AdminSettlementSummaryController, V81AdminSettlementSummaryService } from './v81-admin-settlement-summary.js';
import { V81OcrIntakeController, V81OcrIntakeService } from './v81-ocr-intake.js';
import { V81OcrReadController, V81OcrReadService } from './v81-ocr-read.js';
import { V81OcrJobsController, V81OcrJobsService } from './v81-ocr-jobs.js';
import { Module } from '@nestjs/common';
import { V81AdminRosterSummaryController, V81AdminRosterSummaryService } from './v81-admin-roster-summary.js';
import { V81CompositeRosterController, V81CompositeRosterService } from './v81-composite-roster.js';
import { V81SettlementReportsService } from './v81-settlement-reports.js';
import { V81StudentSettlementController, V81StudentSettlementService } from './v81-student-settlement.js';
import { V81SettlementCommandController, V81SettlementCommandService } from './v81-settlement-command.js';
import { V81SettlementReportReadController, V81SettlementReportReadService } from './v81-settlement-report-read.js';
import { V81RosterSourceController, V81RosterConfirmationController, V81RosterConfirmationService } from './v81-roster-confirmation.js';
import { V81StudentRosterController, V81RosterRegistrationController, V81RosterRegistrationService } from './v81-roster-registration.js';
import { V81SemestersController, V81SemestersService } from './v81-semesters.js';
import { AuthModule } from '../auth/auth.module.js';
import { V81TeacherAccountsController, V81TeacherImportsController, V81TeacherImportsService } from './v81-teacher-imports.js';
import { ObjectStorageModule } from '../../common/object-storage/object-storage.module.js';
import { V81PhysicalImportsController, V81PhysicalImportsService } from './v81-physical-imports.js';
import { V81PhysicalResultsController, V81PhysicalResultsService } from './v81-physical-results.js';
import { V81EnduranceController, V81EnduranceService } from './v81-endurance.js';
import { V81HelpController, V81HelpService, V81StudentHelpController } from './v81-help.js';
import { V81FeedbackController, V81FeedbackService, V81StudentFeedbackController } from './v81-feedback.js';
import { V81Controller } from './v81.controller.js';
import { V81Service } from './v81.service.js';
import { V81DeadlineWorker } from './v81-deadline.worker.js';
import { V81ProgressController, V81ProgressService } from './v81-progress.js';
import { V81SubadminsController, V81SubadminsService } from './v81-subadmins.js';
import { V81SubadminIdentityController, V81SubadminIdentityService } from './v81-subadmin-identity.js';
import { V81CertificationsController, V81CertificationsService } from './v81-certifications.js';
import { V81FinalGradesController, V81FinalGradesService } from './v81-final-grades.js';
import { V81SettlementCheckController, V81SettlementCheckService } from './v81-settlement-check.js';
@Module({
  imports: [ObjectStorageModule, AuthModule, ClientCapabilitiesModule],
  controllers: [V81HistoryBackfillController,V81CourseDeletionController,V81StudentDeletionController,V81TeacherDeletionController,V81InviteRevocationController,V81TeacherCoursesController,
    V81OcrGovernanceController,
    V81AccountDeletionController,
    V81RuntimeArchivesController,
    V81AuditEventsController,
    V81RuleTemplatesController,
    V81MakeupWindowsController,
    V81RosterBasisController,
    V81OcrRosterConfirmationController,
    V81OcrPhysicalConfirmationController,
    V81OcrDraftsController,
    V81OcrJobsController,
    V81OcrReadController,
    V81OcrIntakeController,
    V81AdminPhysicalSummaryController,
    V81AdminSettlementSummaryController,
    V81AdminCourseDirectoryController,
    V81AdminRosterSummaryController,
    V81StudentRosterController,
    V81RosterSourceController,
    V81CompositeRosterController,
    V81SettlementReportReadController,
    V81SettlementCommandController,
    V81StudentSettlementController,
    V81RosterConfirmationController,
    V81RosterRegistrationController,
    V81SemestersController,
    V81TeacherAccountsController,
    V81TeacherImportsController,
    V81PhysicalImportsController,
    V81PhysicalResultsController,
    V81EnduranceController,
    V81HelpController,
    V81StudentHelpController,
    V81FeedbackController,
    V81StudentFeedbackController,
    V81Controller,
    V81SubadminsController,
    V81SubadminIdentityController,
    V81ProgressController,
    V81CertificationsController,
    V81FinalGradesController,
    V81SettlementCheckController,
  ],
  providers: [V81HistoryBackfillService,V81CourseDeletionService,V81StudentMediaErasureWorker,V81StudentDeletionService,
    V81AiReviewWorker,
    { provide: AI_REVIEW_PROVIDER, inject: [RUNTIME_CONFIG], useFactory: (config: RuntimeConfig): TencentAiReviewProvider => new TencentAiReviewProvider(config.aiReview ?? { enabled: false, budgetFen: 500000 }) },
    V81TeacherDeletionService,
    V81OcrGovernanceService,
    V81AccountDeletionService,
    V81RuntimeArchivesService,
    V81RuntimeArchiveWorker,
    V81AuditEventsService,
    V81CourseRemindersService,
    V81CourseReminderWorker,
    V81RuleTemplatesService,
    V81MakeupWindowsService,
    V81RosterBasisService,
    V81OcrRosterConfirmationService,
    V81OcrPhysicalConfirmationService,
    V81OcrDraftsService,
    V81OcrWorker,
    { provide: TencentOcrProvider, inject: [RUNTIME_CONFIG], useFactory: (config: RuntimeConfig) => new TencentOcrProvider(config.ocr ?? { provider: 'DISABLED' }) },
    V81OcrJobsService,
    V81OcrReadService,
    V81OcrIntakeService,
    V81AdminPhysicalSummaryService,
    V81AdminSettlementSummaryService,
    V81AdminCourseDirectoryService,
    V81AdminRosterSummaryService,
    V81CompositeRosterService,
    V81SettlementReportsService,
    V81SettlementCommandService,
    V81StudentSettlementService,
    V81SettlementReportReadService,
    V81RosterConfirmationService,
    V81RosterRegistrationService,
    V81SemestersService,
    V81TeacherImportsService,
    V81PhysicalImportsService,
    V81PhysicalResultsService,
    V81EnduranceService,
    V81HelpService,
    V81FeedbackService,
    V81Service,
    V81DeadlineWorker,
    V81SubadminsService,
    V81SubadminIdentityService,
    V81ProgressService,
    V81CertificationsService,
    V81FinalGradesService,
    V81SettlementCheckService,
  ],
  exports: [V81Service],
})
export class V81Module {}
