import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req } from '@nestjs/common';

import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { UsersService, type CurrentUserProjection } from './users.service.js';
import {
  EmailVerificationChallengePathDto,
  CompleteStudentProfileDto,
  EmailVerificationChallengeRequestDto,
  VerifyEmailChallengeRequestDto,
} from './users.dto.js';
import { StudentProfileCompletionService } from './student-profile-completion.service.js';
import {
  EmailVerificationService,
  type EmailVerificationChallengeProjection,
} from './email-verification.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly emailVerification: EmailVerificationService,
    private readonly profileCompletion: StudentProfileCompletionService,
  ) {}

  @Get()
  @OperationPolicy('getCurrentUser')
  current(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<CurrentUserProjection> {
    return this.users.current(principal);
  }

  @Post('student-profile')
  @HttpCode(200)
  @OperationPolicy('completeCurrentStudentProfile')
  async completeProfile(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CompleteStudentProfileDto, @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest): Promise<CurrentUserProjection> {
    await this.profileCompletion.complete(principal,body,{idempotencyKey,requestId:request.requestId});
    return this.users.current(principal);
  }

  @Post('email-verification-challenges')
  @HttpCode(202)
  @OperationPolicy('requestCurrentUserEmailChallenge')
  requestEmailVerification(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: EmailVerificationChallengeRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<EmailVerificationChallengeProjection> {
    return this.emailVerification.requestChallenge(principal, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('email-verification-challenges/:challengeId/verify')
  @HttpCode(200)
  @OperationPolicy('verifyCurrentUserEmailChallenge')
  async verifyEmail(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: EmailVerificationChallengePathDto,
    @Body() body: VerifyEmailChallengeRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<CurrentUserProjection> {
    await this.emailVerification.verifyChallenge(principal, path.challengeId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
    return this.users.current(principal);
  }
}
