import { Module } from '@nestjs/common';

import { AccessTokenGuard } from './access-token.guard.js';
import { AuthController } from './auth.controller.js';
import { AuthService } from './auth.service.js';
import { PasswordHasherService } from './password-hasher.service.js';
import { TokenService } from './token.service.js';
import { AccountSecurityService } from './account-security.service.js';

@Module({
  controllers: [AuthController],
  providers: [
    AuthService,
    AccessTokenGuard,
    PasswordHasherService,
    TokenService,
    AccountSecurityService,
  ],
  exports: [AccessTokenGuard, AuthService, PasswordHasherService, TokenService],
})
export class AuthModule {}
