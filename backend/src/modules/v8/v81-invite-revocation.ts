import { Body, Controller, Headers, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { IsString, Length } from 'class-validator';
import { ApplicationError } from '../../common/errors/application-error.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { QrJoinCryptoService } from '../../common/security/qr-join-crypto.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
export class V81InviteRevocationInput {
  @IsString() @Length(16, 512) inviteToken!: string;
}
@Controller('class-sections/:classSectionId/course-invites/revocations')
export class V81InviteRevocationController {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly crypto: QrJoinCryptoService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
  ) {}
  @Post()
  @OperationPolicy('revokeV81CourseInvite')
  revoke(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param(
      'classSectionId',
      new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) }),
    )
    sectionId: string,
    @Body() input: V81InviteRevocationInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest,
  ) {
    if (p.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const token = this.crypto.parseToken('course-invite', input.inviteToken);
    if (!token) throw new ApplicationError('VALIDATION_FAILED', 422);
    return this.idempotency.execute(
      {
        organizationId: p.organizationId,
        principalId: p.userId,
        authSessionId: p.sessionId,
        operationId: 'revokeV81CourseInvite',
        scope: `${p.organizationId}:${sectionId}`,
        key,
        request: { sectionId, ...input },
        requestId: req.requestId,
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR UPDATE`;
        if (
          (await tx.systemPolicy.findUnique({ where: { organizationId: p.organizationId } }))
            ?.systemMode !== 'NORMAL'
        )
          throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        await tx.$queryRaw`SELECT id FROM class_sections WHERE id=${sectionId}::uuid AND organization_id=${p.organizationId}::uuid FOR UPDATE`;
        const section = await tx.classSection.findFirst({
          where: {
            id: sectionId,
            organizationId: p.organizationId,
            teacher: { userId: p.userId, status: 'ACTIVE', deletedAt: null },
          },
        });
        if (!section) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
        const invite = await tx.courseInvite.findFirst({
          where: {
            id: token.publicId,
            organizationId: p.organizationId,
            classSectionId: sectionId,
          },
        });
        if (!invite || !this.crypto.matches(invite.tokenHash, token.tokenHash))
          throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
        if (invite.status !== 'ACTIVE')
          throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        const now = this.clock.now();
        const revoked = await tx.courseInvite.update({
          where: { id: invite.id },
          data: {
            status: 'REVOKED',
            revokedAt: now,
            revokedBy: p.userId,
            revokeReason: 'TEACHER_REVOKED',
            replacedByInviteId: null,
            rowVersion: { increment: 1 },
          },
        });
        await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${p.organizationId}::uuid,'COURSE_INVITE',${invite.id}::uuid,'REVOKED',${p.userId}::uuid,
          ${req.requestId},${revoked.rowVersion},${JSON.stringify({ classSectionId: sectionId })}::jsonb,${now},'SUCCEEDED')`;
        return this.idempotency.success(
          {
            id: invite.id,
            classSectionId: sectionId,
            status: 'REVOKED',
            version: revoked.rowVersion,
            revokedAt: now.toISOString(),
          },
          { resourceType: 'COURSE_INVITE', resourceId: invite.id },
        );
      },
    );
  }
}
