import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';

import type { PagedResult } from '../../../../common/http/envelope.interceptor.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../../../common/http/request-context.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import type { ClassSectionProjection } from '../../application/class-section-projection.js';
import { ClassSectionsService } from '../../application/class-sections.service.js';
import {
  ClassSectionListQueryDto,
  ClassSectionPathParameters,
  CloseClassSectionRequestDto,
  CreateClassSectionRequestDto,
  UpdateClassSectionRequestDto,
} from './class-sections.dto.js';

@Controller('class-sections')
export class ClassSectionsController {
  constructor(private readonly classSections: ClassSectionsService) {}

  @Get()
  @OperationPolicy('listClassSections')
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: ClassSectionListQueryDto,
  ): Promise<PagedResult<ClassSectionProjection>> {
    return this.classSections.list(principal, query);
  }

  @Post()
  @HttpCode(201)
  @OperationPolicy('createClassSection')
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateClassSectionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ClassSectionProjection> {
    return this.classSections.create(principal, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get(':classSectionId')
  @OperationPolicy('getClassSection')
  get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: ClassSectionPathParameters,
  ): Promise<ClassSectionProjection> {
    return this.classSections.get(principal, parameters.classSectionId);
  }

  @Patch(':classSectionId')
  @OperationPolicy('updateClassSection')
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: ClassSectionPathParameters,
    @Body() body: UpdateClassSectionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ClassSectionProjection> {
    return this.classSections.update(principal, parameters.classSectionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Post(':classSectionId/close')
  @HttpCode(200)
  @OperationPolicy('closeClassSection')
  close(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: ClassSectionPathParameters,
    @Body() body: CloseClassSectionRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<ClassSectionProjection> {
    return this.classSections.close(principal, parameters.classSectionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }
}
