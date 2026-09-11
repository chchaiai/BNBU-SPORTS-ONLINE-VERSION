import { Body, Controller, Get, Headers, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../../../common/http/request-context.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../../../common/policy/principal.decorator.js';
import type {
  CourseInvitePreviewProjection,
  CourseInviteProjection,
} from '../../application/course-invite-projection.js';
import { CourseInvitesService } from '../../application/course-invites.service.js';
import {
  CourseInviteClassSectionPathDto,
  CourseInviteTokenPathDto,
  CreateCourseInviteRequestDto,
} from './course-invites.dto.js';

function sensitiveResponse(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Referrer-Policy', 'no-referrer');
}

@Controller()
export class CourseInvitesController {
  constructor(private readonly courseInvites: CourseInvitesService) {}

  @Post('class-sections/:classSectionId/course-invites')
  @HttpCode(201)
  @OperationPolicy('createCourseInvite')
  async create(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param() path: CourseInviteClassSectionPathDto,
    @Body() body: CreateCourseInviteRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<CourseInviteProjection> {
    sensitiveResponse(response);
    return this.courseInvites.createOrRotate(principal, path.classSectionId, body, {
      requestId: request.requestId,
      idempotencyKey,
    });
  }

  @Get('course-invites/:inviteToken/preview')
  @OperationPolicy('previewCourseInvite')
  preview(
    @Param() _path: CourseInviteTokenPathDto,
    @Req() request: FoundationRequest,
    @Res({ passthrough: true }) response: Response,
  ): CourseInvitePreviewProjection {
    sensitiveResponse(response);
    if (request.inviteContext === undefined) throw new Error('INVITE_CONTEXT_REQUIRED');
    return this.courseInvites.preview(request.inviteContext);
  }
}
