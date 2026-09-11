import { Module } from '@nestjs/common';

import { ExerciseRecordsModule } from '../exercise-records/exercise-records.module.js';
import { ScoresModule } from '../scores/scores.module.js';
import { V81Module } from '../v8/v81.module.js';
import { ExerciseReviewsService } from './application/exercise-reviews.service.js';
import { ExerciseReviewsController } from './interface/http/exercise-reviews.controller.js';

@Module({
  imports: [ExerciseRecordsModule, ScoresModule, V81Module],
  controllers: [ExerciseReviewsController],
  providers: [ExerciseReviewsService],
  exports: [ExerciseReviewsService],
})
export class ExerciseReviewsModule {}
