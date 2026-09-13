import { Module } from '@nestjs/common';

import { ExerciseSessionPolicyResolver } from '../../common/policy/exercise-session-policy-resolver.js';
import { EnrollmentsModule } from '../enrollments/enrollments.module.js';
import { ExerciseSessionsService } from './application/exercise-sessions.service.js';
import { ExerciseLimitWorker } from './application/exercise-limit.worker.js';
import { PrismaExerciseSessionPolicyResolver } from './infrastructure/prisma-exercise-session-policy-resolver.js';
import { ExerciseSessionsController } from './interface/http/exercise-sessions.controller.js';

@Module({
  imports: [EnrollmentsModule],
  controllers: [ExerciseSessionsController],
  providers: [
    ExerciseSessionsService,
    ExerciseLimitWorker,
    { provide: ExerciseSessionPolicyResolver, useClass: PrismaExerciseSessionPolicyResolver },
  ],
  exports: [ExerciseSessionsService, ExerciseSessionPolicyResolver],
})
export class ExerciseSessionsModule {}
