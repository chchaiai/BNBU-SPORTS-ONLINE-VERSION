import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req, UseGuards, Injectable, type CanActivate, type ExecutionContext } from '@nestjs/common';

import { ApplicationError } from '../../../../common/errors/application-error.js';

import type { PagedResult } from '../../../../common/http/envelope.interceptor.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../../../common/http/request-context.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import { ScoresService } from '../../application/scores.service.js';
import {
  ClassSectionScorePathDto,
  CreateScoreAdjustmentRequestDto,
  CreateScoreRuleRequestDto,
  ExpectedVersionRequestDto,
  ScoreAdjustmentListQueryDto,
  ScoreAdjustmentPathDto,
  ScoreApprovalRequestDto,
  ScoreListQueryDto,
  ScoreRuleListQueryDto,
  ScoreRulePathDto,
  StudentScorePathDto,
  VersionedReasonRequestDto,
} from './scores.dto.js';

/** Current business uses teacher-owned final-grades and immutable V81 results. */
@Injectable()
class RetiredScoreWorkflowGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<FoundationRequest>();
    // Keep the pre-existing explicitly denied correction operation's stable response.
    if (request.operationId === 'openStudentScoreCorrection') return true;
    throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403, {
      reason: 'LEGACY_SCORE_WORKFLOW_RETIRED',
    });
  }
}

@Controller()
@UseGuards(RetiredScoreWorkflowGuard)
export class ScoresController {
  constructor(private readonly scores: ScoresService) {}

  @Get('class-sections/:classSectionId/score-rules')
  @OperationPolicy('listScoreRules')
  listRules(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ClassSectionScorePathDto,
    @Query() query: ScoreRuleListQueryDto,
  ): Promise<PagedResult<Record<string, unknown>>> {
    return this.scores.listRules(principal, path.classSectionId, query);
  }

  @Post('class-sections/:classSectionId/score-rules')
  @HttpCode(201)
  @OperationPolicy('createScoreRule')
  createRule(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ClassSectionScorePathDto,
    @Body() body: CreateScoreRuleRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<Record<string, unknown>> {
    return this.scores.createRule(principal, path.classSectionId, body, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }

  @Get('score-rules/:scoreRuleId')
  @OperationPolicy('getScoreRule')
  getRule(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ScoreRulePathDto,
  ): Promise<Record<string, unknown>> {
    return this.scores.getRule(principal, path.scoreRuleId);
  }

  @Post('score-rules/:scoreRuleId/submit-approval')
  @HttpCode(200)
  @OperationPolicy('submitScoreRuleForApproval')
  submitRule(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ScoreRulePathDto,
    @Body() body: ExpectedVersionRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<Record<string, unknown>> {
    return this.scores.submitRule(principal, path.scoreRuleId, body, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }

  @Post('score-rules/:scoreRuleId/approve')
  @HttpCode(200)
  @OperationPolicy('approveScoreRule')
  approveRule(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ScoreRulePathDto,
    @Body() body: ScoreApprovalRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<Record<string, unknown>> {
    return this.scores.approveRule(principal, path.scoreRuleId, body, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }

  @Post('score-rules/:scoreRuleId/reject')
  @HttpCode(200)
  @OperationPolicy('rejectScoreRule')
  rejectRule(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ScoreRulePathDto,
    @Body() body: VersionedReasonRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<Record<string, unknown>> {
    return this.scores.rejectRule(principal, path.scoreRuleId, body, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }

  @Get('student-scores')
  @OperationPolicy('listStudentScores')
  listScores(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ScoreListQueryDto,
  ): Promise<PagedResult<Record<string, unknown>>> {
    return this.scores.listScores(principal, query);
  }

  @Get('student-scores/:studentScoreId')
  @OperationPolicy('getStudentScore')
  getScore(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: StudentScorePathDto,
  ): Promise<Record<string, unknown>> {
    return this.scores.getScore(principal, path.studentScoreId);
  }

  @Post('student-scores/:studentScoreId/recalculate')
  @HttpCode(202)
  @OperationPolicy('recalculateStudentScore')
  recalculate(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: StudentScorePathDto,
    @Body() body: ExpectedVersionRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<Record<string, unknown>> {
    return this.scores.recalculateScore(principal, path.studentScoreId, body, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }

  @Post('student-scores/:studentScoreId/publish')
  @HttpCode(200)
  @OperationPolicy('publishStudentScore')
  publish(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: StudentScorePathDto,
    @Body() body: ExpectedVersionRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<Record<string, unknown>> {
    return this.scores.publishScore(principal, path.studentScoreId, body, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }

  @Post('student-scores/:studentScoreId/open-correction')
  @HttpCode(201)
  @OperationPolicy('openStudentScoreCorrection')
  correction(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: StudentScorePathDto,
    @Body() body: VersionedReasonRequestDto,
  ): Promise<never> {
    return this.scores.denyCorrection(principal, path.studentScoreId, body);
  }

  @Get('student-scores/:studentScoreId/adjustments')
  @OperationPolicy('listScoreAdjustments')
  listAdjustments(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: StudentScorePathDto,
    @Query() query: ScoreAdjustmentListQueryDto,
  ): Promise<PagedResult<Record<string, unknown>>> {
    return this.scores.listAdjustments(principal, path.studentScoreId, query);
  }

  @Post('student-scores/:studentScoreId/adjustments')
  @HttpCode(201)
  @OperationPolicy('createScoreAdjustment')
  createAdjustment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: StudentScorePathDto,
    @Body() body: CreateScoreAdjustmentRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<Record<string, unknown>> {
    return this.scores.createAdjustment(principal, path.studentScoreId, body, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }

  @Post('score-adjustments/:scoreAdjustmentId/approve')
  @HttpCode(200)
  @OperationPolicy('approveScoreAdjustment')
  approveAdjustment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ScoreAdjustmentPathDto,
    @Body() body: ScoreApprovalRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<Record<string, unknown>> {
    return this.scores.approveAdjustment(principal, path.scoreAdjustmentId, body, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }

  @Post('score-adjustments/:scoreAdjustmentId/reject')
  @HttpCode(200)
  @OperationPolicy('rejectScoreAdjustment')
  rejectAdjustment(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ScoreAdjustmentPathDto,
    @Body() body: VersionedReasonRequestDto,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<Record<string, unknown>> {
    return this.scores.rejectAdjustment(principal, path.scoreAdjustmentId, body, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }
}
