import { Module } from '@nestjs/common';

import { ExerciseRecordPolicyResolver } from '../../common/policy/exercise-record-policy-resolver.js';
import { ScoresModule } from '../scores/scores.module.js';
import { ExerciseRecordsService } from './application/exercise-records.service.js';
import { PrismaExerciseRecordPolicyResolver } from './infrastructure/prisma-exercise-record-policy-resolver.js';
import { ExerciseRecordsController } from './interface/http/exercise-records.controller.js';

@Module({
  imports: [ScoresModule],
  controllers: [ExerciseRecordsController],
  providers: [
    ExerciseRecordsService,
    { provide: ExerciseRecordPolicyResolver, useClass: PrismaExerciseRecordPolicyResolver },
  ],
  exports: [ExerciseRecordsService, ExerciseRecordPolicyResolver],
})
export class ExerciseRecordsModule {}
