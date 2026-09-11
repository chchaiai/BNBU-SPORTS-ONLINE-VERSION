import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { ApplicationError } from '../../src/common/errors/application-error.js';
import type { AuthenticatedPrincipal } from '../../src/common/http/request-context.js';
import { Prisma } from '../../src/generated/prisma/client.js';
import { projectAlignmentRun } from '../../src/modules/roster/application/roster-projection.js';
import { RosterAlignmentService } from '../../src/modules/roster/application/roster-alignment.service.js';

const PRINCIPAL: AuthenticatedPrincipal = {
  userId: '00000000-0000-7000-8000-000000000005',
  organizationId: '00000000-0000-7000-8000-000000000002',
  role: 'TEACHER',
  sessionId: '00000000-0000-7000-8000-000000000010',
  tokenVersion: 0,
  jti: '00000000-0000-7000-8000-000000000011',
};

describe('Stage 13 alignment run lifecycle', () => {
  it('freezes a RUNNING revision before computation and persists FAILED plus outbox on a domain failure', async () => {
    const createdRuns: Record<string, unknown>[] = [];
    const updatedRuns: Record<string, unknown>[] = [];
    const outboxEvents: Record<string, unknown>[] = [];
    const entryQueries: Record<string, unknown>[] = [];
    const transaction = {
      officialRosterImport: {
        findFirst: () =>
          Promise.resolve({
            id: '00000000-0000-7000-8000-000000000001',
            organizationId: '00000000-0000-7000-8000-000000000002',
            classSectionId: '00000000-0000-7000-8000-000000000003',
            status: 'VALIDATED',
            isCurrent: true,
            validRowCount: 2,
            duplicatedRowCount: 0,
            version: 1,
          }),
      },
      classSection: {
        findFirst: () =>
          Promise.resolve({
            semesterId: '00000000-0000-7000-8000-000000000004',
            teacher: { userId: '00000000-0000-7000-8000-000000000005' },
          }),
      },
      officialRosterEntry: {
        findMany: (query: Record<string, unknown>) => {
          entryQueries.push(query);
          return Promise.resolve([
            {
              id: '00000000-0000-7000-8000-000000000006',
              // Inject malformed adapter data; official duplicates are valid V8.1 input.
              normalizedStudentNumber: 1234,
              fullName: 'Synthetic One',
              gender: 'OTHER',
              gradeYear: 2026,
            },
            {
              id: '00000000-0000-7000-8000-000000000007',
              normalizedStudentNumber: '0001',
              fullName: 'Synthetic Duplicate',
              gender: 'OTHER',
              gradeYear: 2026,
            },
          ]);
        },
      },
      enrollment: { findMany: () => Promise.resolve([]) },
      rosterAlignmentRun: {
        findFirst: (query: { where: { status?: string } }) =>
          Promise.resolve(query.where.status === 'RUNNING' ? null : { comparisonRevision: 0 }),
        create: ({ data }: { data: Record<string, unknown> }) => {
          createdRuns.push(data);
          return Promise.resolve(data);
        },
        update: ({ data }: { data: Record<string, unknown> }) => {
          updatedRuns.push(data);
          return Promise.resolve(data);
        },
      },
      rosterAlignmentPlatformEntry: { createMany: () => Promise.resolve({ count: 0 }) },
      $queryRaw: (query: TemplateStringsArray) => {
        const sql = query.join('?');
        if (sql.includes('FROM organizations')) return Promise.resolve([{ id: PRINCIPAL.organizationId }]);
        if (sql.includes('FROM v81_settlement_report_revisions')) return Promise.resolve([]);
        if (sql.includes('pg_try_advisory_xact_lock')) return Promise.resolve([{ acquired: true }]);
        throw new Error(`Unexpected query in alignment fixture: ${sql}`);
      },
    };
    const idempotency = {
      execute: async (
        _input: unknown,
        action: (tx: typeof transaction) => Promise<Record<string, unknown>>,
      ) => {
        const outcome = await action(transaction);
        if (outcome.kind === 'FAILURE') throw outcome.error;
        return outcome.value;
      },
      failure: (error: ApplicationError, references: Record<string, unknown> = {}) => ({
        kind: 'FAILURE',
        error,
        ...references,
      }),
      success: (value: unknown, references: Record<string, unknown> = {}) => ({
        kind: 'SUCCESS',
        value,
        ...references,
      }),
    };
    const service = new RosterAlignmentService(
      {} as never,
      idempotency as never,
      { append: () => Promise.resolve() } as never,
      {
        append: (_transaction: unknown, event: Record<string, unknown>) => {
          outboxEvents.push(event);
          return Promise.resolve('00000000-0000-7000-8000-000000000008');
        },
      } as never,
      {} as never,
      { digest: () => 'a'.repeat(64) } as never,
      { now: () => new Date('2026-08-04T12:00:00.000Z') },
      { next: () => '00000000-0000-7000-8000-000000000009' },
    );
    await assert.rejects(
      service.align(
        PRINCIPAL,
        '00000000-0000-7000-8000-000000000001',
        { expectedRosterImportVersion: 1 },
        { requestId: 'stage13-failed-alignment', idempotencyKey: 'stage13-failed-alignment' },
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'ROSTER_ALIGNMENT_EXCEPTION',
    );

    assert.deepEqual(entryQueries[0], {
      where: {
        rosterImportId: '00000000-0000-7000-8000-000000000001',
        rowValidationStatus: { in: ['VALID', 'DUPLICATED'] },
      },
      orderBy: [{ normalizedStudentNumber: 'asc' }, { id: 'asc' }],
    });
    assert.equal(createdRuns.length, 1);
    assert.equal(createdRuns[0]?.status, 'RUNNING');
    assert.match(String(createdRuns[0]?.platformSnapshotFingerprint), /^[0-9a-f]{64}$/);
    assert.deepEqual(updatedRuns, [
      {
        status: 'FAILED',
        completedAt: new Date('2026-08-04T12:00:00.000Z'),
        failureCode: 'ROSTER_ALIGNMENT_EXCEPTION',
        failureDetailsSafe: { category: 'DOMAIN_COMPUTATION' },
        resultCount: 0,
        isCurrent: false,
      },
    ]);
    assert.equal(outboxEvents.length, 1);
    assert.equal(outboxEvents[0]?.eventType, 'ROSTER_ALIGNMENT_FAILED_V1');
  });

  it('maps a non-retried serializable snapshot race to the stable stale-snapshot error', async () => {
    const serializationError = new Prisma.PrismaClientKnownRequestError(
      'Synthetic serializable snapshot race',
      { code: 'P2034', clientVersion: 'test' },
    );
    const service = new RosterAlignmentService(
      {} as never,
      { execute: async () => Promise.reject(serializationError) } as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
      {} as never,
    );

    await assert.rejects(
      service.align(
        PRINCIPAL,
        '00000000-0000-7000-8000-000000000001',
        { expectedRosterImportVersion: 1 },
        { requestId: 'stage13-stale-alignment', idempotencyKey: 'stage13-stale-alignment' },
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'ROSTER_ALIGNMENT_SNAPSHOT_STALE',
    );
  });

  it('projects exactly the public run contract and drops internal snapshot scope and failure details', () => {
    const internalRecord = {
      id: '00000000-0000-7000-8000-000000000001',
      organizationId: '00000000-0000-7000-8000-000000000002',
      semesterId: '00000000-0000-7000-8000-000000000004',
      classSectionId: '00000000-0000-7000-8000-000000000003',
      rosterImportId: '00000000-0000-7000-8000-000000000006',
      comparisonRevision: 1,
      algorithmVersion: 'ROSTER_ALIGNMENT_V1',
      platformSnapshotFingerprint: 'a'.repeat(64),
      platformSnapshotAt: new Date('2026-08-04T12:00:00.000Z'),
      status: 'FAILED',
      startedBy: PRINCIPAL.userId,
      startedAt: new Date('2026-08-04T12:00:00.000Z'),
      completedAt: new Date('2026-08-04T12:00:00.000Z'),
      failureCode: 'ROSTER_ALIGNMENT_EXCEPTION',
      failureDetailsSafe: { category: 'DOMAIN_COMPUTATION' },
      resultCount: 0,
      isCurrent: false,
    };
    const projection = projectAlignmentRun(internalRecord);

    assert.deepEqual(Object.keys(projection).sort(), [
      'algorithmVersion',
      'classSectionId',
      'comparisonRevision',
      'completedAt',
      'failureCode',
      'id',
      'isCurrent',
      'organizationId',
      'platformSnapshotAt',
      'platformSnapshotFingerprint',
      'resultCount',
      'rosterImportId',
      'startedAt',
      'startedBy',
      'status',
    ]);
    assert.equal('semesterId' in projection, false);
    assert.equal('failureDetailsSafe' in projection, false);
  });
});
