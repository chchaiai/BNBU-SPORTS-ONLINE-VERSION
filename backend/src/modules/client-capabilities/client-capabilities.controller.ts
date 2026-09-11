import { AllowSystemModes } from '../../common/policy/system-mode-policy.decorator.js';
import {
  Body,
  Controller,
  Delete,
  Get,
  Headers,
  HttpCode,
  Inject,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import {
  AccountRecoveryCompletionRequestDto,
  AccountRecoveryRequestDto,
  AppendLocationSamplesRequestDto,
  ClientPlatformQueryDto,
  CreateExemptionApplicationRequestDto,
  CreateFeedbackRequestDto,
  ExemptionApplicationListQueryDto,
  ExemptionApplicationPathDto,
  FeedbackListQueryDto,
  FeedbackPathDto,
  FinalizeLocationTrackRequestDto,
  HelpArticleListQueryDto,
  HelpArticlePathDto,
  NotificationListQueryDto,
  NotificationPathDto,
  PushDevicePathDto,
  PushDeviceRegistrationRequestDto,
  RecordLocationPathDto,
  ReviewExemptionApplicationRequestDto,
  SessionLocationPathDto,
  StartLocationTrackRequestDto,
  StudentSignInCodeRequestDto,
  StudentSignInCodeVerificationRequestDto,
  UpdateExemptionApplicationRequestDto,
  UpdateLocationPrivacyPolicyRequestDto,
  UpdateUserPreferencesRequestDto,
  VersionedRequestDto,
} from './client-capabilities.dto.js';
import { ClientCapabilitiesService } from './client-capabilities.service.js';
import { ClientMessagingService } from './client-messaging.service.js';
import { AppReleasePolicyService } from './app-release-policy.service.js';
import type { AppReleasePolicyProjection } from './app-release-policy.domain.js';
import type {
  FeedbackProjection,
  HelpArticleProjection,
  NotificationProjection,
  PushDeviceProjection,
  UserPreferenceProjection,
} from './client-messaging.projection.js';
import type { PagedResult } from '../../common/http/envelope.interceptor.js';
import {
  ClientAuthenticationService,
  type AccountRecoveryAcceptedProjection,
  type StudentSignInCodeAcceptedProjection,
} from './client-authentication.service.js';
import type { AuthProjection } from '../auth/auth.service.js';
import {
  ExemptionApplicationsService,
  type ExemptionApplicationProjection,
  type StructuredExemptionApplicationProjection,
} from './exemption-applications.service.js';

@Controller()
export class ClientCapabilitiesController {
  constructor(
    @Inject(ClientCapabilitiesService)
    private readonly capabilities: ClientCapabilitiesService,
    @Inject(ClientMessagingService)
    private readonly messaging: ClientMessagingService,
    @Inject(AppReleasePolicyService)
    private readonly releasePolicies: AppReleasePolicyService,
    @Inject(ClientAuthenticationService)
    private readonly clientAuthentication: ClientAuthenticationService,
    @Inject(ExemptionApplicationsService)
    private readonly exemptionApplications: ExemptionApplicationsService,
  ) {}

  @Post('auth/student-sign-in-codes')
  @HttpCode(202)
  @OperationPolicy('requestStudentSignInCode')
  requestStudentSignInCode(
    @Body() body: StudentSignInCodeRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<StudentSignInCodeAcceptedProjection> {
    return this.clientAuthentication.requestStudentSignInCode(body, {
      requestId: request.requestId,
      idempotencyKey,
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
    });
  }

  @Post('auth/student-sign-in-codes/verify')
  @HttpCode(200)
  @OperationPolicy('verifyStudentSignInCode')
  verifyStudentSignInCode(
    @Body() body: StudentSignInCodeVerificationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<AuthProjection> {
    return this.clientAuthentication.verifyStudentSignInCode(body, {
      requestId: request.requestId,
      idempotencyKey,
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
    });
  }

  @Post('auth/account-recovery-requests')
  @HttpCode(202)
  @OperationPolicy('requestAccountRecovery')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  requestAccountRecovery(
    @Body() body: AccountRecoveryRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<AccountRecoveryAcceptedProjection> {
    return this.clientAuthentication.requestAccountRecovery(body, {
      requestId: request.requestId,
      idempotencyKey,
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
    });
  }

  @Post('auth/account-recovery-requests/complete')
  @HttpCode(200)
  @OperationPolicy('completeAccountRecovery')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  completeAccountRecovery(
    @Body() body: AccountRecoveryCompletionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<null> {
    return this.clientAuthentication.completeAccountRecovery(body, {
      requestId: request.requestId,
      idempotencyKey,
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
    });
  }

  @Get('notifications')
  @OperationPolicy('listNotifications')
  listNotifications(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: NotificationListQueryDto,
  ): Promise<PagedResult<NotificationProjection>> {
    return this.messaging.listNotifications(principal, query);
  }

  @Post('notifications/:notificationId/read')
  @HttpCode(200)
  @OperationPolicy('markNotificationRead')
  markNotificationRead(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: NotificationPathDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<NotificationProjection> {
    return this.messaging.markNotificationRead(principal, path.notificationId, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('push-devices')
  @OperationPolicy('registerPushDevice')
  registerPushDevice(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: PushDeviceRegistrationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<PushDeviceProjection> {
    return this.messaging.registerPushDevice(principal, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Delete('push-devices/:deviceId')
  @OperationPolicy('unregisterPushDevice')
  unregisterPushDevice(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: PushDevicePathDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<null> {
    return this.messaging.unregisterPushDevice(principal, path.deviceId, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get('me/preferences')
  @OperationPolicy('getCurrentUserPreferences')
  getCurrentUserPreferences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
  ): Promise<UserPreferenceProjection> {
    return this.messaging.getCurrentUserPreferences(principal);
  }

  @Patch('me/preferences')
  @OperationPolicy('updateCurrentUserPreferences')
  updateCurrentUserPreferences(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: UpdateUserPreferencesRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<UserPreferenceProjection> {
    return this.messaging.updateCurrentUserPreferences(principal, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get('help-articles')
  @OperationPolicy('listHelpArticles')
  listHelpArticles(@Query() query: HelpArticleListQueryDto): Promise<HelpArticleProjection[]> {
    return this.messaging.listHelpArticles(query);
  }

  @Get('help-articles/:articleId')
  @OperationPolicy('getHelpArticle')
  getHelpArticle(@Param() path: HelpArticlePathDto): Promise<HelpArticleProjection> {
    return this.messaging.getHelpArticle(path.articleId);
  }

  @Post('feedback')
  @OperationPolicy('createFeedback')
  createFeedback(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateFeedbackRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<FeedbackProjection> {
    return this.messaging.createFeedback(principal, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get('feedback')
  @OperationPolicy('listFeedback')
  listFeedback(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: FeedbackListQueryDto,
  ): Promise<PagedResult<FeedbackProjection>> {
    return this.messaging.listFeedback(principal, query);
  }

  @Get('feedback/:feedbackId')
  @OperationPolicy('getFeedback')
  getFeedback(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: FeedbackPathDto,
  ): Promise<FeedbackProjection> {
    return this.messaging.getFeedback(principal, path.feedbackId);
  }

  @Get('exemption-application-details')
  @OperationPolicy('listStructuredExemptionApplications')
  listStructuredExemptionApplications(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ExemptionApplicationListQueryDto,
  ): Promise<PagedResult<StructuredExemptionApplicationProjection>> {
    return this.exemptionApplications.listStructured(principal, query);
  }

  @Get('exemption-applications')
  @OperationPolicy('listExemptionApplications')
  listExemptionApplications(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ExemptionApplicationListQueryDto,
  ): Promise<PagedResult<ExemptionApplicationProjection>> {
    return this.exemptionApplications.list(principal, query);
  }

  @Post('exemption-applications')
  @OperationPolicy('createExemptionApplication')
  createExemptionApplication(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateExemptionApplicationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExemptionApplicationProjection> {
    return this.exemptionApplications.create(principal, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get('exemption-applications/:applicationId')
  @OperationPolicy('getExemptionApplication')
  getExemptionApplication(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExemptionApplicationPathDto,
  ): Promise<ExemptionApplicationProjection> {
    return this.exemptionApplications.get(principal, path.applicationId);
  }

  @Patch('exemption-applications/:applicationId')
  @OperationPolicy('updateExemptionApplication')
  updateExemptionApplication(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExemptionApplicationPathDto,
    @Body() body: UpdateExemptionApplicationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExemptionApplicationProjection> {
    return this.exemptionApplications.update(principal, path.applicationId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('exemption-applications/:applicationId/submit')
  @HttpCode(200)
  @OperationPolicy('submitExemptionApplication')
  submitExemptionApplication(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExemptionApplicationPathDto,
    @Body() body: VersionedRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExemptionApplicationProjection> {
    return this.exemptionApplications.submit(principal, path.applicationId, body.expectedVersion, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('exemption-applications/:applicationId/review')
  @HttpCode(200)
  @OperationPolicy('reviewExemptionApplication')
  reviewExemptionApplication(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExemptionApplicationPathDto,
    @Body() body: ReviewExemptionApplicationRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ExemptionApplicationProjection> {
    return this.exemptionApplications.review(principal, path.applicationId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get('app-release-policy')
  @OperationPolicy('getAppReleasePolicy')
  getAppReleasePolicy(@Query() query: ClientPlatformQueryDto): Promise<AppReleasePolicyProjection> {
    return this.releasePolicies.get(query);
  }

  @Get('sport-catalog')
  @OperationPolicy('getSportCatalog')
  getSportCatalog(@CurrentPrincipal() principal: AuthenticatedPrincipal): never {
    return this.capabilities.deny(principal);
  }

  @Get('activity-conversion-rules')
  @OperationPolicy('getActivityConversionRules')
  getActivityConversionRules(@CurrentPrincipal() principal: AuthenticatedPrincipal): never {
    return this.capabilities.deny(principal);
  }

  @Post('exercise-sessions/:sessionId/location-track')
  @OperationPolicy('startExerciseLocationTrack')
  startExerciseLocationTrack(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: SessionLocationPathDto,
    @Body() body: StartLocationTrackRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): never {
    void path;
    void body;
    void idempotencyKey;
    return this.capabilities.deny(principal);
  }

  @Post('exercise-sessions/:sessionId/location-samples')
  @HttpCode(200)
  @OperationPolicy('appendExerciseLocationSamples')
  appendExerciseLocationSamples(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: SessionLocationPathDto,
    @Body() body: AppendLocationSamplesRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): never {
    void path;
    void body;
    void idempotencyKey;
    return this.capabilities.deny(principal);
  }

  @Post('exercise-sessions/:sessionId/location-track/finalize')
  @HttpCode(200)
  @OperationPolicy('finalizeExerciseLocationTrack')
  finalizeExerciseLocationTrack(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: SessionLocationPathDto,
    @Body() body: FinalizeLocationTrackRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): never {
    void path;
    void body;
    void idempotencyKey;
    return this.capabilities.deny(principal);
  }

  @Get('exercise-records/:recordId/location-summary')
  @OperationPolicy('getExerciseRecordLocationSummary')
  getExerciseRecordLocationSummary(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RecordLocationPathDto,
  ): never {
    void path;
    return this.capabilities.deny(principal);
  }

  @Get('location-privacy-policy')
  @OperationPolicy('getLocationPrivacyPolicy')
  getLocationPrivacyPolicy(@CurrentPrincipal() principal: AuthenticatedPrincipal): never {
    return this.capabilities.deny(principal);
  }

  @Patch('location-privacy-policy')
  @HttpCode(200)
  @OperationPolicy('updateLocationPrivacyPolicy')
  updateLocationPrivacyPolicy(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: UpdateLocationPrivacyPolicyRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): never {
    void body;
    void idempotencyKey;
    return this.capabilities.deny(principal);
  }
}
