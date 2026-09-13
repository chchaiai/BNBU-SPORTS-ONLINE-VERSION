import { V81SettlementReportsService } from './v81-settlement-reports.js';
import {
  Body,
  Controller,
  Get,
  Headers,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, MaxLength, Min, MinLength } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import { AuditService } from '../../common/audit/audit.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { pagedResult } from '../../common/http/envelope.interceptor.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { ScopedCursorService } from '../../common/pagination/scoped-cursor.service.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { recomputeCredits } from './v81-credit-store.js';
import { approveCertificationCredit } from './v81-certification-credit.js';

class CertificationQuery {
  @Type(() => Number) @IsInt() @Min(1) @Max(100) limit = 100;
  @IsOptional() @IsString() @MaxLength(2048) cursor?: string;
}
class RevokeCertificationInput {
  @Type(() => Number) @IsInt() @Min(1) expectedVersion!: number;
  @IsString() @MinLength(1) @MaxLength(1000) reason!: string;
}
class AdjustRecognitionInput extends RevokeCertificationInput {
  @IsInt() @Min(0) @Max(2147483647) courseMinutes!: number;
  @IsInt() @Min(0) @Max(2147483647) generalMinutes!: number;
}
const include = {
  classSection: { include: { teacher: true } },
  student: { select: { userId: true } },
  media: { select: { mediaId: true }, orderBy: { position: 'asc' as const } },
} as const;
const readInclude = { media: include.media } as const;
type Application = Prisma.ExemptionApplicationGetPayload<{ include: typeof readInclude }>;
const uuid = new ParseUUIDPipe({
  exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422),
});

@Injectable()
export class V81CertificationsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly cursors: ScopedCursorService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly audit: AuditService,
    private readonly reports: V81SettlementReportsService,
  ) {}
  private scope(principal: AuthenticatedPrincipal): Prisma.ExemptionApplicationWhereInput {
    if (principal.role === 'ADMIN')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    return {
      organizationId: principal.organizationId,
      applicationType: 'EXERCISE_CHECK_IN',
      membershipClearedAt: null,
      enrollment: { status: 'ACTIVE' },
      applicationSubtype: { in: ['SCHOOL_TEAM', 'STUDENT_CLUB'] },
      ...(principal.role === 'STUDENT'
        ? { student: { userId: principal.userId } }
        : { classSection: { teacher: { userId: principal.userId } } }),
    };
  }
  private project(row: Application) {
    return {
      id: row.id,
      studentId: row.studentId,
      enrollmentId: row.enrollmentId,
      classSectionId: row.classSectionId,
      certificationType: row.applicationSubtype,
      organizationName: row.organizationName,
      status: row.status,
      currentDecisionReason: row.publicComment,
      mediaIds: row.media.map((item) => item.mediaId),
      version: row.version,
      submittedAt: row.submittedAt?.toISOString() ?? null,
      decidedAt: row.decidedAt?.toISOString() ?? null,
      validFrom: null,
      validTo: null,
    };
  }
  async list(principal: AuthenticatedPrincipal, query: CertificationQuery) {
    const binding = {
      resource: 'CERTIFICATION' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: {},
      sort: 'id',
      limit: query.limit,
    };
    const position = this.cursors.decode(query.cursor, binding);
    const rows = await this.prisma.exemptionApplication.findMany({
      where: { ...this.scope(principal), ...(position ? { id: { gt: position.id } } : {}) },
      include: readInclude,
      orderBy: { id: 'asc' },
      take: query.limit + 1,
    });
    const page = rows.slice(0, query.limit),
      last = page.at(-1);
    return pagedResult(
      page.map((row) => this.project(row)),
      {
        limit: query.limit,
        hasMore: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode(binding, { id: last.id, value: last.id })
            : null,
      },
    );
  }
  async adjust(principal: AuthenticatedPrincipal,id:string,input:AdjustRecognitionInput,facts:{requestId:string;idempotencyKey:string|undefined}) {
    if(principal.role!=='TEACHER')throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED',403);
    if(!input.reason.trim()||input.expectedVersion>2147483646)throw new ApplicationError('VALIDATION_FAILED',422);
    return this.idempotency.execute({organizationId:principal.organizationId,principalId:principal.userId,authSessionId:principal.sessionId,
      operationId:'adjustV81Recognition',scope:id,key:facts.idempotencyKey,request:input,requestId:facts.requestId},async tx=>{
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      if((await tx.systemPolicy.findUnique({where:{organizationId:principal.organizationId}}))?.systemMode!=='NORMAL')throw new ApplicationError('SYSTEM_MAINTENANCE',503);
      const current=await tx.exemptionApplication.findFirst({where:{...this.scope(principal),id},include});
      if(!current)throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND',404);
      if(current.version!==input.expectedVersion)throw new ApplicationError('CONFLICT_VERSION_MISMATCH',409);
      if(current.status!=='APPROVED')throw new ApplicationError('CONFLICT_STATE_TRANSITION',409);
      const settled = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_settlement_report_revisions
        WHERE organization_id=${principal.organizationId}::uuid AND class_section_id=${current.classSectionId}::uuid LIMIT 1`).length > 0;
      if(!settled && (await tx.semester.findUniqueOrThrow({where:{id:current.semesterId}})).status==='ARCHIVED')throw new ApplicationError('CONFLICT_STATE_TRANSITION',409,{reason:'ARCHIVED_FACT_CORRECTION_REQUIRED'});
      const credit=await tx.v81CertificationCredit.findUnique({where:{applicationId:id}});
      if(!credit?.active)throw new ApplicationError('CONFLICT_STATE_TRANSITION',409);
      const now=this.clock.now(),version=current.version+1;
      await approveCertificationCredit(tx,{applicationId:id,enrollmentId:current.enrollmentId,organizationId:principal.organizationId,actorId:principal.userId,
        requestId:facts.requestId,eventId:this.ids.next(),version,courseMinutes:input.courseMinutes,generalMinutes:input.generalMinutes,reason:input.reason.trim(),now,eventType:settled?'FACT_CORRECTED':'ADJUSTED'});
      const previous=await tx.exemptionReviewRecord.findFirst({where:{applicationId:id},orderBy:{reviewVersion:'desc'}});
      await tx.exemptionReviewRecord.create({data:{id:this.ids.next(),organizationId:principal.organizationId,applicationId:id,teacherId:current.classSection.teacher.id,
        reviewVersion:(previous?.reviewVersion??0)+1,previousReviewId:previous?.id??null,decision:'ADJUST_RECOGNITION',publicComment:input.reason.trim(),internalNote:null,requestId:facts.requestId,reviewedAt:now}});
      const updated=await tx.exemptionApplication.update({where:{id},data:{publicComment:input.reason.trim(),decidedAt:now,updatedAt:now,version:{increment:1}},include});
      await tx.exemptionApplicationEvent.create({data:{id:this.ids.next(),organizationId:principal.organizationId,applicationId:id,eventType:'UPDATED',fromStatus:current.status,toStatus:updated.status,
        actorUserId:principal.userId,authSessionId:principal.sessionId,eventVersion:version,requestId:facts.requestId,occurredAt:now}});
      await this.audit.append(tx,{organizationId:principal.organizationId,actorUserId:principal.userId,actorRoleSnapshot:'TEACHER',permissionId:'CERTIFICATION-ADJUST',actionType:'EXEMPTION_APPLICATION_CHANGED',
        targetType:'EXEMPTION_APPLICATION',targetId:id,requestId:facts.requestId,outcome:'SUCCEEDED',safeMetadata:{classSectionId:current.classSectionId,previousStatus:current.status,nextStatus:updated.status}});
      const english=(await tx.userPreference.findUnique({where:{userId:current.student.userId}}))?.locale==='en';
      await tx.notification.create({data:{id:this.ids.next(),organizationId:principal.organizationId,recipientUserId:current.student.userId,notificationType:'ACTIVITY_CERTIFICATION_RESULT',
        title:english?'Recognized minutes updated':'认证认可分钟已调整',body:input.reason.trim(),targetType:'EXEMPTION_APPLICATION',targetId:id,createdAt:now}});
      if(settled) await this.reports.appendCertificationCorrectionInTransaction(tx,principal,current.classSectionId,id,version,input.reason,facts.requestId);
      return this.idempotency.success(this.project(updated));
    });
  }
  async history(principal: AuthenticatedPrincipal, id: string, query: CertificationQuery) {
    if (
      !(await this.prisma.exemptionApplication.findFirst({
        where: { ...this.scope(principal), id },
      }))
    )
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const binding = {
      resource: 'CERTIFICATION_REVISION' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: { applicationId: id },
      sort: '-version',
      limit: query.limit,
    };
    const position = this.cursors.decode(query.cursor, binding);
    const rows = await this.prisma.$queryRaw<
      {
        id: string;
        version: number;
        facts: { courseSeconds: number; generalSeconds: number; reason: string; active: boolean };
        occurred_at: Date;
      }[]
    >`
      SELECT id,version,facts,occurred_at FROM v81_events WHERE organization_id=${principal.organizationId}::uuid AND resource_type='CERTIFICATION_CREDIT' AND resource_id=${id}::uuid
      AND (${position?.value ?? null}::integer IS NULL OR version<${position?.value ?? null}::integer) ORDER BY version DESC LIMIT ${query.limit + 1}`;
    const page = rows.slice(0, query.limit),
      last = page.at(-1);
    return pagedResult(
      page.map((row) => ({
        id: row.id,
        applicationId: id,
        revisionNumber: row.version,
        courseSeconds: row.facts.courseSeconds,
        generalSeconds: row.facts.generalSeconds,
        reason: row.facts.reason,
        active: row.facts.active,
        createdAt: row.occurred_at.toISOString(),
      })),
      {
        limit: query.limit,
        hasMore: rows.length > query.limit,
        nextCursor:
          rows.length > query.limit && last
            ? this.cursors.encode(binding, { id: last.id, value: String(last.version) })
            : null,
      },
    );
  }
  async revoke(
    principal: AuthenticatedPrincipal,
    id: string,
    input: RevokeCertificationInput,
    facts: { requestId: string; idempotencyKey: string | undefined },
  ) {
    if (principal.role !== 'TEACHER')
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    if (!input.reason.trim()) throw new ApplicationError('VALIDATION_FAILED', 422);
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'revokeV81Certification',
        scope: id,
        key: facts.idempotencyKey,
        request: input,
        requestId: facts.requestId,
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        const policy = await tx.systemPolicy.findUnique({
          where: { organizationId: principal.organizationId },
        });
        if (policy?.systemMode !== 'NORMAL') throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        const current = await tx.exemptionApplication.findFirst({
          where: { ...this.scope(principal), id },
          include,
        });
        if (!current) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
        const settled = (await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_settlement_report_revisions
          WHERE organization_id=${principal.organizationId}::uuid AND class_section_id=${current.classSectionId}::uuid LIMIT 1`).length > 0;
        if (current.version !== input.expectedVersion)
          throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
        if (current.status !== 'APPROVED')
          throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        const semester = await tx.semester.findUniqueOrThrow({ where: { id: current.semesterId } });
        if (!settled && semester.status === 'ARCHIVED')
          throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, {
            reason: 'ARCHIVED_FACT_CORRECTION_REQUIRED',
          });
        const now = this.clock.now();
        const changed =
          await tx.$executeRaw`UPDATE v81_certification_credits SET active=false,version=version+1 WHERE application_id=${id}::uuid AND active=true`;
        if (changed !== 1) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
        const previous = await tx.exemptionReviewRecord.findFirst({
          where: { applicationId: id },
          orderBy: { reviewVersion: 'desc' },
        });
        await tx.exemptionReviewRecord.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            applicationId: id,
            teacherId: current.classSection.teacher.id,
            reviewVersion: (previous?.reviewVersion ?? 0) + 1,
            previousReviewId: previous?.id ?? null,
            decision: 'REVOKE',
            publicComment: input.reason,
            internalNote: null,
            requestId: facts.requestId,
            reviewedAt: now,
          },
        });
        const updated = await tx.exemptionApplication.update({
          where: { id },
          data: {
            status: 'REVOKED',
            publicComment: input.reason,
            decidedAt: now,
            updatedAt: now,
            version: { increment: 1 },
          },
          include,
        });
        await tx.exemptionApplicationEvent.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            applicationId: id,
            eventType: 'REVOKED',
            fromStatus: 'APPROVED',
            toStatus: 'REVOKED',
            actorUserId: principal.userId,
            authSessionId: principal.sessionId,
            eventVersion: updated.version,
            requestId: facts.requestId,
            occurredAt: now,
          },
        });
        await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'CERTIFICATION_CREDIT',${id}::uuid,${settled ? 'FACT_CORRECTED' : 'REVOKED'},${principal.userId}::uuid,${facts.requestId},${updated.version},${JSON.stringify({ courseSeconds: 0, generalSeconds: 0, reason: input.reason, active: false, ...(settled ? { correctionReason: input.reason.trim() } : {}) })}::jsonb,${now},'SUCCEEDED')`;
        await recomputeCredits(tx, current.enrollmentId, now);
        await this.audit.append(tx, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: 'TEACHER',
          permissionId: 'CERTIFICATION-REVOKE',
          actionType: 'EXEMPTION_APPLICATION_CHANGED',
          targetType: 'EXEMPTION_APPLICATION',
          targetId: id,
          requestId: facts.requestId,
          outcome: 'SUCCEEDED',
          safeMetadata: {
            previousStatus: 'APPROVED',
            nextStatus: 'REVOKED',
            classSectionId: current.classSectionId,
          },
        });
        const locale = await tx.userPreference.findUnique({
          where: { userId: current.student.userId },
        });
        await tx.notification.create({
          data: {
            id: this.ids.next(),
            organizationId: principal.organizationId,
            recipientUserId: current.student.userId,
            notificationType: 'ACTIVITY_CERTIFICATION_RESULT',
            title: locale?.locale === 'en' ? 'Certification revoked' : '认证已撤销',
            body: input.reason,
            targetType: 'EXEMPTION_APPLICATION',
            targetId: id,
            createdAt: now,
          },
        });
        if (settled) await this.reports.appendCertificationCorrectionInTransaction(tx, principal, current.classSectionId, id, updated.version, input.reason, facts.requestId);
        return this.idempotency.success(this.project(updated));
      },
    );
  }
}

@Controller('activity-certification-applications')
export class V81CertificationsController {
  constructor(private readonly service: V81CertificationsService) {}
  @Get()
  @OperationPolicy('listV81Certifications')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Query() query: CertificationQuery) {
    return this.service.list(principal, query);
  }
  @Get(':id/recognition-allocation-revisions')
  @OperationPolicy('listV81RecognitionRevisions')
  history(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Query() query: CertificationQuery,
  ) {
    return this.service.history(principal, id, query);
  }
  @Post(':id/revoke')
  @OperationPolicy('revokeV81Certification')
  revoke(
    @CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('id', uuid) id: string,
    @Body() input: RevokeCertificationInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() request: FoundationRequest,
  ) {
    return this.service.revoke(principal, id, input, {
      requestId: request.requestId,
      idempotencyKey: key,
    });
  }
  @Post(':id/recognition-allocation-revisions') @OperationPolicy('adjustV81Recognition')
  adjust(@CurrentPrincipal() principal:AuthenticatedPrincipal,@Param('id',uuid) id:string,@Body() input:AdjustRecognitionInput,
    @Headers('idempotency-key') key:string|undefined,@Req() request:FoundationRequest){
    return this.service.adjust(principal,id,input,{requestId:request.requestId,idempotencyKey:key});
  }
}
