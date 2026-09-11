import { Module } from '@nestjs/common';

import { ScoresService } from './application/scores.service.js';
import { ScoresController } from './interface/http/scores.controller.js';

@Module({ controllers: [ScoresController], providers: [ScoresService], exports: [ScoresService] })
export class ScoresModule {}
