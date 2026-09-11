import { requireUnsettledCourse } from './v81-settlement-write-guard.js';
import { Body, Controller, Get, Header, Headers, Inject, Injectable, Param, ParseUUIDPipe, Post, Req } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { OBJECT_STORAGE_PORT, type ObjectStoragePort } from '../../common/object-storage/object-storage.port.js';
import { IsInt, Max, Min } from 'class-validator';
import { PrismaService } from '../../common/database/prisma.service.js';
import { ApplicationError } from '../../common/errors/application-error.js';
import { IdempotencyService } from '../../common/idempotency/idempotency.service.js';
import { Clock } from '../../common/time/clock.js';
import { IdGenerator } from '../../common/time/id-generator.js';
import { CurrentPrincipal } from '../../common/policy/principal.decorator.js';
import { OperationPolicy } from '../../common/policy/operation-policy.decorator.js';
import type { AuthenticatedPrincipal, FoundationRequest } from '../../common/http/request-context.js';
export class RosterConfirmationInput { @IsInt() @Min(1) @Max(2147483647) expectedVersion!: number; }
type ConfirmedRoster = { id: string; classSectionId: string; rosterImportId: string; sourceVersion: number;
  sourceSha256: string; sourceRows: unknown[]; version: number; actorId: string; confirmedAt: Date };
@Injectable()
export class V81RosterConfirmationService {
  constructor(private readonly prisma: PrismaService, private readonly idempotency: IdempotencyService,
    private readonly clock: Clock, private readonly ids: IdGenerator,
    @Inject(OBJECT_STORAGE_PORT) private readonly storage: ObjectStoragePort) {}
  private async scoped(principal: AuthenticatedPrincipal, importId: string) {
    if (principal.role !== 'TEACHER') throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    const source = await this.prisma.officialRosterImport.findFirst({ where: { id: importId, organizationId: principal.organizationId,
      classSection: { teacher: { userId: principal.userId } } } });
    if (!source) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return source;
  }
  async get(principal: AuthenticatedPrincipal, importId: string) {
    await this.scoped(principal, importId);
    const rows = await this.prisma.$queryRaw<ConfirmedRoster[]>`SELECT id,class_section_id AS "classSectionId",roster_import_id AS "rosterImportId",
      source_version AS "sourceVersion",source_sha256 AS "sourceSha256",source_rows AS "sourceRows",version,actor_id AS "actorId",confirmed_at AS "confirmedAt"
      FROM v81_confirmed_rosters WHERE roster_import_id=${importId}::uuid AND organization_id=${principal.organizationId}::uuid`;
    if (!rows[0]) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    return { ...rows[0], confirmedAt: rows[0].confirmedAt.toISOString() };
  }
  async source(principal: AuthenticatedPrincipal, importId: string) {
    const source = await this.scoped(principal, importId);
    if (source.source !== 'FILE' || !source.sourceFileStorageKey || !source.fileChecksumSha256 || !source.fileName)
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    const stream = await this.storage.getPrivateObject(source.sourceFileStorageKey);
    const chunks: Buffer[] = [];
    const digest = createHash('sha256');
    let size = 0;
    for await (const chunk of stream) {
      const bytes = Buffer.from(chunk as Uint8Array);
      size += bytes.length;
      if (size > 100 * 1024 * 1024) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
      digest.update(bytes); chunks.push(bytes);
    }
    if (digest.digest('hex') !== source.fileChecksumSha256) throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500);
    return { rosterImportId: importId, fileName: source.fileName, fileFormat: source.sourceFormat ?? 'CSV',
      sheetName: source.sourceSheet, sourceSha256: source.fileChecksumSha256, fileSizeBytes: size,
      fileBase64: Buffer.concat(chunks).toString('base64') };
  }
  async confirm(principal: AuthenticatedPrincipal, importId: string, input: RosterConfirmationInput,
    facts: { requestId: string; idempotencyKey: string | undefined }) {
    await this.scoped(principal, importId);
    return this.idempotency.execute({ organizationId: principal.organizationId, principalId: principal.userId,
      authSessionId: principal.sessionId, operationId: 'confirmV81Roster', scope: importId, key: facts.idempotencyKey,
      requestId: facts.requestId, request: input }, async tx => {
      await tx.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
      const source = await tx.officialRosterImport.findFirst({ where: { id: importId, organizationId: principal.organizationId,
        classSection: { teacher: { userId: principal.userId } } }, include: { classSection: { include: { semester: true } } } });
      if (!source) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
      await requireUnsettledCourse(tx, principal.organizationId, source.classSectionId);
      if ((await tx.systemPolicy.findUnique({ where: { organizationId: principal.organizationId } }))?.systemMode !== 'NORMAL')
        throw new ApplicationError('SYSTEM_MAINTENANCE', 503);
      if (source.classSection.semester.status === 'ARCHIVED' || source.status !== 'VALIDATED' || !source.isCurrent)
        throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      if (source.classSection.status === 'CLOSED' && (!source.classSection.closedAt || source.createdAt > source.classSection.closedAt))
        throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      if (source.version !== input.expectedVersion) throw new ApplicationError('CONFLICT_VERSION_MISMATCH', 409);
      if (!source.fileChecksumSha256 || source.invalidRowCount || source.totalRowCount < 1 || source.totalRowCount > 500)
        throw new ApplicationError('VALIDATION_FAILED', 422);
      const existing = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_confirmed_rosters WHERE roster_import_id=${importId}::uuid`;
      if (existing.length) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409);
      const id = this.ids.next(), now = this.clock.now();
      const saved = await tx.$queryRaw<ConfirmedRoster[]>`INSERT INTO v81_confirmed_rosters
        (id,organization_id,class_section_id,roster_import_id,source_version,source_sha256,source_rows,version,actor_id,request_id,confirmed_at)
        SELECT ${id}::uuid,${principal.organizationId}::uuid,${source.classSectionId}::uuid,${importId}::uuid,
          ${source.version},${source.fileChecksumSha256},v81_roster_source_rows(${importId}::uuid),
          coalesce(max(version),0)+1,${principal.userId}::uuid,${facts.requestId},${now}
        FROM v81_confirmed_rosters WHERE class_section_id=${source.classSectionId}::uuid
        RETURNING id,class_section_id AS "classSectionId",roster_import_id AS "rosterImportId",source_version AS "sourceVersion",
          source_sha256 AS "sourceSha256",source_rows AS "sourceRows",version,actor_id AS "actorId",confirmed_at AS "confirmedAt"`;
      const result = saved[0]!;
      await tx.$executeRaw`INSERT INTO v81_events(id,organization_id,resource_type,resource_id,event_type,actor_id,request_id,version,facts,occurred_at,event_outcome)
        VALUES(${this.ids.next()}::uuid,${principal.organizationId}::uuid,'ROSTER_CONFIRMATION',${id}::uuid,'CONFIRMED',
          ${principal.userId}::uuid,${facts.requestId},1,${JSON.stringify({ rosterImportId: importId, sourceVersion: source.version })}::jsonb,${now},'SUCCEEDED')`;
      return this.idempotency.success({ ...result, confirmedAt: result.confirmedAt.toISOString() });
    });
  }
}
@Controller('roster-imports/:rosterImportId/source')
export class V81RosterSourceController {
  constructor(private readonly service: V81RosterConfirmationService) {}
  @Get() @Header('Cache-Control', 'no-store') @OperationPolicy('getV81RosterSource')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal,
    @Param('rosterImportId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) {
    return this.service.source(principal, id);
  }
}
@Controller('roster-imports/:rosterImportId/confirmation')
export class V81RosterConfirmationController {
  constructor(private readonly service: V81RosterConfirmationService) {}
  @Get() @OperationPolicy('getV81RosterConfirmation')
  get(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('rosterImportId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string) {
    return this.service.get(principal, id);
  }
  @Post() @OperationPolicy('confirmV81Roster')
  confirm(@CurrentPrincipal() principal: AuthenticatedPrincipal, @Param('rosterImportId', new ParseUUIDPipe({ exceptionFactory: () => new ApplicationError('VALIDATION_FAILED', 422) })) id: string,
    @Body() input: RosterConfirmationInput, @Headers('idempotency-key') key: string | undefined, @Req() request: FoundationRequest) {
    return this.service.confirm(principal, id, input, { requestId: request.requestId, idempotencyKey: key });
  }
}
