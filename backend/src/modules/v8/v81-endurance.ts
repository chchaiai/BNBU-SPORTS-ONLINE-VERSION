import { permitsSystemMode } from '../system-mode/system-mode-access.js';
import { Body, Controller, Get, Headers, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { IsIn, IsInt, IsString, Min, Max } from 'class-validator';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { FoundationRequest } from '../../common/http/request-context.js';
import { v5 as uuidv5 } from 'uuid';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../common/http/request-context.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { requireAdminAccess } from './v81-admin-access.js';
import { initialEnduranceBands, validateEnduranceTable, type EnduranceBand, type EnduranceTableKey } from './domain/endurance-table.js';

type TableRow = { id: string; gender: EnduranceTableKey['gender']; grade_group: EnduranceTableKey['gradeGroup'];
  run_type: EnduranceTableKey['runType']; version: number; bands: EnduranceBand[]; created_at: Date };
type Mutation = { action: 'create' | 'update' | 'delete'; ruleId?: string; band?: Omit<EnduranceBand, 'id'>; expectedVersion: number };
export class EnduranceTableInput implements EnduranceTableKey {
  @IsIn(['male', 'female']) gender!: EnduranceTableKey['gender'];
  @IsIn(['freshman_sophomore', 'junior_senior']) gradeGroup!: EnduranceTableKey['gradeGroup'];
  @IsIn(['800m', '1000m']) runType!: EnduranceTableKey['runType'];
  @IsInt() @Min(0) expectedVersion!: number;
}
export class EnduranceBandInput extends EnduranceTableInput {
  @IsInt() @Min(0) @Max(9007199254740991) minSeconds!: number;
  @IsInt() @Min(0) @Max(9007199254740991) maxSeconds!: number;
  @IsInt() @Min(0) @Max(100) score!: number;
  @IsIn(['excellent', 'good', 'pass', 'fail']) tier!: EnduranceBand['tier'];
  @IsString() note!: string;
}
const keys: EnduranceTableKey[] = ['male', 'female'].flatMap(gender => ['freshman_sophomore', 'junior_senior'].map(gradeGroup =>
  ({ gender, gradeGroup, runType: gender === 'male' ? '1000m' : '800m' } as EnduranceTableKey)));

@Injectable()
export class V81EnduranceService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator) {}

  private baseline(organizationId: string, key: EnduranceTableKey) {
    const id = uuidv5(`bnbu:v81:endurance:${organizationId}:${key.gender}:${key.gradeGroup}`, uuidv5.URL);
    let index = 0;
    return { id, ...key, version: 0, updatedAt: null as string | null,
      bands: initialEnduranceBands(key, () => uuidv5(`band:${index++}`, id)) };
  }

  private async read(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, organizationId: string, key: EnduranceTableKey) {
    // Read-only default projection; the first successful mutation stores version 1.
    const baseline = this.baseline(organizationId, key);
    const rows = await tx.$queryRaw<TableRow[]>`SELECT t.id,t.gender,t.grade_group,t.run_type,r.version,r.bands,r.created_at
      FROM v81_endurance_tables t JOIN v81_endurance_table_revisions r ON r.table_id=t.id
      WHERE t.organization_id=${organizationId}::uuid AND t.gender=${key.gender} AND t.grade_group=${key.gradeGroup}
      ORDER BY r.version DESC LIMIT 1`;
    const row = rows[0];
    return row ? { id: row.id, gender: row.gender, gradeGroup: row.grade_group, runType: row.run_type,
      version: row.version, bands: row.bands, updatedAt: row.created_at.toISOString() } : baseline;
  }

  async list(principal: AuthenticatedPrincipal) {
    await requireAdminAccess(this.prisma, principal, 'GLOBAL_RULES');
    return this.prisma.$transaction(async tx => {
      const result = [];
      for (const key of keys) result.push(await this.read(tx, principal.organizationId, key));
      return result;
    }, { isolationLevel: 'RepeatableRead' });
  }

  async mutate(principal: AuthenticatedPrincipal, table: EnduranceTableKey, input: Mutation,
    requestId: string, idempotencyKey: string | undefined) {
    await requireAdminAccess(this.prisma, principal, 'GLOBAL_RULES');
    if (!keys.some(key => key.gender === table.gender && key.gradeGroup === table.gradeGroup && key.runType === table.runType))
      throw new ApplicationError('VALIDATION_FAILED', 422);
    if (!['create', 'update', 'delete'].includes(input.action) || (input.action === 'create' && input.ruleId !== undefined) ||
      (input.action === 'delete' && input.band !== undefined)) throw new ApplicationError('VALIDATION_FAILED', 422);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'mutateV81EnduranceRule',
      scope: `${principal.organizationId}:${table.gender}:${table.gradeGroup}`, request: { table, ...input }, requestId, key: idempotencyKey }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      await requireAdminAccess(tx, principal, 'GLOBAL_RULES');
      const policy = await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } });
      if (!permitsSystemMode(policy?.systemMode, principal.role)) throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      const previous = await this.read(tx, principal.organizationId, table);
      if (input.expectedVersion !== previous.version) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      const before = previous.bands.find(row => row.id === input.ruleId);
      if (input.action !== 'create' && !before) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      if (input.action !== 'delete' && !input.band) throw new ApplicationError('VALIDATION_FAILED', 422);
      const after = input.action === 'delete' ? null : { ...input.band!, id: input.action === 'create' ? this.ids.next() : before!.id };
      let bands;
      try { bands = validateEnduranceTable(table, previous.bands.filter(row => row.id !== before?.id).concat(after ? [after] : [])); }
      catch (error) { throw new ApplicationError('VALIDATION_FAILED', 422, { reason: error instanceof Error ? error.message : 'ENDURANCE_TABLE_INVALID' }); }
      const now = this.clock.now(), version = previous.version + 1;
      if (previous.version === 0) await tx.$executeRaw`INSERT INTO v81_endurance_tables(id,organization_id,gender,grade_group,run_type,created_at)
        VALUES(${previous.id}::uuid,${principal.organizationId}::uuid,${table.gender},${table.gradeGroup},${table.runType},${now})`;
      await tx.$executeRaw`INSERT INTO v81_endurance_table_revisions(table_id,organization_id,version,bands,actor_id,request_id,created_at)
        VALUES(${previous.id}::uuid,${principal.organizationId}::uuid,${version},${JSON.stringify(bands)}::jsonb,
          ${principal.userId}::uuid,${requestId},${now})`;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'ENDURANCE_TABLE',${previous.id}::uuid,${input.action.toUpperCase()},
          ${principal.userId}::uuid,${requestId},${version},${JSON.stringify({ previousVersion: previous.version,
            initialBands: previous.version === 0 ? previous.bands : null, before: before ?? null,
            after: after ? bands.find(row => row.id === after.id) : null })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({ ...previous, version, bands, updatedAt: now.toISOString() });
    });
  }
}

const enduranceUuid = new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) });
@Controller('admin/endurance-tables')
export class V81EnduranceController {
  constructor(private readonly service: V81EnduranceService) {}
  @Get() @OperationPolicy('listV81EnduranceTables')
  list(@CurrentPrincipal() principal: AuthenticatedPrincipal) { return this.service.list(principal); }

  @Post('rules') @OperationPolicy('createV81EnduranceRule')
  create(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Body() input: EnduranceBandInput,
    @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    const { gender, gradeGroup, runType, expectedVersion, ...band } = input;
    return this.service.mutate(principal, { gender, gradeGroup, runType }, { action: 'create', expectedVersion, band }, req.requestId, key);
  }
  @Post('rules/:ruleId') @OperationPolicy('updateV81EnduranceRule')
  update(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('ruleId', enduranceUuid) ruleId: string,
    @Body() input: EnduranceBandInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    const { gender, gradeGroup, runType, expectedVersion, ...band } = input;
    return this.service.mutate(principal, { gender, gradeGroup, runType }, { action: 'update', ruleId, expectedVersion, band }, req.requestId, key);
  }
  @Post('rules/:ruleId/delete') @OperationPolicy('deleteV81EnduranceRule')
  remove(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('ruleId', enduranceUuid) ruleId: string,
    @Body() input: EnduranceTableInput, @Headers('idempotency-key') key: string | undefined, @Req() req: FoundationRequest) {
    const { gender, gradeGroup, runType, expectedVersion } = input;
    return this.service.mutate(principal, { gender, gradeGroup, runType }, { action: 'delete', ruleId, expectedVersion }, req.requestId, key);
  }
}
