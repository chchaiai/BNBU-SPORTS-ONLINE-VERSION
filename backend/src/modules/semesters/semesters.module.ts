import { Module } from '@nestjs/common';

import { SemestersController,TeacherSemestersController } from './semesters.controller.js';
import { SemestersService } from './semesters.service.js';

@Module({ controllers: [SemestersController,TeacherSemestersController], providers: [SemestersService] })
export class SemestersModule {}
