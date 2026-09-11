import { Body, Controller, Get, Headers, HttpCode, Param, Post, Query } from '@nestjs/common';

import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import {
  CreateExportRequestDto,
  ExportDownloadRequestDto,
  ExportListQueryDto,
  ExportPathDto,
} from './exports.dto.js';
import { ExportsService } from './exports.service.js';

@Controller('exports')
export class ExportsController {
  constructor(private readonly exportsService: ExportsService) {}

  @Get()
  @OperationPolicy('listExports')
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ExportListQueryDto,
  ): never {
    void query;
    return this.exportsService.deny(principal);
  }

  @Post()
  @HttpCode(202)
  @OperationPolicy('createExport')
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateExportRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): never {
    void body;
    void idempotencyKey;
    return this.exportsService.deny(principal);
  }

  @Get(':exportId')
  @OperationPolicy('getExport')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param() path: ExportPathDto): never {
    void path;
    return this.exportsService.deny(principal);
  }

  @Post(':exportId/download-url')
  @HttpCode(200)
  @OperationPolicy('createExportDownloadUrl')
  download(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: ExportPathDto,
    @Body() body: ExportDownloadRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
  ): never {
    void path;
    void body;
    void idempotencyKey;
    return this.exportsService.deny(principal);
  }
}
