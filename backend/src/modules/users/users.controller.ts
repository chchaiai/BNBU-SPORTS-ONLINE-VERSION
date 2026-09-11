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
  EmailVerificationChallengeRequestDto,
  VerifyEmailChallengeRequestDto,
} from './users.dto.js';
import {
  EmailVerificationService,
  type EmailVerificationChallengeProjection,
} from './email-verification.service.js';

@Controller('me')
export class UsersController {
  constructor(
    private readonly users: UsersService,
    private readonly emailVerification: EmailVerificationService,
  ) {}

  @Get()
  @OperationPolicy('getCurrentUser')
  current(@CurrentPrincipal() principal: AuthenticatedPrincipal): Promise<CurrentUserProjection> {
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
