import { Module } from '@nestjs/common';

import { CourseInvitesModule } from '../course-invites/course-invites.module.js';
import { UsersModule } from '../users/users.module.js';
import { JoinCapabilitiesService } from './application/join-capabilities.service.js';
import { JoinCapabilityRepository } from './domain/join-capability.repository.js';
import { PrismaJoinCapabilityRepository } from './infrastructure/prisma-join-capability.repository.js';
import { PrismaQrJoinPolicyResolver } from './infrastructure/prisma-qr-join-policy-resolver.js';
import { JoinCapabilitiesController } from './interface/http/join-capabilities.controller.js';
import { QrJoinPolicyResolver } from '../../common/policy/qr-join-policy-resolver.js';

@Module({
  imports: [CourseInvitesModule, UsersModule],
  controllers: [JoinCapabilitiesController],
  providers: [
    JoinCapabilitiesService,
    { provide: JoinCapabilityRepository, useClass: PrismaJoinCapabilityRepository },
    { provide: QrJoinPolicyResolver, useClass: PrismaQrJoinPolicyResolver },
  ],
  exports: [JoinCapabilitiesService, JoinCapabilityRepository, QrJoinPolicyResolver],
})
export class JoinCapabilitiesModule {}
