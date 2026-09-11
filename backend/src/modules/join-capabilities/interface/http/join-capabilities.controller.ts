import { Body, Controller, Headers, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { FoundationRequest } from '../../../../common/http/request-context.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CourseInviteTokenPathDto } from '../../../course-invites/interface/http/course-invites.dto.js';
import type { JoinCapabilityProjection } from '../../application/join-capability-projection.js';
import { JoinCapabilitiesService } from '../../application/join-capabilities.service.js';
import { IssueJoinCapabilityRequestDto } from './join-capabilities.dto.js';

function sensitiveResponse(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Referrer-Policy', 'no-referrer');
}

@Controller('course-invites/:inviteToken/join-capabilities')
export class JoinCapabilitiesController {
  constructor(private readonly joinCapabilities: JoinCapabilitiesService) {}

  @Post()
  @HttpCode(201)
  @OperationPolicy('issueJoinCapability')
  issue(
    @Param() _path: CourseInviteTokenPathDto,
    @Body() body: IssueJoinCapabilityRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<JoinCapabilityProjection> {
    sensitiveResponse(response);
    if (request.inviteContext === undefined) throw new Error('INVITE_CONTEXT_REQUIRED');
    return this.joinCapabilities.issue(request.inviteContext, body, {
      requestId: request.requestId,
      idempotencyKey,
      sourceIp: request.ip,
    });
  }
}
