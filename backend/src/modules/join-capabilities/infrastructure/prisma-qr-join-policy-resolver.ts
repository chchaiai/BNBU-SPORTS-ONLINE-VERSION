import { Injectable } from '@nestjs/common';

import { ApplicationError } from '../../../common/errors/application-error.js';
import {
  QrJoinPolicyResolver,
  type CourseInvitePolicyContext,
  type JoinCapabilityPolicyContext,
} from '../../../common/policy/qr-join-policy-resolver.js';
import { QrJoinPublicRateLimitService } from '../../../common/rate-limit/qr-join-public-rate-limit.service.js';
import { QrJoinCryptoService } from '../../../common/security/qr-join-crypto.service.js';
import { Clock } from '../../../common/time/clock.js';
import { CourseInviteRepository } from '../../course-invites/domain/course-invite.repository.js';
import { JoinCapabilityRepository } from '../domain/join-capability.repository.js';

@Injectable()
export class PrismaQrJoinPolicyResolver extends QrJoinPolicyResolver {
  constructor(
    private readonly invites: CourseInviteRepository,
    private readonly capabilities: JoinCapabilityRepository,
    private readonly crypto: QrJoinCryptoService,
    private readonly rateLimits: QrJoinPublicRateLimitService,
    private readonly clock: Clock,
  ) {
    super();
  }

  async resolveInvite(input: {
    inviteToken: string;
    sourceIp: string | undefined;
    operationId: 'previewCourseInvite' | 'issueJoinCapability';
  }): Promise<CourseInvitePolicyContext> {
    await this.rateLimits.enforce([
      `qr:${input.operationId}:invite:${this.crypto.opaqueReference('invite-rate', input.inviteToken)}`,
      `qr:${input.operationId}:source:${this.crypto.opaqueReference('source-rate', input.sourceIp ?? 'unavailable')}`,
    ]);
    const parsed = this.crypto.parseToken('course-invite', input.inviteToken);
    if (parsed === null) throw new ApplicationError('COURSE_INVITE_INVALID', 400);
    const record = await this.invites.findPolicyRecordById(parsed.publicId);
    if (record === null || !this.crypto.matches(record.tokenHash, parsed.tokenHash)) {
      throw new ApplicationError('COURSE_INVITE_INVALID', 400);
    }
    this.assertInviteUsable(record.context);
    return record.context;
  }

  async resolveCapability(input: {
    inviteToken: string;
    joinCapability: string;
    sourceIp: string | undefined;
  }): Promise<JoinCapabilityPolicyContext> {
    await this.rateLimits.enforce([
      `qr:join:capability:${this.crypto.opaqueReference('capability-rate', input.joinCapability)}`,
      `qr:join:invite:${this.crypto.opaqueReference('invite-rate', input.inviteToken)}`,
      `qr:join:source:${this.crypto.opaqueReference('source-rate', input.sourceIp ?? 'unavailable')}`,
    ]);
    const capability = this.crypto.parseToken('join-capability', input.joinCapability);
    const invite = this.crypto.parseToken('course-invite', input.inviteToken);
    if (capability === null || invite === null) {
      throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401);
    }
    const record = await this.capabilities.findPolicyRecordById(capability.publicId);
    if (
      record?.context.courseInviteId !== invite.publicId ||
      !this.crypto.matches(record.tokenHash, capability.tokenHash) ||
      !this.crypto.matches(record.inviteTokenHash, invite.tokenHash)
    ) {
      throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401);
    }
    if (record.context.status === 'CONSUMED') return record.context;
    if (record.context.status === 'EXPIRED' || record.context.expiresAt <= this.clock.now()) {
      throw new ApplicationError('AUTH_JOIN_CAPABILITY_EXPIRED', 410);
    }
    if (record.context.status !== 'ACTIVE') {
      throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401);
    }
    try {
      this.assertInviteUsable(record.context.invite);
    } catch (error: unknown) {
      if (error instanceof ApplicationError) {
        throw new ApplicationError('AUTH_JOIN_CAPABILITY_INVALID', 401);
      }
      throw error;
    }
    return record.context;
  }

  private assertInviteUsable(context: CourseInvitePolicyContext): void {
    if (context.status === 'REVOKED') {
      throw new ApplicationError('COURSE_INVITE_REVOKED', 410);
    }
    if (context.status === 'EXPIRED' || context.expiresAt <= this.clock.now()) {
      throw new ApplicationError('COURSE_INVITE_EXPIRED', 410);
    }
    if (context.status !== 'ACTIVE') {
      throw new ApplicationError('COURSE_INVITE_INVALID', 400);
    }
    const section = context.classSection;
    if (
      section.status !== 'ACTIVE' ||
      !section.isEnrollmentOpen ||
      section.course.status !== 'ACTIVE' ||
      section.course.deletedAt !== null ||
      section.semester.status !== 'CURRENT' ||
      section.teacher.status !== 'ACTIVE' ||
      section.teacher.deletedAt !== null ||
      this.clock.now() > new Date(section.semester.endDate.getTime() + 86_400_000 - 1)
    ) {
      throw new ApplicationError('COURSE_CLASS_SECTION_NOT_JOINABLE', 409);
    }
  }
}
