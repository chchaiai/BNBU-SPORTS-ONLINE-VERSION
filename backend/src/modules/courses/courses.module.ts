import { Module } from '@nestjs/common';

import { CoursesService } from './application/courses.service.js';
import { CourseRepository } from './domain/course.repository.js';
import { PrismaCourseRepository } from './infrastructure/prisma-course.repository.js';
import { CoursesController } from './interface/http/courses.controller.js';

@Module({
  controllers: [CoursesController],
  providers: [CoursesService, { provide: CourseRepository, useClass: PrismaCourseRepository }],
  exports: [CourseRepository],
})
export class CoursesModule {}
