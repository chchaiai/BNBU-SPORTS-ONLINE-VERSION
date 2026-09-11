import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import { after, before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';

import { AuditService } from '../../src/common/audit/audit.service.js';
import { validateEnvironment, type RuntimeConfig } from '../../src/common/config/environment.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import type { AuthenticatedPrincipal, UserRole } from '../../src/common/http/request-context.js';
import { IdempotencyService } from '../../src/common/idempotency/idempotency.service.js';
import type {
  ObjectStoragePort,
  PutPrivateObjectInput,
} from '../../src/common/object-storage/object-storage.port.js';
import { OutboxService } from '../../src/common/outbox/outbox.service.js';
import { ScopedCursorService } from '../../src/common/pagination/scoped-cursor.service.js';
import { RosterCsvParserService } from '../../src/common/roster-ingestion/roster-csv-parser.service.js';
import { RosterMultipartUploadService } from '../../src/common/roster-ingestion/roster-multipart-upload.service.js';
import { SecureDigestService } from '../../src/common/security/secure-digest.service.js';
import { FixedClock } from '../../src/common/time/clock.js';
import { UuidV7Generator } from '../../src/common/time/id-generator.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import { RosterAlignmentService } from '../../src/modules/roster/application/roster-alignment.service.js';
import { RosterImportsService } from '../../src/modules/roster/application/roster-imports.service.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import { foundationEnvironment, requireTestDatabaseUrl } from '../helpers/test-environment.js';

class MemoryObjectStorage implements ObjectStoragePort {
  checkHealth(): Promise<void> {
    return Promise.resolve();
  }

  readonly objects = new Map<string, Buffer>();

  async putPrivateObject(input: PutPrivateObjectInput): Promise<{ entityTag: string | null }> {
    const chunks: Buffer[] = [];
    for await (const chunk of input.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    this.objects.set(input.storageKey, Buffer.concat(chunks));
    return { entityTag: null };
  }

  getPrivateObject(storageKey: string): Promise<Readable> {
    const object = this.objects.get(storageKey);
    if (object === undefined) return Promise.reject(new Error('Synthetic object not found'));
    return Promise.resolve(Readable.from([object]));
  }

  deletePrivateObject(storageKey: string): Promise<void> {
    this.objects.delete(storageKey);
    return Promise.resolve();
  }
}

function multipartRequest(
  fields: Readonly<Record<string, string>>,
  file?: { name: string; body: Buffer },
): Readable & { headers: Record<string, string> } {
  const boundary = `bnbu-integration-${uuidv7()}`;
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (file !== undefined) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: text/csv\r\n\r\n`,
      ),
      file.body,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  return Object.assign(Readable.from([body]), {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
  });
}

const FIELD_MAPPING = JSON.stringify({
  studentNumber: 'studentNumber',
  fullName: 'fullName',
  gender: 'gender',
  gradeYear: 'gradeYear',
  collegeName: null,
  majorName: null,
  administrativeClassName: null,
});

function rosterRequest(lines: string[]): Readable & { headers: Record<string, string> } {
  return multipartRequest(
    { source: 'FILE', fileFormat: 'CSV', fieldMappingSnapshot: FIELD_MAPPING },
    { name: `synthetic-${uuidv7()}.csv`, body: Buffer.from(lines.join('\n')) },
  );
}

describe('Official Roster Import and Alignment PostgreSQL integration', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let imports: RosterImportsService;
  let alignment: RosterAlignmentService;
  let storage: MemoryObjectStorage;
  let teacher: AuthenticatedPrincipal;

  before(() => {
    prisma = createTestPrisma(requireTestDatabaseUrl());
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
    const config = validateEnvironment(foundationEnvironment(requireTestDatabaseUrl(), 0))
      .RUNTIME_CONFIG as RuntimeConfig;
    const clock = new FixedClock(new Date('2026-08-04T12:00:00.000Z'));
    const ids = new UuidV7Generator();
    const digest = new SecureDigestService(config);
    const database = prisma as unknown as PrismaService;
    const idempotency = new IdempotencyService(database, clock, ids, digest, config);
    const audit = new AuditService(clock, ids, digest);
    const outbox = new OutboxService(database, clock, ids);
    const cursors = new ScopedCursorService(digest);
    storage = new MemoryObjectStorage();
    imports = new RosterImportsService(
      database,
      idempotency,
      audit,
      outbox,
      cursors,
      digest,
      clock,
      ids,
      new RosterMultipartUploadService(config, storage),
      new RosterCsvParserService(storage),
      storage,
    );
    alignment = new RosterAlignmentService(
      database,
      idempotency,
      audit,
      outbox,
      cursors,
      digest,
      clock,
      ids,
    );
    teacher = await createPrincipal(fixture.teacherUserId, 'TEACHER', fixture.organizationId);
  });

  after(async () => {
    await prisma.$disconnect();
  });

  async function createPrincipal(
    userId: string,
    role: UserRole,
    organizationId: string,
  ): Promise<AuthenticatedPrincipal> {
    const sessionId = uuidv7();
    const now = new Date('2026-08-04T12:00:00.000Z');
    await prisma.authSession.create({
      data: {
        id: sessionId,
        organizationId,
        userId,
        status: 'ACTIVE',
        tokenFamilyId: uuidv7(),
        createdAt: now,
        lastSeenAt: now,
        absoluteExpiresAt: new Date('2026-08-05T12:00:00.000Z'),
        idleExpiresAt: new Date('2026-08-05T12:00:00.000Z'),
      },
    });
    return {
      userId,
      organizationId,
      role,
      sessionId,
      tokenVersion: 0,
      jti: uuidv7(),
    };
  }

  async function createPlatformStudent(input: {
    studentNumber: string;
    fullName: string;
    classSectionId: string;
    gender?: string;
    gradeYear?: number;
  }): Promise<{ userId: string; profileId: string; enrollmentId: string }> {
    const now = new Date('2026-08-04T12:00:00.000Z');
    const userId = uuidv7();
    const profileId = uuidv7();
    const enrollmentId = uuidv7();
    await prisma.$transaction(async (transaction) => {
      await transaction.user.create({
        data: {
          id: userId,
          organizationId: fixture.organizationId,
          role: 'STUDENT',
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.studentProfile.create({
        data: {
          id: profileId,
          organizationId: fixture.organizationId,
          userId,
          studentNumber: input.studentNumber,
          fullName: input.fullName,
          gender: input.gender ?? 'OTHER',
          gradeYear: input.gradeYear ?? 2026,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.enrollment.create({
        data: {
          id: enrollmentId,
          organizationId: fixture.organizationId,
          semesterId: fixture.semesterId,
          classSectionId: input.classSectionId,
          studentId: profileId,
          source: 'MANUAL',
          status: 'ACTIVE',
          joinedAt: now,
          createdBy: fixture.teacherUserId,
          updatedBy: fixture.teacherUserId,
          createdAt: now,
          updatedAt: now,
        },
      });
    });
    return { userId, profileId, enrollmentId };
  }

  it('installs six scoped roster tables and append-only history guards', async () => {
    const tables = await prisma.$queryRaw<{ table_name: string }[]>`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
        AND table_name IN (
          'official_roster_imports',
          'official_roster_entries',
          'roster_alignment_runs',
          'roster_alignment_platform_entries',
          'roster_alignment_results',
          'roster_resolution_events'
        )
      ORDER BY table_name
    `;
    assert.deepEqual(
      tables.map(({ table_name }) => table_name),
      [
        'official_roster_entries',
        'official_roster_imports',
        'roster_alignment_platform_entries',
        'roster_alignment_results',
        'roster_alignment_runs',
        'roster_resolution_events',
      ],
    );
    const triggers = await prisma.$queryRaw<{ trigger_name: string }[]>`
      SELECT DISTINCT trigger_name
      FROM information_schema.triggers
      WHERE trigger_schema = 'public'
        AND trigger_name IN (
          'official_roster_entries_append_only_trigger',
          'roster_platform_entries_append_only_trigger',
          'roster_resolution_events_append_only_trigger'
        )
      ORDER BY trigger_name
    `;
    assert.deepEqual(
      triggers.map(({ trigger_name }) => trigger_name),
      [
        'official_roster_entries_append_only_trigger',
        'roster_platform_entries_append_only_trigger',
        'roster_resolution_events_append_only_trigger',
      ],
    );
  });

  it('persists private versions, a frozen deterministic alignment, resolution history, and rollback', async () => {
    const matched = await createPlatformStudent({
      studentNumber: '0001',
      fullName: 'Synthetic Matched',
      classSectionId: fixture.teacherAActiveSectionId,
      gender: 'FEMALE',
    });
    await createPlatformStudent({
      studentNumber: '0003',
      fullName: 'Synthetic Wrong Course',
      classSectionId: fixture.teacherBActiveSectionId,
    });
    const identityConflictStudent = await createPlatformStudent({
      studentNumber: '0004',
      fullName: 'Different Platform Name',
      classSectionId: fixture.teacherAActiveSectionId,
    });
    await createPlatformStudent({
      studentNumber: '0005',
      fullName: 'Synthetic Extra',
      classSectionId: fixture.teacherAActiveSectionId,
    });
    const immutableCounts = {
      users: await prisma.user.count(),
      profiles: await prisma.studentProfile.count(),
      enrollments: await prisma.enrollment.count(),
    };

    const first = await imports.create(
      teacher,
      fixture.teacherAActiveSectionId,
      rosterRequest([
        'studentNumber,fullName,gender,gradeYear',
        '0001,Synthetic Matched,FEMALE,2026',
        '0002,Synthetic Missing,OTHER,2026',
        '0003,Synthetic Wrong Course,OTHER,2026',
        '0004,Synthetic Official Name,OTHER,2026',
        'dup7,Synthetic Duplicate Official A,OTHER,2026',
        'DUP7,Synthetic Duplicate Official B,OTHER,2026',
      ]) as never,
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    assert.equal(first.versionNumber, 1);
    assert.equal(first.isCurrent, true);
    assert.equal(first.validRowCount, 4);
    assert.equal(first.duplicatedRowCount, 2);
    assert.equal('sourceFileStorageKey' in first, false);
    assert.equal('fileChecksumSha256' in first, false);
    const storedImport = await prisma.officialRosterImport.findUniqueOrThrow({
      where: { id: first.id },
    });
    assert.equal(typeof storedImport.sourceFileStorageKey, 'string');
    assert.equal(storage.objects.has(storedImport.sourceFileStorageKey ?? ''), true);
    assert.equal((await imports.getCurrent(teacher, fixture.teacherAActiveSectionId)).id, first.id);
    assert.equal(
      (await imports.list(teacher, fixture.teacherAActiveSectionId, { limit: 20 })).data.length,
      1,
    );
    assert.equal((await imports.listEntries(teacher, first.id, { limit: 20 })).data.length, 6);

    const firstAlignmentFacts = { requestId: uuidv7(), idempotencyKey: uuidv7() };
    const firstRun = await alignment.align(
      teacher,
      first.id,
      { expectedRosterImportVersion: first.version },
      firstAlignmentFacts,
    );
    assert.equal(firstRun.status, 'COMPLETED');
    assert.equal(firstRun.comparisonRevision, 1);
    const run = await alignment.align(
      teacher,
      first.id,
      { expectedRosterImportVersion: first.version },
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    assert.equal(run.comparisonRevision, 2);
    assert.equal(run.platformSnapshotFingerprint, firstRun.platformSnapshotFingerprint);
    const replayedFirstRun = await alignment.align(
      teacher,
      first.id,
      { expectedRosterImportVersion: first.version },
      firstAlignmentFacts,
    );
    assert.deepEqual(replayedFirstRun, firstRun);
    assert.equal(
      (await prisma.rosterAlignmentRun.findUniqueOrThrow({ where: { id: firstRun.id } })).isCurrent,
      false,
    );
    const results = await alignment.list(teacher, {
      limit: 100,
      currentOnly: true,
      classSectionId: fixture.teacherAActiveSectionId,
    });
    assert.deepEqual([...new Set(results.data.map(({ status }) => status))].sort(), [
      'DUPLICATED',
      'EXTRA_IN_PLATFORM',
      'IDENTITY_CONFLICT',
      'MATCHED',
      'MISSING_IN_PLATFORM',
      'WRONG_COURSE',
    ]);
    const duplicatedImportEntryIds = (
      await prisma.officialRosterEntry.findMany({
        where: { rosterImportId: first.id, rowValidationStatus: 'DUPLICATED' },
        select: { id: true },
      })
    ).map(({ id }) => id);
    assert.deepEqual(
      await prisma.rosterAlignmentResult.findMany({
        where: { alignmentRunId: run.id, rosterEntryId: { in: duplicatedImportEntryIds } },
        select: { status: true, studentId: true, enrollmentId: true },
      }),
      [{ status: 'DUPLICATED', studentId: null, enrollmentId: null }],
    );
    const frozen = await prisma.rosterAlignmentPlatformEntry.findFirstOrThrow({
      where: { alignmentRunId: run.id, studentId: matched.profileId },
    });
    await prisma.studentProfile.update({
      where: { id: matched.profileId },
      data: { fullName: 'Synthetic Changed After Snapshot', version: { increment: 1 } },
    });
    assert.equal(
      (await prisma.rosterAlignmentPlatformEntry.findUniqueOrThrow({ where: { id: frozen.id } }))
        .fullNameSnapshot,
      'Synthetic Matched',
    );

    const identityConflict = results.data.find(({ status }) => status === 'IDENTITY_CONFLICT');
    assert.ok(identityConflict !== undefined);
    const unrelatedEvidenceId = uuidv7();
    const relatedEvidenceId = uuidv7();
    await prisma.enrollmentStatusEvent.createMany({
      data: [
        {
          id: unrelatedEvidenceId,
          organizationId: fixture.organizationId,
          enrollmentId: matched.enrollmentId,
          fromStatus: null,
          toStatus: 'ACTIVE',
          source: 'MANUAL_ENROLLMENT',
          reason: 'Synthetic unrelated evidence',
          actorUserId: fixture.teacherUserId,
          actorRoleSnapshot: 'TEACHER',
          requestId: 'stage13-unrelated-evidence',
          occurredAt: new Date('2026-08-04T12:00:00.000Z'),
          enrollmentVersion: 1,
        },
        {
          id: relatedEvidenceId,
          organizationId: fixture.organizationId,
          enrollmentId: identityConflictStudent.enrollmentId,
          fromStatus: null,
          toStatus: 'ACTIVE',
          source: 'MANUAL_ENROLLMENT',
          reason: 'Synthetic identity conflict evidence',
          actorUserId: fixture.teacherUserId,
          actorRoleSnapshot: 'TEACHER',
          requestId: 'stage13-related-evidence',
          occurredAt: new Date('2026-08-04T12:00:00.000Z'),
          enrollmentVersion: 1,
        },
      ],
    });
    const confirmed = await alignment.confirm(
      teacher,
      identityConflict.id,
      { reason: 'Synthetic confirmation', expectedVersion: identityConflict.version },
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    assert.equal(confirmed.resolutionStatus, 'CONFIRMED');
    await assert.rejects(
      alignment.resolve(
        teacher,
        identityConflict.id,
        {
          resolutionNote: 'Unrelated event must fail closed',
          evidenceType: 'ENROLLMENT_STATUS_EVENT',
          evidenceReferenceId: unrelatedEvidenceId,
          expectedVersion: confirmed.version,
        },
        { requestId: uuidv7(), idempotencyKey: uuidv7() },
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'ROSTER_RESOLUTION_EVIDENCE_REQUIRED',
    );
    assert.equal(
      (
        await prisma.rosterAlignmentResult.findUniqueOrThrow({
          where: { id: identityConflict.id },
        })
      ).version,
      confirmed.version,
    );
    const resolved = await alignment.resolve(
      teacher,
      identityConflict.id,
      {
        resolutionNote: 'Synthetic resolution',
        evidenceType: 'ENROLLMENT_STATUS_EVENT',
        evidenceReferenceId: relatedEvidenceId,
        expectedVersion: confirmed.version,
      },
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    assert.equal(resolved.resolutionStatus, 'RESOLVED');
    const reopened = await alignment.reopen(
      teacher,
      identityConflict.id,
      { reason: 'Synthetic reopen', expectedVersion: resolved.version },
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    assert.equal(reopened.resolutionStatus, 'PENDING');
    assert.equal(
      await prisma.rosterResolutionEvent.count({
        where: { alignmentResultId: identityConflict.id },
      }),
      3,
    );
    const noSideEffectBefore = {
      version: reopened.version,
      events: await prisma.rosterResolutionEvent.count(),
      idempotency: await prisma.idempotencyRecord.count(),
      audit: await prisma.auditLog.count(),
      outbox: await prisma.outboxEvent.count(),
    };
    await assert.rejects(
      alignment.ignore(
        teacher,
        identityConflict.id,
        { reason: 'Synthetic denied ignore', expectedVersion: reopened.version },
        uuidv7(),
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'ROSTER_IGNORE_NOT_ALLOWED',
    );
    assert.deepEqual(
      {
        version: (
          await prisma.rosterAlignmentResult.findUniqueOrThrow({
            where: { id: identityConflict.id },
          })
        ).version,
        events: await prisma.rosterResolutionEvent.count(),
        idempotency: await prisma.idempotencyRecord.count(),
        audit: await prisma.auditLog.count(),
        outbox: await prisma.outboxEvent.count(),
      },
      noSideEffectBefore,
    );

    const second = await imports.create(
      teacher,
      fixture.teacherAActiveSectionId,
      rosterRequest([
        'studentNumber,fullName,gender,gradeYear',
        '0099,Synthetic Replacement,OTHER,2026',
      ]) as never,
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    assert.equal(second.versionNumber, 2);
    assert.equal(second.isCurrent, true);
    const rolledBack = await imports.rollback(
      teacher,
      first.id,
      {
        expectedCurrentRosterImportId: second.id,
        expectedVersion: second.version,
        reason: 'Synthetic rollback',
      },
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    assert.equal(rolledBack.id, first.id);
    assert.equal(rolledBack.isCurrent, true);
    assert.equal((await imports.getCurrent(teacher, fixture.teacherAActiveSectionId)).id, first.id);
    assert.equal(
      await prisma.rosterAlignmentRun.count({
        where: { classSectionId: fixture.teacherAActiveSectionId, isCurrent: true },
      }),
      0,
    );
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        profiles: await prisma.studentProfile.count(),
        enrollments: await prisma.enrollment.count(),
      },
      immutableCounts,
    );

    const admin: AuthenticatedPrincipal = {
      userId: fixture.adminUserId,
      organizationId: fixture.organizationId,
      role: 'ADMIN',
      sessionId: uuidv7(),
      tokenVersion: 0,
      jti: uuidv7(),
    };
    const adminEntries = await imports.listEntries(admin, first.id, { limit: 20 });
    assert.ok(adminEntries.data.every((entry) => entry.studentNumber === null));
    const teacherB: AuthenticatedPrincipal = {
      ...teacher,
      userId: fixture.teacherBUserId,
      sessionId: uuidv7(),
      jti: uuidv7(),
    };
    await assert.rejects(
      imports.get(teacherB, first.id),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'PERMISSION_RESOURCE_NOT_FOUND',
    );
    const student: AuthenticatedPrincipal = {
      ...teacher,
      userId: matched.userId,
      role: 'STUDENT',
      sessionId: uuidv7(),
      jti: uuidv7(),
    };
    await assert.rejects(
      imports.list(student, fixture.teacherAActiveSectionId, { limit: 20 }),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'PERMISSION_RESOURCE_SCOPE_DENIED',
    );

    const beforeUnsupported = await prisma.officialRosterImport.count();
    await assert.rejects(
      imports.create(
        teacher,
        fixture.teacherAActiveSectionId,
        multipartRequest({ source: 'OFFICIAL_API', fileFormat: 'CSV' }) as never,
        { requestId: uuidv7(), idempotencyKey: uuidv7() },
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'ROSTER_IMPORT_SOURCE_UNSUPPORTED',
    );
    assert.equal(await prisma.officialRosterImport.count(), beforeUnsupported);

    const entry = await prisma.officialRosterEntry.findFirstOrThrow({
      where: { rosterImportId: first.id },
    });
    await assert.rejects(
      prisma.officialRosterEntry.update({
        where: { id: entry.id },
        data: { fullName: 'Forbidden' },
      }),
    );
    await assert.rejects(prisma.rosterAlignmentPlatformEntry.delete({ where: { id: frozen.id } }));
    const resolutionEvent = await prisma.rosterResolutionEvent.findFirstOrThrow();
    await assert.rejects(
      prisma.rosterResolutionEvent.delete({ where: { id: resolutionEvent.id } }),
    );
  });

  it('binds roster-version evidence to a different version of the same subject and keeps newer-result evidence fail-closed', async () => {
    await createPlatformStudent({
      studentNumber: '0100',
      fullName: 'Synthetic Platform Name',
      classSectionId: fixture.teacherAActiveSectionId,
    });
    const createSingleRowImport = (studentNumber: string, fullName: string) =>
      imports.create(
        teacher,
        fixture.teacherAActiveSectionId,
        rosterRequest([
          'studentNumber,fullName,gender,gradeYear',
          `${studentNumber},${fullName},OTHER,2026`,
        ]) as never,
        { requestId: uuidv7(), idempotencyKey: uuidv7() },
      );

    const wrongSubjectVersion = await createSingleRowImport(
      '0101',
      'Synthetic Wrong Subject Version',
    );
    const sameSubjectVersion = await createSingleRowImport(
      '0100',
      'Synthetic Historical Official Name',
    );
    const currentVersion = await createSingleRowImport('0100', 'Synthetic Current Official Name');
    const firstRun = await alignment.align(
      teacher,
      currentVersion.id,
      { expectedRosterImportVersion: currentVersion.version },
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    const currentResults = await alignment.list(teacher, {
      limit: 20,
      currentOnly: true,
      alignmentRunId: firstRun.id,
    });
    const conflict = currentResults.data.find(({ status }) => status === 'IDENTITY_CONFLICT');
    assert.ok(conflict !== undefined);

    for (const evidenceReferenceId of [currentVersion.id, wrongSubjectVersion.id]) {
      await assert.rejects(
        alignment.resolve(
          teacher,
          conflict.id,
          {
            resolutionNote: 'Mismatched roster version must fail closed',
            evidenceType: 'OFFICIAL_ROSTER_VERSION',
            evidenceReferenceId,
            expectedVersion: conflict.version,
          },
          { requestId: uuidv7(), idempotencyKey: uuidv7() },
        ),
        (error: unknown) =>
          error instanceof ApplicationError && error.code === 'ROSTER_RESOLUTION_EVIDENCE_REQUIRED',
      );
    }
    const resolved = await alignment.resolve(
      teacher,
      conflict.id,
      {
        resolutionNote: 'Different version contains the same normalized subject',
        evidenceType: 'OFFICIAL_ROSTER_VERSION',
        evidenceReferenceId: sameSubjectVersion.id,
        expectedVersion: conflict.version,
      },
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    assert.equal(resolved.resolutionStatus, 'RESOLVED');

    const secondRun = await alignment.align(
      teacher,
      currentVersion.id,
      { expectedRosterImportVersion: currentVersion.version },
      { requestId: uuidv7(), idempotencyKey: uuidv7() },
    );
    const replacementResults = await alignment.list(teacher, {
      limit: 20,
      currentOnly: true,
      alignmentRunId: secondRun.id,
    });
    const replacement = replacementResults.data.find(
      ({ status }) => status === 'IDENTITY_CONFLICT',
    );
    assert.ok(replacement !== undefined);

    // A greater comparison revision necessarily supersedes the prior run. The old result must
    // remain immutable, so NEW_ALIGNMENT_RESULT is a reserved evidence type rather than a path
    // around the superseded-result guard.
    await assert.rejects(
      alignment.resolve(
        teacher,
        conflict.id,
        {
          resolutionNote: 'Newer result cannot mutate a superseded result',
          evidenceType: 'NEW_ALIGNMENT_RESULT',
          evidenceReferenceId: replacement.id,
          expectedVersion: resolved.version,
        },
        { requestId: uuidv7(), idempotencyKey: uuidv7() },
      ),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'ROSTER_ALIGNMENT_RESULT_SUPERSEDED',
    );
  });
});
