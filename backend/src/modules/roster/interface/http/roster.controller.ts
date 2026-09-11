import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query, Req } from '@nestjs/common';

import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../../../common/http/request-context.js';
import type { PagedResult } from '../../../../common/http/envelope.interceptor.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import type {
  OfficialRosterEntryProjection,
  OfficialRosterImportProjection,
  RosterAlignmentResultProjection,
  RosterAlignmentRunProjection,
} from '../../application/roster-projection.js';
import { RosterImportsService } from '../../application/roster-imports.service.js';
import { RosterAlignmentService } from '../../application/roster-alignment.service.js';
import {
  ResolveRosterAlignmentRequestDto,
  RollbackRosterImportRequestDto,
  RosterAlignmentListQueryDto,
  RosterAlignmentResultPathDto,
  RosterClassSectionPathDto,
  RosterEntryListQueryDto,
  RosterImportListQueryDto,
  RosterImportPathDto,
  RunAlignmentRequestDto,
  VersionedRosterReasonRequestDto,
} from './roster.dto.js';

@Controller()
export class RosterController {
  constructor(
    private readonly imports: RosterImportsService,
    private readonly alignment: RosterAlignmentService,
  ) {}

  @Get('class-sections/:classSectionId/roster-imports')
  @OperationPolicy('listRosterImports')
  listImports(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterClassSectionPathDto,
    @Query() query: RosterImportListQueryDto,
  ): Promise<PagedResult<OfficialRosterImportProjection>> {
    return this.imports.list(principal, path.classSectionId, query);
  }

  @Post('class-sections/:classSectionId/roster-imports')
  @HttpCode(201)
  @OperationPolicy('createRosterImport')
  createImport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterClassSectionPathDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<OfficialRosterImportProjection> {
    return this.imports.create(principal, path.classSectionId, request, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get('class-sections/:classSectionId/roster-imports/current')
  @OperationPolicy('getCurrentRosterImport')
  currentImport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterClassSectionPathDto,
  ): Promise<OfficialRosterImportProjection> {
    return this.imports.getCurrent(principal, path.classSectionId);
  }

  @Get('roster-imports/:rosterImportId')
  @OperationPolicy('getRosterImport')
  getImport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterImportPathDto,
  ): Promise<OfficialRosterImportProjection> {
    return this.imports.get(principal, path.rosterImportId);
  }

  @Get('roster-imports/:rosterImportId/entries')
  @OperationPolicy('listRosterEntries')
  listEntries(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterImportPathDto,
    @Query() query: RosterEntryListQueryDto,
  ): Promise<PagedResult<OfficialRosterEntryProjection>> {
    return this.imports.listEntries(principal, path.rosterImportId, query);
  }

  @Post('roster-imports/:rosterImportId/rollback')
  @HttpCode(200)
  @OperationPolicy('rollbackRosterImport')
  rollbackImport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterImportPathDto,
    @Body() body: RollbackRosterImportRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<OfficialRosterImportProjection> {
    return this.imports.rollback(principal, path.rosterImportId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('roster-imports/:rosterImportId/align')
  @HttpCode(202)
  @OperationPolicy('alignRosterImport')
  alignImport(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterImportPathDto,
    @Body() body: RunAlignmentRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<RosterAlignmentRunProjection> {
    return this.alignment.align(principal, path.rosterImportId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get('roster-alignment-results')
  @OperationPolicy('listRosterAlignmentResults')
  listResults(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: RosterAlignmentListQueryDto,
  ): Promise<PagedResult<RosterAlignmentResultProjection>> {
    return this.alignment.list(principal, query);
  }

  @Get('roster-alignment-results/:alignmentResultId')
  @OperationPolicy('getRosterAlignmentResult')
  getResult(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterAlignmentResultPathDto,
  ): Promise<RosterAlignmentResultProjection> {
    return this.alignment.get(principal, path.alignmentResultId);
  }

  @Post('roster-alignment-results/:alignmentResultId/confirm')
  @HttpCode(200)
  @OperationPolicy('confirmRosterAlignmentResult')
  confirmResult(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterAlignmentResultPathDto,
    @Body() body: VersionedRosterReasonRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<RosterAlignmentResultProjection> {
    return this.alignment.confirm(principal, path.alignmentResultId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('roster-alignment-results/:alignmentResultId/resolve')
  @HttpCode(200)
  @OperationPolicy('resolveRosterAlignmentResult')
  resolveResult(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterAlignmentResultPathDto,
    @Body() body: ResolveRosterAlignmentRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<RosterAlignmentResultProjection> {
    return this.alignment.resolve(principal, path.alignmentResultId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post('roster-alignment-results/:alignmentResultId/ignore')
  @HttpCode(200)
  @OperationPolicy('ignoreRosterAlignmentResult')
  ignoreResult(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterAlignmentResultPathDto,
    @Body() body: VersionedRosterReasonRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): Promise<never> {
    return this.alignment.ignore(principal, path.alignmentResultId, body, idempotencyKey);
  }

  @Post('roster-alignment-results/:alignmentResultId/reopen')
  @HttpCode(200)
  @OperationPolicy('reopenRosterAlignmentResult')
  reopenResult(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: RosterAlignmentResultPathDto,
    @Body() body: VersionedRosterReasonRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<RosterAlignmentResultProjection> {
    return this.alignment.reopen(principal, path.alignmentResultId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }
}
