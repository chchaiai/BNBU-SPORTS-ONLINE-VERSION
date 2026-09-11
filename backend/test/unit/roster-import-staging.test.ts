import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuthenticatedPrincipal } from '../../src/common/http/request-context.js';
import type { ReceivedRosterUpload } from '../../src/common/roster-ingestion/roster-ingestion.types.js';
import { RosterImportsService } from '../../src/modules/roster/application/roster-imports.service.js';

const ORGANIZATION_ID = '00000000-0000-7000-8000-000000000001';
const TEACHER_ID = '00000000-0000-7000-8000-000000000002';
const SESSION_ID = '00000000-0000-7000-8000-000000000003';
const SECTION_ID = '00000000-0000-7000-8000-000000000004';
const IMPORT_ID = '00000000-0000-7000-8000-000000000005';
const IDEMPOTENCY_ID = '00000000-0000-7000-8000-000000000006';

describe('Official roster staged import lifecycle', () => {
  it('commits RECEIVED and its outbox event before parsing, then completes atomically', async () => {
    const now = new Date('2026-08-04T12:00:00.000Z');
    const sequence: string[] = [];
    let reservationCommitted = false;
    let parserObservedCommittedStage = false;
    let rosterImport = {
      id: IMPORT_ID,
      organizationId: ORGANIZATION_ID,
      classSectionId: SECTION_ID,
      versionNumber: 1,
      source: 'FILE',
      status: 'RECEIVED',
      totalRowCount: 0,
      validRowCount: 0,
      invalidRowCount: 0,
      duplicatedRowCount: 0,
      importedAt: now,
      importedBy: TEACHER_ID,
      isCurrent: false,
      supersededAt: null as Date | null,
      failureCode: null as string | null,
      version: 1,
      createdAt: now,
      sourceFileStorageKey: 'roster-sources/synthetic/source.csv',
      fieldMappingSnapshot: {
        studentNumber: 'studentNumber',
        fullName: 'fullName',
        gender: null,
        gradeYear: null,
        collegeName: null,
        majorName: null,
        administrativeClassName: null,
      },
    };
    const upload: ReceivedRosterUpload = {
      source: 'FILE',
      fileFormat: 'CSV',
      sanitizedOriginalFileName: 'synthetic.csv',
      sourceFileStorageKey: rosterImport.sourceFileStorageKey,
      fileChecksumSha256: 'a'.repeat(64),
      fileSizeBytes: 64,
      fieldMappingSnapshot: rosterImport.fieldMappingSnapshot,
    };

    const transaction = {
      $queryRaw: () => Promise.resolve([]),
      classSection: {
        findFirst: () => Promise.resolve({status:'DRAFT',closedAt:null,teacher:{userId:TEACHER_ID}}),
      },
      officialRosterImport: {
        findFirst: (input: { where?: { status?: string; fileChecksumSha256?: string } }) => {
          if (input.where?.status === 'RECEIVED') return Promise.resolve(rosterImport);
          if (input.where?.fileChecksumSha256 !== undefined) return Promise.resolve(null);
          return Promise.resolve(null);
        },
        create: () => {
          sequence.push('RECEIVED');
          return Promise.resolve(rosterImport);
        },
        updateMany: () => Promise.resolve({ count: 0 }),
        update: (input: { data: { status?: string } }) => {
          if (input.data.status === 'VALIDATING') {
            rosterImport = { ...rosterImport, status: 'VALIDATING', version: 2 };
            sequence.push('VALIDATING');
            return Promise.resolve(rosterImport);
          }
          rosterImport = {
            ...rosterImport,
            status: 'VALIDATED',
            totalRowCount: 1,
            validRowCount: 1,
            isCurrent: true,
            version: 3,
          };
          sequence.push('VALIDATED');
          return Promise.resolve(rosterImport);
        },
      },
      officialRosterEntry: {
        createMany: () => {
          sequence.push('ENTRY_CREATED');
          return Promise.resolve({ count: 1 });
        },
      },
      rosterAlignmentRun: { updateMany: () => Promise.resolve({ count: 0 }) },
      rosterAlignmentResult: { updateMany: () => Promise.resolve({ count: 0 }) },
    };
    const idempotency = {
      reserveStage: (
        _input: unknown,
        action: (
          database: typeof transaction,
          context: Record<string, unknown>,
        ) => Promise<unknown>,
      ) =>
        action(transaction, {
          isRecovery: false,
          resourceType: null,
          resourceId: null,
        }).then((outcome) => {
          assert.equal((outcome as { kind: string }).kind, 'STAGED');
          reservationCommitted = true;
          sequence.push('RESERVATION_COMMITTED');
          return {
            kind: 'OWNER',
            recordId: IDEMPOTENCY_ID,
            leaseOwner: 'synthetic-lease',
            value: (outcome as { value: unknown }).value,
            retrySerializationFailure: true,
          };
        }),
      completeStage: (
        _owner: unknown,
        action: (database: typeof transaction) => Promise<unknown>,
      ) =>
        action(transaction).then((outcome) => {
          const typed = outcome as { kind: string; value: unknown };
          assert.equal(typed.kind, 'SUCCESS');
          sequence.push('COMPLETION_COMMITTED');
          return typed.value;
        }),
      stage: (value: unknown, references: Record<string, unknown>) => ({
        kind: 'STAGED',
        value,
        ...references,
      }),
      success: (value: unknown, references: Record<string, unknown>) => ({
        kind: 'SUCCESS',
        value,
        ...references,
      }),
    };
    const outbox = {
      append: (_database: unknown, event: { eventType: string }) => {
        sequence.push(event.eventType);
        return Promise.resolve();
      },
    };
    const parser = {
      parseStoredCsv: () => {
        assert.equal(reservationCommitted, true);
        assert.equal(rosterImport.status, 'RECEIVED');
        assert.deepEqual(sequence, [
          'RECEIVED',
          'ROSTER_IMPORT_RECEIVED_V1',
          'RESERVATION_COMMITTED',
        ]);
        parserObservedCommittedStage = true;
        sequence.push('PARSED');
        return Promise.resolve({
          rows: [
            {
              sourceRowNumber: 2,
              normalizedStudentNumber: '0001',
              rawStudentNumberSafe: '0001',
              fullName: 'Synthetic Student',
              gender: null,
              gradeYear: null,
              collegeName: null,
              majorName: null,
              administrativeClassName: null,
              rowValidationStatus: 'VALID',
              rowErrorCodes: [],
              rawRowSnapshotSafe: {
                studentNumber: '0001',
                fullName: 'Synthetic Student',
                gender: null,
                gradeYear: null,
                collegeName: null,
                majorName: null,
                administrativeClassName: null,
              },
            },
          ],
          totalRowCount: 1,
          validRowCount: 1,
          invalidRowCount: 0,
          duplicatedRowCount: 0,
        });
      },
    };
    const service = new RosterImportsService(
      {
        classSection: {
          findFirst: () => Promise.resolve({ teacher: { userId: TEACHER_ID } }),
        },
      } as never,
      idempotency as never,
      { append: () => Promise.resolve() } as never,
      outbox as never,
      {} as never,
      { digest: () => 'b'.repeat(64) } as never,
      { now: () => now },
      { next: () => IMPORT_ID },
      { receive: () => Promise.resolve(upload) } as never,
      parser as never,
      { deletePrivateObject: () => Promise.resolve() } as never,
    );
    const principal: AuthenticatedPrincipal = {
      userId: TEACHER_ID,
      organizationId: ORGANIZATION_ID,
      role: 'TEACHER',
      sessionId: SESSION_ID,
      tokenVersion: 0,
      jti: '00000000-0000-7000-8000-000000000007',
    };

    const result = await service.create(principal, SECTION_ID, {} as never, {
      requestId: 'stage13-staged-import-unit',
      idempotencyKey: 'stage13-staged-import-unit-key',
    });

    assert.equal(parserObservedCommittedStage, true);
    assert.equal(result.id, IMPORT_ID);
    assert.equal(result.status, 'VALIDATED');
    assert.deepEqual(sequence, [
      'RECEIVED',
      'ROSTER_IMPORT_RECEIVED_V1',
      'RESERVATION_COMMITTED',
      'PARSED',
      'VALIDATING',
      'ENTRY_CREATED',
      'VALIDATED',
      'ROSTER_IMPORT_VALIDATED_V1',
      'COMPLETION_COMMITTED',
    ]);
  });
});
