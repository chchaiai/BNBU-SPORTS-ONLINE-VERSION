import { Module } from '@nestjs/common';

import { UsersController } from './users.controller.js';
import { ProfilesController } from './profiles.controller.js';
import { UsersService } from './users.service.js';
import { StudentIdentityNormalizer } from './application/student-identity-normalizer.js';
import { StudentIdentityResolver } from './application/student-identity-resolver.js';
import { ClientCapabilitiesModule } from '../client-capabilities/client-capabilities.module.js';
import { EmailVerificationService } from './email-verification.service.js';

@Module({
  imports: [ClientCapabilitiesModule],
  controllers: [UsersController, ProfilesController],
  providers: [
    UsersService,
    EmailVerificationService,
    StudentIdentityNormalizer,
    StudentIdentityResolver,
  ],
  exports: [UsersService, StudentIdentityNormalizer, StudentIdentityResolver],
})
export class UsersModule {}
