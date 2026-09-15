import { permitsSystemMode } from '../system-mode/system-mode-access.js';
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

interface StudentDeletionResult { id: string; deleted: boolean; deletedAt: string; version: number }

class DeleteStudentInput {
  @IsInt() @Min(1) expectedVersion!: number;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(32)
  confirmationStudentNumber!: string;
  @Transform(({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value))
  @IsString()
  @MinLength(1)
  @MaxLength(1000)
  reason!: string;
}
@Injectable()
export class V81StudentDeletionService {
  constructor(
    private readonly idempotency: IdempotencyService,
    private readonly clock: Clock,
  ) {}
  remove(
    p: AuthenticatedPrincipal,
    id: string,
    input: DeleteStudentInput,
    requestId: string,
    key?: string,
  ): Promise<StudentDeletionResult> {
    return this.idempotency.execute(
      {
        organizationId: p.organizationId,
        principalId: p.userId,
        authSessionId: p.sessionId,
        operationId: 'deleteV81StudentAccount',
        scope: id,
        request: input,
        requestId,
        key,
      },
      async (tx) => {
        await tx.$queryRaw`SELECT id FROM organizations WHERE id=${p.organizationId}::uuid FOR UPDATE`;
        await requireAdminAccess(tx, p, 'SUPER');
        if (!permitsSystemMode((await tx.systemPolicy.findUnique({ where: { organizationId: p.organizationId } }))
            ?.systemMode, p.role)) throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
        const rows = await tx.$queryRaw<
          { id: string; user_id: string; student_number: string; version: number }[]
        >`SELECT t.id,t.user_id,t.student_number,t.version
        FROM student_profiles t JOIN users u ON u.id=t.user_id AND u.organization_id=t.organization_id
        WHERE t.id=${id}::uuid AND t.organization_id=${p.organizationId}::uuid AND u.role='STUDENT' AND u.deleted_at IS NULL FOR UPDATE OF t,u`;
        const student = rows[0];
        if (!student) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
        if (student.version !== input.expectedVersion)
          throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
            actualVersion: student.version,
          });
        if (input.confirmationStudentNumber !== student.student_number)
          throw new ApplicationError('VALIDATION_FAILED', 422, {
            fieldErrors: [
              {
                field: 'confirmationStudentNumber',
                code: 'CONFIRMATION_MISMATCH',
                i18nKey: 'error.validation.failed',
                params: {},
              },
            ],
          });
        const now = this.clock.now();
        const [result] = await tx.$queryRaw<{ counts: Record<string, number> }[]>`
          SELECT erase_v81_student(${p.organizationId}::uuid,${id}::uuid,${p.userId}::uuid) AS counts`;
        await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${randomUUID()}::uuid,${p.organizationId}::uuid,'STUDENT',${id}::uuid,'ACCOUNT_AND_HISTORY_DELETED',${p.userId}::uuid,${requestId},${student.version + 1},
        ${JSON.stringify({ reason: input.reason, deletedCounts: result?.counts ?? {}, mediaCleanup: 'QUEUED' })}::jsonb,${now},'SUCCEEDED')`;
        return this.idempotency.success({
          id,
          deleted: true,
          deletedAt: now.toISOString(),
          version: student.version + 1,
        });
      },
    );
  }
}
@Controller('admin/students')
export class V81StudentDeletionController {
  constructor(private readonly service: V81StudentDeletionService) {}
  @Post(':id/delete')
  @OperationPolicy('deleteV81StudentAccount')
  remove(
    @CurrentPrincipal() p: AuthenticatedPrincipal,
    @Param(
      'id',
      new ParseUUIDPipe({ exceptionFactory: (): ApplicationError => new ApplicationError('VALIDATION_FAILED', 422) }),
    )
    id: string,
    @Body() input: DeleteStudentInput,
    @Headers('idempotency-key') key: string | undefined,
    @Req() req: FoundationRequest,
  ): Promise<StudentDeletionResult> {
    return this.service.remove(p, id, input, req.requestId, key);
  }
}
