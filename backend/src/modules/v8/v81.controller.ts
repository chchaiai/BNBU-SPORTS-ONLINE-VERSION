import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import { ApplicationError } from '../../common/errors/application-error.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import {
  ManualModeInput,
  V81CorrectionInput,
  V81ReviewInput,
  V81RulesInput,
  V81SupplementInput,
  SwimIntakeInput,
  ProofTodoQuery,
  V81ExerciseGoalInput,
} from './v81.dto.js';
import { V81Service } from './v81.service.js';
import { AllowSystemModes } from '../../common/policy/system-mode-policy.decorator.js';

const uuidParam = new ParseUUIDPipe({
  exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422),
});

@Controller()
export class V81Controller {
  constructor(private readonly service: V81Service) {}
  @Get('admin/exercise-goal')
  @OperationPolicy('getV81ExerciseGoal')
  exerciseGoal(@CurrentPrincipal() principal: AuthenticatedPrincipal) {
    return this.service.exerciseGoal(principal);
  }
  @Post('admin/exercise-goal')
  @OperationPolicy('saveV81ExerciseGoal')
  saveExerciseGoal(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: V81ExerciseGoalInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest) {
    return this.service.saveExerciseGoal(principal,input,{requestId:req.requestId,idempotencyKey:key});
  }
  @Get('student/proof-todos')
  @OperationPolicy('listV81ProofTodos')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  proofTodos(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: ProofTodoQuery) {
    return this.service.proofTodos(principal, query);
  }
  @Get('exercise-records/:recordId/swim-intake')
  @OperationPolicy('getV81SwimIntake')
  swimIntakeStatus(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('recordId', uuidParam) id: string,
  ) {
    return this.service.swimIntakeStatus(principal, id);
  }
  @Post('exercise-records/:recordId/swim-intake')
  @OperationPolicy('acceptV81SwimIntake')
  swimIntake(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('recordId', uuidParam) id: string,
    @Body() input: SwimIntakeInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest,
  ) {
    return this.service.swimIntake(principal, id, input, { requestId: req.requestId, idempotencyKey: key });
  }
  @Get('exercise-records/:recordId/supplement-clock')
  @OperationPolicy('getV81SupplementClock')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  supplementClock(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('recordId', uuidParam) id: string,
  ) {
    return this.service.supplementStatus(principal, id);
  }
  @Post('exercise-records/:recordId/corrections')
  @OperationPolicy('correctV81Record')
  correction(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('recordId', uuidParam) id: string,
    @Body() input: V81CorrectionInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest,
  ) {
    const { correctionReason, ...decision } = input;
    return this.service.review(
      principal,
      id,
      decision,
      { requestId: req.requestId, idempotencyKey: key },
      undefined,
      correctionReason,
    );
  }
  @Get('exercise-records/:recordId/workflow')
  @OperationPolicy('getV81RecordWorkflow')
  workflow(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('recordId', uuidParam) id: string,
  ) {
    return this.service.workflow(principal, id);
  }
  @Post('exercise-records/:recordId/supplements')
  @OperationPolicy('submitV81Supplement')
  supplement(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('recordId', uuidParam) id: string,
    @Body() input: V81SupplementInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest,
  ) {
    return this.service.supplement(principal, id, input, {
      requestId: req.requestId,
      idempotencyKey: key,
    });
  }
  @Get('class-sections/:classSectionId/v81-rules')
  @OperationPolicy('getV81CourseRules')
  rules(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('classSectionId', uuidParam) id: string,
  ) {
    return this.service.rules(principal, id);
  }
  @Post('class-sections/:classSectionId/v81-rules')
  @OperationPolicy('saveV81CourseRules')
  saveRules(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('classSectionId', uuidParam) id: string,
    @Body() input: V81RulesInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest,
  ) {
    return this.service.saveRules(principal, id, input, {
      requestId: req.requestId,
      idempotencyKey: key,
    });
  }
  @Get('admin/review-services/manual-mode/:classSectionId')
  @OperationPolicy('getV81ManualMode')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  manualStatus(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('classSectionId', uuidParam) id: string,
  ) {
    return this.service.manualModeStatus(principal, id);
  }
  @Post('admin/review-services/manual-mode')
  @OperationPolicy('setV81ManualMode')
  @AllowSystemModes('NORMAL', 'MAINTENANCE')
  manual(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() input: ManualModeInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest,
  ) {
    return this.service.manualMode(principal, input, {
      requestId: req.requestId,
      idempotencyKey: key,
    });
  }
  @Post('exercise-records/:recordId/v81-reviews')
  @OperationPolicy('reviewV81Record')
  review(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('recordId', uuidParam) id: string,
    @Body() input: V81ReviewInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest,
  ) {
    return this.service.review(principal, id, input, {
      requestId: req.requestId,
      idempotencyKey: key,
    });
  }
}
