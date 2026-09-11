import { Module } from '@nestjs/common';

import { EnrollmentPolicyResolver } from '../../common/policy/enrollment-policy-resolver.js';
import { AuthModule } from '../auth/auth.module.js';
import { CourseInvitesModule } from '../course-invites/course-invites.module.js';
import { JoinCapabilitiesModule } from '../join-capabilities/join-capabilities.module.js';
import { UsersModule } from '../users/users.module.js';
import { EnrollmentsService } from './application/enrollments.service.js';
import { QrJoinService } from './application/qr-join.service.js';
import { EnrollmentRepository } from './domain/enrollment.repository.js';
import { PrismaEnrollmentPolicyResolver } from './infrastructure/prisma-enrollment-policy-resolver.js';
import { PrismaEnrollmentRepository } from './infrastructure/prisma-enrollment.repository.js';
import { EnrollmentsController } from './interface/http/enrollments.controller.js';

@Module({
  imports: [AuthModule, CourseInvitesModule, JoinCapabilitiesModule, UsersModule],
  controllers: [EnrollmentsController],
  providers: [
    EnrollmentsService,
    QrJoinService,
    { provide: EnrollmentRepository, useClass: PrismaEnrollmentRepository },
    { provide: EnrollmentPolicyResolver, useClass: PrismaEnrollmentPolicyResolver },
  ],
  exports: [EnrollmentsService, EnrollmentRepository, EnrollmentPolicyResolver],
})
export class EnrollmentsModule {}
