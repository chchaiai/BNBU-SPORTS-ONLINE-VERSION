import {
  Body,
  Controller,
  Headers,
  Injectable,
  Param,
  ParseUUIDPipe,
  Post,
  Req,
} from '@nestjs/common';
import { IsInt, IsString, MaxLength, Min, MinLength } from 'class-validator';
import { Transform } from 'class-transformer';
import { randomUUID } from 'node:crypto';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
} from '../../common/http/request-context.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { V81SettlementCheckService } from './v81-settlement-check.js';

interface TeacherDeletionResult { id: string; deleted: boolean; deletedAt: string; version: number }

class DeleteTeacherInput {
  @IsInt() @Min(1) expectedVersion!: number;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  confirmationEmployeeNumber!: string;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
@Injectable()
export class V81TeacherDeletionService {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly clock: Clock,
    private readonly settlement: V81SettlementCheckService,
  ) {}
  remove(
    p: AuthenticatedPrincipal,
    id: string,
    input: DeleteTeacherInput,
    requestId: string,
    key?: string,
  ): Promise<TeacherDeletionResult> {
    return this.idempotency.execute(
      {
        organizationId: p.organizationId,
        principalId: p.userId,
        authSessionId: p.sessionId,
        operationId: 'deleteV81TeacherAccount',
        scope: id,
        request: input,
        requestId,
        key,
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR UPDATE`;
        await requireAdminAccess(tx, p, 'USER_ACCOUNTS');
        if (
          (await tx.systemPolicy.findUnique({ where: { organizationId: p.organizationId } }))
            ?.systemMode !== 'NORMAL'
        )
          throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        const rows = await tx.$queryRaw<
          { id: string; user_id: string; employee_number: string; version: number }[]
        >`SELECT t.id,t.user_id,t.employee_number,t.version
        FROM teacher_profiles t JOIN users u ON u.id=t.user_id AND u.organization_id=t.organization_id
        WHERE t.id=${id}::uuid AND t.organization_id=${p.organizationId}::uuid AND u.role='TEACHER' AND u.deleted_at IS NULL FOR UPDATE OF t,u`;
        const teacher = rows[0];
        if (!teacher) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
        if (teacher.version !== input.expectedVersion)
          throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
            actualVersion: teacher.version,
          });
        if (input.confirmationEmployeeNumber !== teacher.employee_number)
          throw new ApplicationError('VALIDATION_FAILED', 422, {
            fieldErrors: [
              {
                field: 'confirmationEmployeeNumber',
                code: 'CONFIRMATION_MISMATCH',
                i18nKey: 'error.validation.failed',
                params: {},
              },
            ],
          });
        const sections = await tx.$queryRaw<
          { id: string; status: string; end_date: Date }[]
        >`SELECT c.id,c.status,s.end_date FROM class_sections c JOIN semesters s ON s.id=c.semester_id
        WHERE c.teacher_id=${id}::uuid AND c.organization_id=${p.organizationId}::uuid FOR UPDATE OF c`;
        const now = this.clock.now();
        for (const section of sections) {
          const semesterFinished =
            now.getTime() >= section.end_date.getTime() + 86400000 - 8 * 3600000;
          const complete =
            semesterFinished &&
            ['CLOSED', 'ARCHIVED'].includes(section.status) &&
            (await this.settlement.checkInTransaction(tx, p.organizationId, section.id)).ready;
          if (!complete)
            throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409, {
              reason: 'TEACHER_RESPONSIBILITY_INCOMPLETE',
              fieldErrors: [
                {
                  field: 'teacher',
                  code: 'TEACHER_RESPONSIBILITY_INCOMPLETE',
                  i18nKey: 'error.validation.failed',
                  params: {},
                },
              ],
            });
        }
        const userId = teacher.user_id;
        // Existing 0046–0049 history subjects preserve all business references on deletion.
        await tx.idempotencyRecord.deleteMany({
          where: { organizationId: p.organizationId, principalId: userId },
        });
        for (const table of [
          'v81_runtime_archive_capabilities',
          'v81_account_deletion_challenges',
          'email_verification_challenges',
          'account_recovery_challenges',
          'student_sign_in_challenges',
          'push_devices',
          'user_preferences',
        ])
          await tx.$executeRawUnsafe(
            `DELETE FROM ${table} WHERE user_id=$1::uuid AND organization_id=$2::uuid`,
            userId,
            p.organizationId,
          );
        await tx.$executeRaw`DELETE FROM join_capabilities WHERE organization_id=${p.organizationId}::uuid AND (consumed_by_user_id=${userId}::uuid OR auth_session_id IN (SELECT id FROM auth_sessions WHERE user_id=${userId}::uuid))`;
        await tx.$executeRaw`DELETE FROM refresh_tokens WHERE auth_session_id IN (SELECT id FROM auth_sessions WHERE user_id=${userId}::uuid)`;
        await tx.authSession.deleteMany({ where: { organizationId: p.organizationId, userId } });
        await tx.$executeRaw`DELETE FROM v81_account_security WHERE user_id=${userId}::uuid`;
        await tx.teacherProfile.delete({ where: { id } });
        await tx.user.delete({ where: { id: userId } });
        await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'TEACHER',${id}::uuid,'ACCOUNT_DELETED',${p.userId}::uuid,${requestId},${teacher.version + 1},
        ${JSON.stringify({ reason: input.reason, teachingCompleted: true, retainedCourseCount: sections.length })}::jsonb,${now},'SUCCEEDED')`;
        return this.idempotency.success({
          id,
          deleted: true,
          deletedAt: now.toISOString(),
          version: teacher.version + 1,
        });
      },
    );
  }
}
@Controller('admin/teachers')
export class V81TeacherDeletionController {
  constructor(private readonly service: V81TeacherDeletionService) {}
  @Post(':id/delete')
  @OperationPolicy('deleteV81TeacherAccount')
  remove(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param(
      'id',
      new ParseUUIDPipe({ exceptionFactory: (): ApplicationError => new ApplicationError('VALIDATION_FAILED', 422) }),
    )
    id: string,
    @Body() input: DeleteTeacherInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest,
  ): Promise<TeacherDeletionResult> {
    return this.service.remove(p, id, input, req.requestId, key);
  }
}
