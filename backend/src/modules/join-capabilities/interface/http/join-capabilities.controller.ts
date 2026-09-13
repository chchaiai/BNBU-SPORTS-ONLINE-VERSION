import { Body, Controller, Headers, HttpCode, Param, Post, Req, Res } from '@nestjs/common';
import type { Response } from 'express';

import type { FoundationRequest } from '../../../../common/http/request-context.js';
import { OperationPolicy } from '../../../../common/policy/operation-policy.decorator.js';
import { CourseInviteTokenPathDto } from '../../../course-invites/interface/http/course-invites.dto.js';
import type { JoinCapabilityProjection } from '../../application/join-capability-projection.js';
import { JoinCapabilitiesService } from '../../application/join-capabilities.service.js';
import { IssueJoinCapabilityRequestDto } from './join-capabilities.dto.js';
import { PrismaService } from '../../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../../common/errors/application-error.js';
import { QrJoinPolicyResolver } from '../../../../common/policy/qr-join-policy-resolver.js';

function sensitiveResponse(response: Response): void {
  response.setHeader('Cache-Control', 'no-store');
  response.setHeader('Pragma', 'no-cache');
  response.setHeader('Referrer-Policy', 'no-referrer');
}

@Controller('course-invites/:inviteToken/join-capabilities')
export class JoinCapabilitiesController {
  constructor(private readonly joinCapabilities: JoinCapabilitiesService,
    private readonly prisma: PrismaService, private readonly invites: QrJoinPolicyResolver) {}

  @Post('member')
  @HttpCode(201)
  @OperationPolicy('issueMemberJoinCapability')
  async issueMember(
    @Param() path: CourseInviteTokenPathDto,
    @Body() body: IssueJoinCapabilityRequestDto,
    @Headers('idempotency-key') idempotencyKey: string | undefined,
    @Req() request: FoundationRequest,
    @Res({ passthrough: true }) response: Response,
  ): Promise<JoinCapabilityProjection> {
    sensitiveResponse(response);
    const principal = request.principal;
    if (!principal || principal.role !== 'STUDENT') throw new ApplicationError('AUTH_REQUIRED', 401);
    const profile = await this.prisma.studentProfile.findFirst({ where: {
      userId: principal.userId, organizationId: principal.organizationId, deletedAt: null,
    } });
    if (!profile) throw new ApplicationError('AUTH_REQUIRED', 401);
    const invite = await this.invites.resolveInvite({ inviteToken: path.inviteToken,
      sourceIp: request.ip, operationId: 'issueJoinCapability' });
    if (invite.organizationId !== principal.organizationId) throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return this.joinCapabilities.issue(invite, { ...body, fullName: profile.fullName,
      studentNumber: profile.studentNumber, gender: profile.gender, gradeYear: profile.gradeYear,
      ...(profile.collegeName ? { collegeName: profile.collegeName } : {}),
      ...(profile.majorName ? { majorName: profile.majorName } : {}),
      ...(profile.dateOfBirth ? { dateOfBirth: profile.dateOfBirth.toISOString().slice(0, 10) } : {}),
      ...(profile.otherRegionName ? { otherRegionName: profile.otherRegionName } : {}),
      ...(profile.regionCode ? { regionCode: profile.regionCode } : {}),
    }, { requestId: request.requestId, idempotencyKey, sourceIp: request.ip, authenticatedUserId: principal.userId });
  }

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
