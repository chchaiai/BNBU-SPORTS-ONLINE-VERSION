import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';

import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import type {
  AuthenticatedPrincipal,
  FoundationRequest,
  UserRole,
} from '../../src/common/http/request-context.js';
import { redactSensitive, REDACTED_VALUE } from '../../src/common/logging/redaction.js';
import { AccessPolicyGuard } from '../../src/common/policy/access-policy.guard.js';
import { OPERATION_ID_METADATA } from '../../src/common/policy/operation-policy.decorator.js';
import { RosterAlignmentService } from '../../src/modules/roster/application/roster-alignment.service.js';
import {
  projectAlignmentRun,
  projectAlignmentResult,
  projectRosterEntry,
} from '../../src/modules/roster/application/roster-projection.js';
import {
  ResolveRosterAlignmentRequestDto,
  RollbackRosterImportRequestDto,
  RosterAlignmentListQueryDto,
  VersionedRosterReasonRequestDto,
} from '../../src/modules/roster/interface/http/roster.dto.js';

function principal(role: UserRole): AuthenticatedPrincipal {
  return {
    userId: `${role.toLowerCase()}-user`,
    organizationId: 'organization-1',
    role,
    sessionId: `${role.toLowerCase()}-session`,
    tokenVersion: 0,
    jti: `${role.toLowerCase()}-jti`,
  };
}

function context(handler: () => void, request: Partial<FoundationRequest>): ExecutionContext {
  return {
    getHandler: () => handler,
    getClass: () => class RosterSecurityController {},
    switchToHttp: () => ({ getRequest: () => request }),
  } as unknown as ExecutionContext;
}

async function authorize(operationId: string, role: UserRole): Promise<boolean> {
  const handler = (): void => undefined;
  Reflect.defineMetadata(OPERATION_ID_METADATA, operationId, handler);
  return new AccessPolicyGuard(new Reflector()).canActivate(
    context(handler, { headers: {}, principal: principal(role) }),
  );
}

describe('Stage 13 roster security boundaries', () => {
  it('parses explicit boolean query values and rejects whitespace-only mutation reasons', async () => {
    const defaultQuery = plainToInstance(RosterAlignmentListQueryDto, {});
    const historicalQuery = plainToInstance(RosterAlignmentListQueryDto, {
      currentOnly: 'false',
    });
    const currentQuery = plainToInstance(RosterAlignmentListQueryDto, { currentOnly: 'true' });
    const invalidQuery = plainToInstance(RosterAlignmentListQueryDto, { currentOnly: '0' });

    assert.equal(defaultQuery.currentOnly, true);
    assert.equal(historicalQuery.currentOnly, false);
    assert.equal(currentQuery.currentOnly, true);
    assert.equal((await validate(historicalQuery)).length, 0);
    assert.ok((await validate(invalidQuery)).length > 0);

    const whitespaceInputs = [
      plainToInstance(VersionedRosterReasonRequestDto, {
        reason: ' \t\r\n ',
        expectedVersion: 1,
      }),
      plainToInstance(RollbackRosterImportRequestDto, {
        expectedCurrentRosterImportId: '0197d460-a737-7b2e-8cec-a3c9a41337b4',
        expectedVersion: 1,
        reason: ' \t\r\n ',
      }),
      plainToInstance(ResolveRosterAlignmentRequestDto, {
        resolutionNote: ' \t\r\n ',
        evidenceType: 'ENROLLMENT_STATUS_EVENT',
        evidenceReferenceId: '0197d460-a737-7b2e-8cec-a3c9a41337b4',
        expectedVersion: 1,
      }),
    ];
    for (const input of whitespaceInputs) assert.ok((await validate(input)).length > 0);
  });

  it('allows ADMIN only on governance reads, TEACHER on owned-scope operations, and no STUDENT', async () => {
    const reads = [
      'listRosterImports',
      'getCurrentRosterImport',
      'getRosterImport',
      'listRosterEntries',
      'listRosterAlignmentResults',
      'getRosterAlignmentResult',
    ];
    const mutations = [
      'createRosterImport',
      'rollbackRosterImport',
      'alignRosterImport',
      'confirmRosterAlignmentResult',
      'resolveRosterAlignmentResult',
      'ignoreRosterAlignmentResult',
      'reopenRosterAlignmentResult',
    ];

    for (const operationId of reads) {
      assert.equal(await authorize(operationId, 'TEACHER'), true);
      assert.equal(await authorize(operationId, 'ADMIN'), true);
      await assert.rejects(
        authorize(operationId, 'STUDENT'),
        (error: unknown) =>
          error instanceof ApplicationError && error.code === 'PERMISSION_RESOURCE_SCOPE_DENIED',
      );
    }
    for (const operationId of mutations) {
      assert.equal(await authorize(operationId, 'TEACHER'), true);
      for (const role of ['ADMIN', 'STUDENT'] as const) {
        await assert.rejects(
          authorize(operationId, role),
          (error: unknown) =>
            error instanceof ApplicationError && error.code === 'PERMISSION_RESOURCE_SCOPE_DENIED',
        );
      }
    }
  });

  it('returns role-specific projections without raw rows, storage data, or ADMIN identity values', () => {
    const runRecord = {
      id: 'run-1',
      organizationId: 'organization-1',
      classSectionId: 'section-1',
      rosterImportId: 'import-1',
      comparisonRevision: 1,
      algorithmVersion: 'ROSTER_ALIGNMENT_V1',
      platformSnapshotFingerprint: 'a'.repeat(64),
      platformSnapshotAt: new Date('2026-08-04T00:00:00.000Z'),
      status: 'COMPLETED',
      startedBy: 'teacher-user',
      startedAt: new Date('2026-08-04T00:00:00.000Z'),
      completedAt: new Date('2026-08-04T00:00:01.000Z'),
      failureCode: null,
      resultCount: 1,
      isCurrent: true,
      semesterId: 'must-not-leak',
      failureDetailsSafe: { internalCategory: 'must-not-leak' },
      version: 1,
      createdAt: new Date('2026-08-04T00:00:00.000Z'),
    };
    const run = projectAlignmentRun(runRecord);
    assert.deepEqual(Object.keys(run), [
      'id',
      'organizationId',
      'classSectionId',
      'rosterImportId',
      'comparisonRevision',
      'algorithmVersion',
      'platformSnapshotFingerprint',
      'platformSnapshotAt',
      'status',
      'startedBy',
      'startedAt',
      'completedAt',
      'failureCode',
      'resultCount',
      'isCurrent',
    ]);
    assert.equal(Object.hasOwn(run, 'semesterId'), false);
    assert.equal(Object.hasOwn(run, 'failureDetailsSafe'), false);

    const entry = {
      id: 'entry-1',
      organizationId: 'organization-1',
      rosterImportId: 'import-1',
      classSectionId: 'section-1',
      normalizedStudentNumber: '00001234',
      fullName: 'Synthetic Student',
      gender: 'OTHER',
      gradeYear: 2026,
      collegeName: 'Synthetic College',
      majorName: 'Synthetic Major',
      administrativeClassName: 'Synthetic Class',
      sourceRowNumber: 2,
      rowValidationStatus: 'VALID',
      rowErrorCodes: [],
      rawStudentNumberSafe: '00001234',
      rawRowSnapshotSafe: { studentNumber: '00001234' },
      sourceFileStorageKey: 'private/roster.csv',
    };
    const teacherEntry = projectRosterEntry(entry, 'TEACHER');
    const adminEntry = projectRosterEntry(entry, 'ADMIN');
    assert.equal(teacherEntry.studentNumber, '00001234');
    assert.equal(teacherEntry.fullName, 'Synthetic Student');
    for (const field of [
      'studentNumber',
      'fullName',
      'gender',
      'gradeYear',
      'collegeName',
      'majorName',
      'administrativeClassName',
    ] as const) {
      assert.equal(adminEntry[field], null);
    }
    for (const projection of [teacherEntry, adminEntry]) {
      assert.equal(Object.hasOwn(projection, 'rawStudentNumberSafe'), false);
      assert.equal(Object.hasOwn(projection, 'rawRowSnapshotSafe'), false);
      assert.equal(Object.hasOwn(projection, 'sourceFileStorageKey'), false);
    }

    const result = {
      id: 'result-1',
      organizationId: 'organization-1',
      alignmentRunId: 'run-1',
      rosterImportId: 'import-1',
      classSectionId: 'section-1',
      subjectKey: 'a'.repeat(64),
      rosterEntryId: 'entry-1',
      enrollmentId: 'enrollment-1',
      studentId: 'student-1',
      comparisonRevision: 1,
      status: 'IDENTITY_CONFLICT',
      differences: [
        {
          field: 'FULL_NAME',
          officialValue: 'Official Name',
          platformValue: 'Platform Name',
        },
      ],
      resolutionStatus: 'CONFIRMED',
      lastResolutionAction: 'CONFIRM',
      resolutionNote: 'Synthetic resolution note',
      currentResolutionVersion: 1,
      supersededAt: null,
      createdAt: new Date('2026-08-04T00:00:00.000Z'),
      version: 2,
      rawRowSnapshotSafe: { fullName: 'Official Name' },
      sourceFileStorageKey: 'private/roster.csv',
    };
    const teacherResult = projectAlignmentResult(result, 'TEACHER');
    const adminResult = projectAlignmentResult(result, 'ADMIN');
    assert.equal(teacherResult.rosterEntryId, 'entry-1');
    assert.equal(teacherResult.differences[0]?.officialValue, 'Official Name');
    assert.equal(adminResult.rosterEntryId, null);
    assert.equal(adminResult.enrollmentId, null);
    assert.equal(adminResult.studentId, null);
    assert.equal(adminResult.resolutionNote, null);
    assert.deepEqual(adminResult.differences, [
      { field: 'FULL_NAME', officialValue: null, platformValue: null },
    ]);
    assert.equal(Object.hasOwn(teacherResult, 'rawRowSnapshotSafe'), false);
    assert.equal(Object.hasOwn(adminResult, 'sourceFileStorageKey'), false);

    const wrongCourseResult = projectAlignmentResult(
      { ...result, status: 'WRONG_COURSE' },
      'TEACHER',
    );
    assert.equal(wrongCourseResult.rosterEntryId, 'entry-1');
    assert.equal(wrongCourseResult.enrollmentId, null);
    assert.equal(wrongCourseResult.studentId, null);
  });

  it('redacts roster source facts and identity differences recursively', () => {
    const redacted = redactSensitive({
      sourceFileStorageKey: 'private/roster.csv',
      fileChecksumSha256: 'a'.repeat(64),
      fieldMappingSnapshot: { studentNumber: 'Student Number' },
      rawStudentNumberSafe: '00001234',
      normalizedStudentNumber: '00001234',
      rawRowSnapshotSafe: { fullName: 'Synthetic Student' },
      subjectKey: 'b'.repeat(64),
      differences: [
        { officialValue: 'Official Name', platformValue: 'Platform Name', field: 'FULL_NAME' },
      ],
      safeStatus: 'IDENTITY_CONFLICT',
    }) as Record<string, unknown>;
    for (const field of [
      'sourceFileStorageKey',
      'fileChecksumSha256',
      'fieldMappingSnapshot',
      'rawStudentNumberSafe',
      'normalizedStudentNumber',
      'rawRowSnapshotSafe',
      'subjectKey',
    ]) {
      assert.equal(redacted[field], REDACTED_VALUE);
    }
    const differences = redacted.differences as Record<string, unknown>[];
    assert.equal(differences[0]?.officialValue, REDACTED_VALUE);
    assert.equal(differences[0]?.platformValue, REDACTED_VALUE);
    assert.equal(differences[0]?.field, 'FULL_NAME');
    assert.equal(redacted.safeStatus, 'IDENTITY_CONFLICT');
  });

  it('implements ignore as a validated, scoped default deny with zero mutation side effects', async () => {
    const result = {
      id: 'result-1',
      organizationId: 'organization-1',
      classSectionId: 'section-1',
      supersededAt: null,
      version: 1,
      alignmentRun: { isCurrent: true },
    };
    let reads = 0;
    const writes: string[] = [];
    const forbiddenWrite = (name: string) => () => {
      writes.push(name);
      throw new Error(`Unexpected write: ${name}`);
    };
    const prisma = {
      rosterAlignmentResult: {
        findFirst: () => {
          reads += 1;
          return Promise.resolve(result);
        },
        create: forbiddenWrite('rosterAlignmentResult.create'),
        update: forbiddenWrite('rosterAlignmentResult.update'),
        updateMany: forbiddenWrite('rosterAlignmentResult.updateMany'),
      },
      classSection: {
        findFirst: () => {
          reads += 1;
          return Promise.resolve({ teacher: { userId: 'teacher-user' } });
        },
      },
      rosterResolutionEvent: { create: forbiddenWrite('rosterResolutionEvent.create') },
      idempotencyRecord: { create: forbiddenWrite('idempotencyRecord.create') },
      auditLog: { create: forbiddenWrite('auditLog.create') },
      outboxEvent: { create: forbiddenWrite('outboxEvent.create') },
      $transaction: forbiddenWrite('$transaction'),
    } as unknown as PrismaService;
    const idempotency = { execute: forbiddenWrite('idempotency.execute') };
    const audit = { append: forbiddenWrite('audit.append') };
    const outbox = { append: forbiddenWrite('outbox.append') };
    const service = new RosterAlignmentService(
      prisma,
      idempotency as never,
      audit as never,
      outbox as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );
    const before = JSON.stringify(result);

    await assert.rejects(
      service.ignore(
        principal('TEACHER'),
        'result-1',
        { reason: 'Cannot ignore', expectedVersion: 1 },
        'stage13-ignore-key',
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'ROSTER_IGNORE_NOT_ALLOWED',
    );
    assert.equal(reads, 2);
    assert.deepEqual(writes, []);
    assert.equal(JSON.stringify(result), before);

    const readsBeforeInvalidKey = reads;
    await assert.rejects(
      service.ignore(
        principal('TEACHER'),
        'result-1',
        { reason: 'Cannot ignore', expectedVersion: 1 },
        undefined,
      ),
      (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_FAILED',
    );
    assert.equal(reads, readsBeforeInvalidKey);
    assert.deepEqual(writes, []);
  });

  it('rejects whitespace-only resolution reasons before idempotency or database access', async () => {
    const calls: string[] = [];
    const forbidden = (name: string) => () => {
      calls.push(name);
      throw new Error(`Unexpected call: ${name}`);
    };
    const service = new RosterAlignmentService(
      {
        rosterAlignmentResult: { findFirst: forbidden('rosterAlignmentResult.findFirst') },
      } as unknown as PrismaService,
      { execute: forbidden('idempotency.execute') } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      service.confirm(
        principal('TEACHER'),
        'result-1',
        { reason: ' \t\r\n ', expectedVersion: 1 },
        { requestId: 'stage13-whitespace-confirm', idempotencyKey: 'stage13-whitespace-key' },
      ),
      (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_FAILED',
    );
    await assert.rejects(
      service.ignore(
        principal('TEACHER'),
        'result-1',
        { reason: ' \t\r\n ', expectedVersion: 1 },
        'stage13-whitespace-ignore-key',
      ),
      (error: unknown) => error instanceof ApplicationError && error.code === 'VALIDATION_FAILED',
    );
    assert.deepEqual(calls, []);
  });
});
