import { Module } from '@nestjs/common';

import { ClassSectionsService } from './application/class-sections.service.js';
import { ClassSectionRepository } from './domain/class-section.repository.js';
import { PrismaClassSectionRepository } from './infrastructure/prisma-class-section.repository.js';
import { ClassSectionsController } from './interface/http/class-sections.controller.js';
import { TeacherClassSectionsController } from './interface/http/teacher-class-sections.controller.js';

@Module({
  controllers: [ClassSectionsController, TeacherClassSectionsController],
  providers: [
    ClassSectionsService,
    { provide: ClassSectionRepository, useClass: PrismaClassSectionRepository },
  ],
})
export class ClassSectionsModule {}
