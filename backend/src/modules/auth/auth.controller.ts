import { Body, Controller, Get, Headers, HttpCode, Post, Req } from '@nestjs/common';

import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { AllowSystemModes } from '../../common/policy/system-mode-policy.decorator.js';
import { AuthService, type AuthProjection } from './auth.service.js';
import {
  ChangeOwnPasswordInput,
  LogoutRequest,
  PasswordLoginRequest,
  RefreshRequest,
} from './auth.dto.js';
import { AccountSecurityService } from './account-security.service.js';

@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly security: AccountSecurityService,
  ) {}

  @Get('account-security')
  @OperationPolicy('getV81AccountSecurity')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  securityStatus(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.security.status(principal);
  }

  @Post('own-password')
  @OperationPolicy('changeOwnV81Password')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  changePassword(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: ChangeOwnPasswordInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ) {
    return this.security.change(principal, input, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }

  @Post('password-login')
  @HttpCode(200)
  @OperationPolicy('passwordLogin')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  passwordLogin(
    @Body() body: PasswordLoginRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<AuthProjection> {
    return this.auth.passwordLogin(body, {
      requestId: request.requestId,
      idempotencyKey,
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
    });
  }

  @Post('refresh')
  @HttpCode(200)
  @OperationPolicy('refreshSession')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  refresh(
    @Body() body: RefreshRequest,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<AuthProjection> {
    return this.auth.refresh(body, {
      requestId: request.requestId,
      idempotencyKey,
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
    });
  }

  @Post('logout')
  @HttpCode(200)
  @OperationPolicy('logoutSession')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  logout(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: LogoutRequest | undefined,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<null> {
    return this.auth.logout(principal, body, {
      requestId: request.requestId,
      idempotencyKey,
      ...(request.ip === undefined ? {} : { sourceIp: request.ip }),
    });
  }
}
