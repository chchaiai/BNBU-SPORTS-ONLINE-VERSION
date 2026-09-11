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
import type { CourseProjection } from '../../application/course-projection.js';
import { CoursesService } from '../../application/courses.service.js';
import {
  CourseListQueryDto,
  CoursePathParameters,
  CreateCourseRequestDto,
  UpdateCourseRequestDto,
} from './courses.dto.js';

@Controller('courses')
export class CoursesController {
  constructor(private readonly courses: CoursesService) {}

  @Get()
  @OperationPolicy('listCourses')
  list(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Query() query: CourseListQueryDto,
  ): Promise<PagedResult<CourseProjection>> {
    return this.courses.list(principal, query);
  }

  @Post()
  @HttpCode(201)
  @OperationPolicy('createCourse')
  create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Body() body: CreateCourseRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<CourseProjection> {
    return this.courses.create(principal, body, { requestId: request.requestId, idempotencyKey });
  }

  @Get(':courseId')
  @OperationPolicy('getCourse')
  get(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: CoursePathParameters,
  ): Promise<CourseProjection> {
    return this.courses.get(principal, parameters.courseId);
  }

  @Patch(':courseId')
  @OperationPolicy('updateCourse')
  update(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() parameters: CoursePathParameters,
    @Body() body: UpdateCourseRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
  ): Promise<CourseProjection> {
    return this.courses.update(principal, parameters.courseId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }
}
