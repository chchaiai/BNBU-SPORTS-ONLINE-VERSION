import { Injectable } from '@nestjs/common';
import { requireUnsettledCourse } from '../../v8/v81-settlement-write-guard.js';
import type { IncomingMessage } from 'node:http';

import { AuditService } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { pagedResult, type PagedResult } from '../../../common/http/envelope.interceptor.js';
import type { AuthenticatedPrincipal } from '../../../common/http/request-context.js';
import {
  IdempotencyService,
  type IdempotencyStageReservation,
} from '../../../common/idempotency/idempotency.service.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import {
  OBJECT_STORAGE_PORT,
  type ObjectStoragePort,
} from '../../../common/object-storage/object-storage.port.js';
import { ScopedCursorService } from '../../../common/pagination/scoped-cursor.service.js';
import { RosterCsvParserService } from '../../../common/roster-ingestion/roster-csv-parser.service.js';
import { RosterMultipartUploadService } from '../../../common/roster-ingestion/roster-multipart-upload.service.js';
import type {
  ParsedRosterCsv,
  ReceivedRosterUpload,
  RosterFieldMappingSnapshot,
} from '../../../common/roster-ingestion/roster-ingestion.types.js';
import { SecureDigestService } from '../../../common/security/secure-digest.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { Inject } from '@nestjs/common';
import { Prisma, type OfficialRosterImport } from '../../../generated/prisma/client.js';
import type {
  RollbackRosterImportRequestDto,
  RosterEntryListQueryDto,
  RosterImportListQueryDto,
} from '../interface/http/roster.dto.js';
import {
  projectRosterEntry,
  projectRosterImport,
  type OfficialRosterEntryProjection,
  type OfficialRosterImportProjection,
} from './roster-projection.js';

interface MutationFacts {
  requestId: string;
  idempotencyKey: string | undefined;
}

interface RosterImportStage {
  sourceFormat: string;
  sourceSheet: string | null;
  fileChecksumSha256: string;
  rosterImportId: string;
  sourceFileStorageKey: string;
  fieldMappingSnapshot: RosterFieldMappingSnapshot;
}

@Injectable()
export class RosterImportsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly idempotency: IdempotencyService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly cursors: ScopedCursorService,
    private readonly digest: SecureDigestService,
    private readonly clock: Clock,
    private readonly ids: IdGenerator,
    private readonly uploads: RosterMultipartUploadService,
    private readonly csv: RosterCsvParserService,
    @Inject(OBJECT_STORAGE_PORT) private readonly objectStorage: ObjectStoragePort,
  ) {}

  async create(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
    request: IncomingMessage,
    facts: MutationFacts,
  ): Promise<OfficialRosterImportProjection> {
    this.assertTeacher(principal);
    await this.assertTeacherSection(principal, classSectionId);
    let upload: ReceivedRosterUpload;
    try {
      upload = await this.uploads.receive(request, {
        organizationId: principal.organizationId,
        classSectionId,
      });
    } catch (error) {
      throw error;
    }
    const idempotencyInput = {
      organizationId: principal.organizationId,
      principalId: principal.userId,
      authSessionId: principal.sessionId,
      operationId: 'createRosterImport',
      scope: `${principal.organizationId}:${classSectionId}`,
      key: facts.idempotencyKey,
      request: {
        classSectionId,
        source: upload.source,
        fileFormat: upload.fileFormat,
        sourceSheet: upload.sourceSheet ?? null,
        fileChecksumSha256: upload.fileChecksumSha256,
        fieldMappingSnapshot: upload.fieldMappingSnapshot,
      },
      requestId: facts.requestId,
    };
    let reservation: IdempotencyStageReservation<RosterImportStage, OfficialRosterImportProjection>;
    try {
      reservation = await this.idempotency.reserveStage<
        RosterImportStage,
        OfficialRosterImportProjection
      >(idempotencyInput, async (transaction, context) => {
        if (context.isRecovery) {
          if (context.resourceType !== 'OFFICIAL_ROSTER_IMPORT' || context.resourceId === null) {
            return this.idempotency.failure(
              new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
                invariant: 'ROSTER_IMPORT_STAGE_REFERENCE_REQUIRED',
              }),
            );
          }
          const staged = await transaction.officialRosterImport.findFirst({
            where: {
              id: context.resourceId,
              organizationId: principal.organizationId,
              classSectionId,
              status: 'RECEIVED',
            },
            select: {
              id: true,
              sourceFileStorageKey: true,
              fieldMappingSnapshot: true,
              sourceFormat: true,
              sourceSheet: true,
              fileChecksumSha256: true,
            },
          });
          if (!staged?.sourceFileStorageKey || !staged.fileChecksumSha256) {
            return this.idempotency.failure(
              new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
                invariant: 'ROSTER_IMPORT_RECOVERABLE_STAGE_REQUIRED',
              }),
            );
          }
          return this.idempotency.stage(
            {
              rosterImportId: staged.id,
              sourceFormat: staged.sourceFormat ?? 'CSV',
              sourceSheet: staged.sourceSheet,
              fileChecksumSha256: staged.fileChecksumSha256,
              sourceFileStorageKey: staged.sourceFileStorageKey,
              fieldMappingSnapshot:
                staged.fieldMappingSnapshot as unknown as RosterFieldMappingSnapshot,
            },
            {
              principalId: principal.userId,
              authSessionId: principal.sessionId,
              resourceType: 'OFFICIAL_ROSTER_IMPORT',
              resourceId: staged.id,
            },
          );
        }

        await transaction.$queryRaw`SELECT id FROM organizations WHERE id=${principal.organizationId}::uuid FOR NO KEY UPDATE`;
        await transaction.$queryRaw`SELECT id FROM class_sections
          WHERE id=${classSectionId}::uuid AND organization_id=${principal.organizationId}::uuid FOR UPDATE`;
        const section = await transaction.classSection.findFirst({
          where: { id: classSectionId, organizationId: principal.organizationId },
          select: { status: true, closedAt: true, teacher: { select: { userId: true } } },
        });
        if (section?.teacher.userId !== principal.userId) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
          );
        }
        await requireUnsettledCourse(transaction, principal.organizationId, classSectionId);
        if (section.status === 'CLOSED' || section.closedAt !== null) {
          return this.idempotency.failure(new ApplicationError('CONFLICT_STATE_TRANSITION', 409));
        }
        const duplicate = await transaction.officialRosterImport.findFirst({
          where: {
            organizationId: principal.organizationId,
            classSectionId,
            fileChecksumSha256: upload.fileChecksumSha256,
          },
          select: { id: true },
        });
        if (duplicate !== null) {
          return this.idempotency.failure(
            new ApplicationError('ROSTER_IMPORT_DUPLICATE', 409, {
              rosterImportId: duplicate.id,
            }),
          );
        }
        const latest = await transaction.officialRosterImport.findFirst({
          where: { classSectionId },
          orderBy: { versionNumber: 'desc' },
          select: { versionNumber: true },
        });
        const now = this.clock.now();
        const importId = this.ids.next();
        await transaction.officialRosterImport.create({
          data: {
            id: importId,
            organizationId: principal.organizationId,
            classSectionId,
            versionNumber: (latest?.versionNumber ?? 0) + 1,
            source: 'FILE',
            fileName: upload.sanitizedOriginalFileName,
            sourceFormat: upload.fileFormat,
            sourceSheet: upload.sourceSheet ?? null,
            sourceFileStorageKey: upload.sourceFileStorageKey,
            fileChecksumSha256: upload.fileChecksumSha256,
            fieldMappingSnapshot: upload.fieldMappingSnapshot as unknown as Prisma.InputJsonValue,
            status: 'RECEIVED',
            importedBy: principal.userId,
            importedAt: now,
            isCurrent: false,
            createdAt: now,
            version: 1,
          },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'OFFICIAL_ROSTER_IMPORT',
          aggregateId: importId,
          eventType: 'ROSTER_IMPORT_RECEIVED_V1',
          eventVersion: 1,
          payload: {
            rosterImportId: importId,
            classSectionId,
            requestId: facts.requestId,
          },
        });
        return this.idempotency.stage(
          {
            rosterImportId: importId,
            sourceFileStorageKey: upload.sourceFileStorageKey,
            sourceFormat: upload.fileFormat,
            sourceSheet: upload.sourceSheet ?? null,
            fileChecksumSha256: upload.fileChecksumSha256,
            fieldMappingSnapshot: upload.fieldMappingSnapshot,
          },
          {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
            resourceType: 'OFFICIAL_ROSTER_IMPORT',
            resourceId: importId,
          },
        );
      });
    } catch (error) {
      await this.discardUploadedObjectUnlessRetained(principal, classSectionId, upload);
      throw error;
    }

    if (reservation.kind === 'REPLAY') {
      await this.discardUploadedObjectUnlessRetained(principal, classSectionId, upload);
      return reservation.value;
    }
    if (reservation.value.sourceFileStorageKey !== upload.sourceFileStorageKey) {
      await this.objectStorage
        .deletePrivateObject(upload.sourceFileStorageKey)
        .catch(() => undefined);
    }

    let parsed: ParsedRosterCsv | null = null;
    let failureCategory: string | null = null;
    try {
      parsed = reservation.value.sourceFormat === 'XLSX' ? await this.csv.parseStoredXlsx({
        sourceFileStorageKey: reservation.value.sourceFileStorageKey,
        expectedSha256: reservation.value.fileChecksumSha256,
        sheetName: reservation.value.sourceSheet ?? '',
        fieldMappingSnapshot: reservation.value.fieldMappingSnapshot,
      }) : await this.csv.parseStoredCsv({
        sourceFileStorageKey: reservation.value.sourceFileStorageKey,
        fieldMappingSnapshot: reservation.value.fieldMappingSnapshot,
      });
    } catch (error) {
      // Only deterministic source/schema rejection is a terminal Import failure. Storage or
      // unexpected runtime failures leave the committed RECEIVED stage recoverable after its
      // idempotency lease expires instead of permanently converting infrastructure failure to 422.
      const deterministicXlsx = error instanceof Error && /^(ROSTER_XLSX_|XLSX_ARCHIVE_)/.test(error.message)
        && !/(BUSY|TIMEOUT|WORKER)/.test(error.message);
      if (!deterministicXlsx && (!(error instanceof ApplicationError) || error.code !== 'ROSTER_SCHEMA_INVALID')) {
        throw error;
      }
      failureCategory = 'ROSTER_SCHEMA_INVALID';
    }

    return this.idempotency.completeStage(reservation, async (transaction) => {
      const staged = await transaction.officialRosterImport.findFirst({
        where: {
          id: reservation.value.rosterImportId,
          organizationId: principal.organizationId,
          classSectionId,
          status: 'RECEIVED',
        },
      });
      if (staged === null) {
        return this.idempotency.failure(
          new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
            invariant: 'ROSTER_IMPORT_RECEIVED_STAGE_REQUIRED',
          }),
        );
      }
      const now = this.clock.now();
      await transaction.officialRosterImport.update({
        where: { id: staged.id },
        data: { status: 'VALIDATING', version: { increment: 1 } },
      });
      if (parsed !== null && parsed.rows.length > 0) {
        await transaction.officialRosterEntry.createMany({
          data: parsed.rows.map((row) => ({
            id: this.ids.next(),
            organizationId: principal.organizationId,
            rosterImportId: staged.id,
            classSectionId,
            sourceRowNumber: row.sourceRowNumber,
            normalizedStudentNumber: row.normalizedStudentNumber,
            rawStudentNumberSafe: row.rawStudentNumberSafe,
            fullName: row.fullName,
            gender: row.gender,
            gradeYear: row.gradeYear,
            collegeName: row.collegeName,
            majorName: row.majorName,
            administrativeClassName: row.administrativeClassName,
            rowValidationStatus: row.rowValidationStatus,
            rowErrorCodes: row.rowErrorCodes,
            rawRowSnapshotSafe: row.rawRowSnapshotSafe,
            createdAt: now,
          })),
        });
      }
      const failed = failureCategory !== null || parsed === null || parsed.invalidRowCount > 0
        || parsed.validRowCount + parsed.duplicatedRowCount === 0;
      if (!failed) {
        await transaction.officialRosterImport.updateMany({
          where: { classSectionId, isCurrent: true },
          data: { isCurrent: false, supersededAt: now, version: { increment: 1 } },
        });
        await transaction.rosterAlignmentRun.updateMany({
          where: { classSectionId, isCurrent: true },
          data: { isCurrent: false },
        });
        await transaction.rosterAlignmentResult.updateMany({
          where: { classSectionId, supersededAt: null },
          data: { supersededAt: now },
        });
      }
      const completed = await transaction.officialRosterImport.update({
        where: { id: staged.id },
        data: {
          status: failed ? 'FAILED' : 'VALIDATED',
          totalRowCount: parsed?.totalRowCount ?? 0,
          validRowCount: parsed?.validRowCount ?? 0,
          invalidRowCount: parsed?.invalidRowCount ?? 0,
          duplicatedRowCount: parsed?.duplicatedRowCount ?? 0,
          failureCode: failed ? 'ROSTER_IMPORT_FAILED' : null,
          failureDetailsSafe: failed
            ? { category: failureCategory ?? (parsed && parsed.invalidRowCount > 0 ? 'INVALID_ROWS' : 'NO_VALID_ROWS') }
            : Prisma.DbNull,
          isCurrent: !failed,
          supersededAt: null,
          version: { increment: 1 },
        },
      });
      await this.outbox.append(transaction, {
        organizationId: principal.organizationId,
        aggregateType: 'OFFICIAL_ROSTER_IMPORT',
        aggregateId: completed.id,
        eventType: failed ? 'ROSTER_IMPORT_FAILED_V1' : 'ROSTER_IMPORT_VALIDATED_V1',
        eventVersion: completed.version,
        payload: {
          rosterImportId: completed.id,
          classSectionId,
          versionNumber: completed.versionNumber,
          status: completed.status,
          requestId: facts.requestId,
        },
      });
      if (!failed) {
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'ROSTER-IMPORT-CREATE',
          actionType: 'ROSTER_IMPORTED',
          targetType: 'OFFICIAL_ROSTER_IMPORT',
          targetId: completed.id,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: {
            classSectionId,
            versionNumber: completed.versionNumber,
            totalRowCount: completed.totalRowCount,
            validRowCount: completed.validRowCount,
            invalidRowCount: completed.invalidRowCount,
            duplicatedRowCount: completed.duplicatedRowCount,
          },
        });
      }
      if (failed) {
        return this.idempotency.failure(
          new ApplicationError('ROSTER_IMPORT_FAILED', 422, {
            rosterImportId: completed.id,
            failureCode: completed.failureCode,
          }),
          {
            principalId: principal.userId,
            authSessionId: principal.sessionId,
          },
        );
      }
      return this.idempotency.success(projectRosterImport(completed), {
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        resourceType: 'OFFICIAL_ROSTER_IMPORT',
        resourceId: completed.id,
      });
    });
  }

  private async discardUploadedObjectUnlessRetained(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
    upload: ReceivedRosterUpload,
  ): Promise<void> {
    let retainedStorageKey: string | null;
    try {
      retainedStorageKey =
        (
          await this.prisma.officialRosterImport.findFirst({
            where: {
              organizationId: principal.organizationId,
              classSectionId,
              fileChecksumSha256: upload.fileChecksumSha256,
            },
            select: { sourceFileStorageKey: true },
          })
        )?.sourceFileStorageKey ?? null;
    } catch {
      // Fail closed when persistence cannot prove that the uploaded object is disposable.
      return;
    }
    if (retainedStorageKey === upload.sourceFileStorageKey) return;
    await this.objectStorage
      .deletePrivateObject(upload.sourceFileStorageKey)
      .catch(() => undefined);
  }

  async list(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
    input: RosterImportListQueryDto,
  ): Promise<PagedResult<OfficialRosterImportProjection>> {
    await this.assertReadSection(principal, classSectionId);
    const ascending = input.sort === 'versionNumber';
    const binding = {
      resource: 'OFFICIAL_ROSTER_IMPORT' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: { classSectionId, status: input.status ?? null },
      sort: ascending ? 'versionNumber' : '-versionNumber',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const version = position === null ? null : Number.parseInt(position.value, 10);
    if (position !== null && !Number.isSafeInteger(version)) this.invalidCursor();
    const items = await this.prisma.officialRosterImport.findMany({
      where: {
        organizationId: principal.organizationId,
        classSectionId,
        ...(input.status === undefined ? {} : { status: input.status }),
        ...(position === null
          ? {}
          : {
              OR: [
                { versionNumber: ascending ? { gt: version! } : { lt: version! } },
                {
                  versionNumber: version!,
                  id: ascending ? { gt: position.id } : { lt: position.id },
                },
              ],
            }),
      },
      orderBy: [{ versionNumber: ascending ? 'asc' : 'desc' }, { id: ascending ? 'asc' : 'desc' }],
      take: input.limit + 1,
    });
    const page = items.slice(0, input.limit);
    const last = page.at(-1);
    return pagedResult(page.map(projectRosterImport), {
      nextCursor:
        items.length > input.limit && last !== undefined
          ? this.cursors.encode(binding, { value: String(last.versionNumber), id: last.id })
          : null,
      hasMore: items.length > input.limit,
      limit: input.limit,
    });
  }

  async getCurrent(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
  ): Promise<OfficialRosterImportProjection> {
    await this.assertReadSection(principal, classSectionId);
    const current = await this.prisma.officialRosterImport.findFirst({
      where: { organizationId: principal.organizationId, classSectionId, isCurrent: true },
    });
    if (current === null) throw new ApplicationError('ROSTER_IMPORT_NOT_FOUND', 404);
    return projectRosterImport(current);
  }

  async get(
    principal: AuthenticatedPrincipal,
    rosterImportId: string,
  ): Promise<OfficialRosterImportProjection> {
    const record = await this.requiredImport(principal.organizationId, rosterImportId);
    await this.assertReadSection(principal, record.classSectionId);
    return projectRosterImport(record);
  }

  async listEntries(
    principal: AuthenticatedPrincipal,
    rosterImportId: string,
    input: RosterEntryListQueryDto,
  ): Promise<PagedResult<OfficialRosterEntryProjection>> {
    const rosterImport = await this.requiredImport(principal.organizationId, rosterImportId);
    await this.assertReadSection(principal, rosterImport.classSectionId);
    if (principal.role === 'ADMIN' && input.q !== undefined) {
      throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
    }
    const ascending = input.sort !== '-sourceRowNumber';
    const search = input.q?.trim();
    const binding = {
      resource: 'OFFICIAL_ROSTER_ENTRY' as const,
      organizationId: principal.organizationId,
      principalId: principal.userId,
      role: principal.role,
      filters: {
        rosterImportId,
        rowValidationStatus: input.rowValidationStatus ?? null,
        search: search ?? null,
      },
      sort: ascending ? 'sourceRowNumber' : '-sourceRowNumber',
      limit: input.limit,
    };
    const position = this.cursors.decode(input.cursor, binding);
    const rowNumber = position === null ? null : Number.parseInt(position.value, 10);
    if (position !== null && !Number.isSafeInteger(rowNumber)) this.invalidCursor();
    const items = await this.prisma.officialRosterEntry.findMany({
      where: {
        organizationId: principal.organizationId,
        rosterImportId,
        ...(input.rowValidationStatus === undefined
          ? {}
          : { rowValidationStatus: input.rowValidationStatus }),
        ...(search === undefined || search.length === 0
          ? {}
          : {
              OR: [
                { normalizedStudentNumber: { contains: search.toUpperCase() } },
                { fullName: { contains: search, mode: 'insensitive' as const } },
              ],
            }),
        ...(position === null
          ? {}
          : {
              OR: [
                { sourceRowNumber: ascending ? { gt: rowNumber! } : { lt: rowNumber! } },
                {
                  sourceRowNumber: rowNumber!,
                  id: ascending ? { gt: position.id } : { lt: position.id },
                },
              ],
            }),
      },
      orderBy: [
        { sourceRowNumber: ascending ? 'asc' : 'desc' },
        { id: ascending ? 'asc' : 'desc' },
      ],
      take: input.limit + 1,
    });
    const page = items.slice(0, input.limit);
    const last = page.at(-1);
    return pagedResult(
      page.map((entry) => projectRosterEntry(entry, principal.role)),
      {
        nextCursor:
          items.length > input.limit && last !== undefined
            ? this.cursors.encode(binding, { value: String(last.sourceRowNumber), id: last.id })
            : null,
        hasMore: items.length > input.limit,
        limit: input.limit,
      },
    );
  }

  async rollback(
    principal: AuthenticatedPrincipal,
    rosterImportId: string,
    input: RollbackRosterImportRequestDto,
    facts: MutationFacts,
  ): Promise<OfficialRosterImportProjection> {
    this.assertTeacher(principal);
    const reason = input.reason.trim();
    if (reason.length === 0) {
      throw new ApplicationError('VALIDATION_FAILED', 422, {
        fieldErrors: [
          {
            field: 'reason',
            code: 'INVALID',
            i18nKey: 'error.validation.failed',
            params: {},
          },
        ],
      });
    }
    return this.idempotency.execute(
      {
        organizationId: principal.organizationId,
        principalId: principal.userId,
        authSessionId: principal.sessionId,
        operationId: 'rollbackRosterImport',
        scope: `${principal.organizationId}:${rosterImportId}`,
        key: facts.idempotencyKey,
        request: {
          rosterImportId,
          expectedCurrentRosterImportId: input.expectedCurrentRosterImportId,
          expectedVersion: input.expectedVersion,
          reason,
        },
        requestId: facts.requestId,
      },
      async (transaction) => {
        const target = await transaction.officialRosterImport.findFirst({
          where: { id: rosterImportId, organizationId: principal.organizationId },
        });
        if (target === null) {
          return this.idempotency.failure(new ApplicationError('ROSTER_IMPORT_NOT_FOUND', 404));
        }
        const section = await transaction.classSection.findFirst({
          where: { id: target.classSectionId, organizationId: principal.organizationId },
          select: { teacher: { select: { userId: true } } },
        });
        if (section?.teacher.userId !== principal.userId) {
          return this.idempotency.failure(
            new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404),
          );
        }
        if (target.status !== 'VALIDATED') {
          return this.idempotency.failure(new ApplicationError('ROSTER_IMPORT_NOT_READY', 409));
        }
        const current = await transaction.officialRosterImport.findFirst({
          where: {
            organizationId: principal.organizationId,
            classSectionId: target.classSectionId,
            isCurrent: true,
          },
        });
        if (
          current?.id !== input.expectedCurrentRosterImportId ||
          current?.version !== input.expectedVersion
        ) {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_VERSION_MISMATCH', 409, {
              expectedVersion: input.expectedVersion,
              currentVersion: current?.version ?? null,
            }),
          );
        }
        if (current.id === target.id) {
          return this.idempotency.failure(
            new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409),
          );
        }
        const now = this.clock.now();
        await transaction.officialRosterImport.update({
          where: { id: current.id },
          data: { isCurrent: false, supersededAt: now, version: { increment: 1 } },
        });
        const next = await transaction.officialRosterImport.update({
          where: { id: target.id },
          data: { isCurrent: true, supersededAt: null, version: { increment: 1 } },
        });
        await transaction.rosterAlignmentRun.updateMany({
          where: { classSectionId: target.classSectionId, isCurrent: true },
          data: { isCurrent: false },
        });
        await transaction.rosterAlignmentResult.updateMany({
          where: { classSectionId: target.classSectionId, supersededAt: null },
          data: { supersededAt: now },
        });
        await this.audit.append(transaction, {
          organizationId: principal.organizationId,
          actorUserId: principal.userId,
          actorRoleSnapshot: principal.role,
          permissionId: 'ROSTER-IMPORT-ROLLBACK',
          actionType: 'ROSTER_VERSION_ROLLED_BACK',
          targetType: 'OFFICIAL_ROSTER_IMPORT',
          targetId: next.id,
          requestId: facts.requestId,
          idempotencyKeyReference: this.keyReference(facts.idempotencyKey),
          outcome: 'SUCCEEDED',
          safeMetadata: {
            classSectionId: next.classSectionId,
            previousRosterImportId: current.id,
            currentRosterImportId: next.id,
          },
        });
        await this.outbox.append(transaction, {
          organizationId: principal.organizationId,
          aggregateType: 'OFFICIAL_ROSTER_IMPORT',
          aggregateId: next.id,
          eventType: 'ROSTER_VERSION_ROLLED_BACK_V1',
          eventVersion: next.version,
          payload: {
            rosterImportId: next.id,
            classSectionId: next.classSectionId,
            requiresAlignment: true,
            requestId: facts.requestId,
          },
        });
        return this.idempotency.success(projectRosterImport(next), {
          principalId: principal.userId,
          authSessionId: principal.sessionId,
          resourceType: 'OFFICIAL_ROSTER_IMPORT',
          resourceId: next.id,
        });
      },
    );
  }

  private async requiredImport(
    organizationId: string,
    rosterImportId: string,
  ): Promise<OfficialRosterImport> {
    const record = await this.prisma.officialRosterImport.findFirst({
      where: { id: rosterImportId, organizationId },
    });
    if (record === null) throw new ApplicationError('ROSTER_IMPORT_NOT_FOUND', 404);
    return record;
  }

  private async assertReadSection(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
  ): Promise<void> {
    if (principal.role === 'STUDENT') this.scopeDenied();
    const section = await this.prisma.classSection.findFirst({
      where: { id: classSectionId, organizationId: principal.organizationId },
      select: { teacher: { select: { userId: true } } },
    });
    if (section === null) throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    if (principal.role === 'TEACHER' && section.teacher.userId !== principal.userId) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
  }

  private async assertTeacherSection(
    principal: AuthenticatedPrincipal,
    classSectionId: string,
  ): Promise<void> {
    this.assertTeacher(principal);
    const section = await this.prisma.classSection.findFirst({
      where: { id: classSectionId, organizationId: principal.organizationId },
      select: { teacher: { select: { userId: true } } },
    });
    if (section?.teacher.userId !== principal.userId) {
      throw new ApplicationError('PERMISSION_RESOURCE_NOT_FOUND', 404);
    }
  }

  private assertTeacher(principal: AuthenticatedPrincipal): void {
    if (principal.role !== 'TEACHER') this.scopeDenied();
  }

  private keyReference(key: string | undefined): string | null {
    return key === undefined ? null : this.digest.digest('idempotency-key-reference', key);
  }

  private invalidCursor(): never {
    throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
  }

  private scopeDenied(): never {
    throw new ApplicationError('PERMISSION_RESOURCE_SCOPE_DENIED', 403);
  }
}
