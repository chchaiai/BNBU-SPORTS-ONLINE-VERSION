import { Module } from '@nestjs/common';

import { CourseInvitesService } from './application/course-invites.service.js';
import { CourseInviteRepository } from './domain/course-invite.repository.js';
import { PrismaCourseInviteRepository } from './infrastructure/prisma-course-invite.repository.js';
import { CourseInvitesController } from './interface/http/course-invites.controller.js';

@Module({
  controllers: [CourseInvitesController],
  providers: [
    CourseInvitesService,
    { provide: CourseInviteRepository, useClass: PrismaCourseInviteRepository },
  ],
  exports: [CourseInvitesService, CourseInviteRepository],
})
export class CourseInvitesModule {}
