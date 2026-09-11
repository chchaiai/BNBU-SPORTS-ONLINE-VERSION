import { get } from 'node:http';
import assert from 'node:assert/strict';
import { createServer } from 'node:net';
import { resolve } from 'node:path';
import { after, before, beforeEach, describe, it } from 'node:test';
import { pathToFileURL } from 'node:url';

import { ValidationPipe, type INestApplication, type Type } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { json, urlencoded } from 'express';
import { importPKCS8, SignJWT } from 'jose';
import { v7 as uuidv7 } from 'uuid';

import type { RuntimeConfig } from '../../src/common/config/environment.js';
import type { BodyParserErrorMiddleware as BodyParserErrorMiddlewareType } from '../../src/common/http/body-parser-error.middleware.js';
import type { RequestIdMiddleware as RequestIdMiddlewareType } from '../../src/common/http/request-id.js';
import type { validationException as ValidationExceptionFactory } from '../../src/common/http/validation.js';
import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import { seedExerciseSessionStudent } from '../helpers/exercise-session.js';
import {
  foundationEnvironment,
  requireTestDatabaseUrl,
  TEST_PASSWORD,
  TEST_PRIVATE_KEY,
} from '../helpers/test-environment.js';

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

function object(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function compiledModule(relativePath: string): string {
  return pathToFileURL(resolve('dist', relativePath)).href;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolvePromise);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((resolvePromise, reject) =>
    server.close((error) => (error ? reject(error) : resolvePromise())),
  );
  return address.port;
}

describe('V81 formal settlement and semester archival HTTP E2E', () => {
  let app: INestApplication;
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let baseUrl: string;

  const request = async (path: string, init: RequestInit = {}): Promise<HttpResult> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
    };
  };

  const authenticated = (
    token: string,
    method = 'GET',
    body?: Record<string, unknown>,
    key?: string,
  ): RequestInit => ({
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(key === undefined ? {} : { 'idempotency-key': key }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  before(async () => {
    const databaseUrl = requireTestDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    const port = await availablePort();
    Object.assign(process.env, foundationEnvironment(databaseUrl, port), {
      EMAIL_DELIVERY_PROVIDER: 'SMTP', EMAIL_DELIVERY_REQUIRED: 'true', SMTP_HOST: 'mailpit',
      SMTP_PORT: '1025', SMTP_FROM_ADDRESS: 'test@bnbu.invalid', SMTP_SECURE: 'false',
    });
    const { AppModule } = (await import(compiledModule('app.module.js'))) as {
      AppModule: Type<unknown>;
    };
    const { RUNTIME_CONFIG } = (await import(
      compiledModule('common/config/runtime-config.module.js')
    )) as { RUNTIME_CONFIG: symbol };
    const { RequestIdMiddleware } = (await import(compiledModule('common/http/request-id.js'))) as {
      RequestIdMiddleware: Type<RequestIdMiddlewareType>;
    };
    const { BodyParserErrorMiddleware } = (await import(
      compiledModule('common/http/body-parser-error.middleware.js')
    )) as { BodyParserErrorMiddleware: Type<BodyParserErrorMiddlewareType> };
    const { validationException } = (await import(compiledModule('common/http/validation.js'))) as {
      validationException: typeof ValidationExceptionFactory;
    };
    const module = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = module.createNestApplication({ bodyParser: false });
    const config = app.get<RuntimeConfig>(RUNTIME_CONFIG);
    const requestIds = app.get(RequestIdMiddleware);
    const bodyParserErrors = app.get(BodyParserErrorMiddleware);
    app.use(requestIds.use.bind(requestIds));
    app.use(json({ limit: config.requestBodyLimitBytes, strict: true }));
    app.use(
      urlencoded({ extended: false, limit: config.requestBodyLimitBytes, parameterLimit: 100 }),
    );
    app.use(bodyParserErrors.use.bind(bodyParserErrors));
    app.useGlobalPipes(
      new ValidationPipe({
        transform: true,
        whitelist: true,
        forbidNonWhitelisted: true,
        forbidUnknownValues: true,
        exceptionFactory: validationException,
      }),
    );
    app.setGlobalPrefix('api/v1');
    await app.listen(port, '127.0.0.1');
    baseUrl = `http://127.0.0.1:${port}`;
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
    await prisma.v81AccountSecurity.createMany({ data:
      [fixture.teacherUserId, fixture.teacherBUserId, fixture.adminUserId].map(userId => ({
        userId, organizationId: fixture.organizationId,
        loginAccount: userId === fixture.adminUserId ? fixture.adminEmail : null,
        mustChangePassword: false, passwordChangedAt: new Date(),
      })) });
    await prisma.v81AdminAccess.create({ data: {
      userId: fixture.adminUserId, organizationId: fixture.organizationId,
      kind: 'SUPER', permissions: [], mustChangePassword: false,
    } });
  });

  after(async () => {
    await app.close();
    await prisma.$disconnect();
  });

  const login = async (account: string): Promise<string> => {
    const response = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account, password: TEST_PASSWORD }),
    });
    assert.equal(response.status, 200, JSON.stringify(response.body));
    return String(object(response.body.data).accessToken);
  };

  const tokenFor = async (userId: string, role: 'STUDENT' | 'ADMIN'): Promise<string> => {
    const session = await prisma.authSession.findFirstOrThrow({ where: { userId } });
    const seconds = Math.floor(Date.now() / 1000);
    return new SignJWT({
      organizationId: session.organizationId,
      role,
      sessionId: session.id,
      tokenVersion: 0,
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setSubject(userId)
      .setJti(uuidv7())
      .setIssuer('bnbu-sports-test')
      .setAudience('bnbu-sports-test-clients')
      .setIssuedAt(seconds)
      .setExpirationTime(seconds + 600)
      .sign(await importPKCS8(TEST_PRIVATE_KEY, 'EdDSA'));
  };

  const data = (result: HttpResult, status = 200) => {
    assert.equal(result.status, status, JSON.stringify(result.body));
    return object(result.body.data);
  };

  it('confirms one course settlement and preserves its report when switching semesters', async () => {
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    await prisma.v81AccountSecurity.create({ data: { userId: fixture.teacherCUserId, organizationId: fixture.isolationOrganizationId,
      mustChangePassword: false, passwordChangedAt: new Date() } });
    const otherTeacherTokens = [{ token: await login(fixture.teacherBEmail) }, { token: await login(fixture.teacherCEmail) }];
    const businessRequest = async (path: string, token: string | null, input?: Record<string, unknown>, key = uuidv7()) => {
      const init = authenticated(token ?? '', input === undefined ? 'GET' : 'POST', input, key);
      if (token === null) delete (init.headers as Record<string, string>).authorization;
      const result = await request(`/api/v1${path}`, init);
      assert.ok(result.status >= 200 && result.status < 300, JSON.stringify(result.body));
      return object(result.body.data);
    };
    const unused = await prisma.classSection.findMany({ where: { organizationId: fixture.organizationId,
      semesterId: fixture.semesterId, id: { not: fixture.teacherAActiveSectionId } }, select: { id: true } });
    assert.equal(await prisma.enrollment.count({ where: { classSectionId: { in: unused.map(row => row.id) } } }), 0);
    await prisma.classSection.updateMany({ where: { id: { in: unused.map(row => row.id) } }, data: { semesterId: fixture.archivedSemesterId } });
    const student = await seedExerciseSessionStudent(prisma, fixture, 'SETTLE');
    const outside = await seedExerciseSessionStudent(prisma, fixture, 'EXTRA');
    await prisma.studentProfile.update({ where: { id: student.studentId }, data: { gender: 'MALE' } });
    const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { id: student.studentId } });
    const now = new Date(), importId = uuidv7();
    await prisma.officialRosterImport.create({ data: { id: importId, organizationId: fixture.organizationId,
      classSectionId: fixture.teacherAActiveSectionId, versionNumber: 1, source: 'FILE', fileName: 'synthetic-settlement.csv',
      sourceFileStorageKey: 'synthetic/settlement.csv', fileChecksumSha256: 'a'.repeat(64),
      fieldMappingSnapshot: { studentNumber: 'student_number', fullName: 'full_name' }, status: 'RECEIVED',
      importedBy: fixture.teacherUserId, importedAt: now, createdAt: now, isCurrent: false } });
    await prisma.officialRosterImport.update({ where: { id: importId }, data: { status: 'VALIDATING', version: { increment: 1 } } });
    await prisma.officialRosterEntry.create({ data: { id: uuidv7(), organizationId: fixture.organizationId,
      rosterImportId: importId, classSectionId: fixture.teacherAActiveSectionId, sourceRowNumber: 2,
      normalizedStudentNumber: profile.studentNumber, rawStudentNumberSafe: profile.studentNumber, fullName: profile.fullName,
      rowValidationStatus: 'VALID', rowErrorCodes: [], rawRowSnapshotSafe: {}, createdAt: now } });
    const source = await prisma.officialRosterImport.update({ where: { id: importId }, data: { status: 'VALIDATED', totalRowCount: 1,
      validRowCount: 1, isCurrent: true, version: { increment: 1 } } });
    await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: {
      dailyStartTime: new Date('1970-01-01T00:00:00Z'), dailyEndTime: new Date('1970-01-01T23:59:59Z') } });
    const { seedHistoricalSettlementRules, probeSettlementHttp } = await import('../../../tools/local-integration/v81-settlement-http-probe.mjs');
    await seedHistoricalSettlementRules({ prisma, fixture });
    const certificationStudentToken = await tokenFor(student.userId, 'STUDENT');
    const proofId = uuidv7();
    await prisma.mediaEvidence.create({ data: { id: proofId, organizationId: fixture.organizationId,
      ownerStudentId: student.studentId, enrollmentId: student.enrollmentId, initiatedByUserId: student.userId,
      businessPurpose: 'EXEMPTION_APPLICATION', mediaType: 'IMAGE', captureSource: 'FILE_PICKER',
      declaredMimeType: 'image/png', verifiedMimeType: 'image/png', declaredFileSizeBytes: 45n,
      verifiedFileSizeBytes: 45n, declaredContentSha256: 'b'.repeat(64), verifiedContentSha256: 'b'.repeat(64),
      uploadStatus: 'AVAILABLE', storageKey: `synthetic/${proofId}/evidence.png`, uploadedAt: now,
      boundAt: now, processingStartedAt: now, availableAt: now, createdAt: now, updatedAt: now } });
    const certificationDraft = await businessRequest('/exemption-applications', certificationStudentToken, {
      enrollmentId: student.enrollmentId, applicationType: 'EXERCISE_CHECK_IN', applicationSubtype: 'SCHOOL_TEAM',
      organizationName: 'Synthetic settlement team', reason: 'Synthetic old participation', mediaIds: [proofId] });
    const certificationPath = `/exemption-applications/${certificationDraft.id}`;
    const certificationSubmitted = await businessRequest(`${certificationPath}/submit`, certificationStudentToken,
      { expectedVersion: certificationDraft.version });
    const certificationApproved = await businessRequest(`${certificationPath}/review`, teacherToken,
      { expectedVersion: certificationSubmitted.version, decision: 'APPROVE', publicComment: 'Synthetic verified old fact',
        courseMinutes: 30, generalMinutes: 15 });

    await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: {
      status: 'CLOSED', isEnrollmentOpen: false, closedAt: now, closedBy: fixture.teacherUserId,
      closeReason: 'Synthetic closed course', version: { increment: 1 } } });
    await businessRequest(`/roster-imports/${importId}/confirmation`, teacherToken, { expectedVersion: source.version });
    await businessRequest(`/enrollments/${student.enrollmentId}/physical-results`, teacherToken,
      { runType: '1000m', elapsedSeconds: 270, testedOn: '2026-09-07', expectedVersion: 0 });
    await businessRequest(`/enrollments/${student.enrollmentId}/final-grades`, teacherToken,
      { finalGrade: 123, published: true, expectedVersion: 0 });
    process.env.V81_SETTLED_SEMESTER_SWITCH = '1';
    process.env.V81_SEMESTER_MAINTENANCE = '1';
    await probeSettlementHttp({ prisma, fixture, request: businessRequest, baseUrl: `${baseUrl}/api/v1`,
      teacherToken, adminToken, otherTeacherTokens, outside });
    const studentToken = await tokenFor(student.userId, 'STUDENT');
    const studentPath = `/api/v1/student/enrollments/${student.enrollmentId}/settlement-result`;
    const own = data(await request(studentPath, authenticated(studentToken)));
    assert.equal(own.available, true); assert.equal(own.reportVersion, 1);
    assert.doesNotMatch(JSON.stringify(own), /finalGrade|fullName|studentNumber|actorId|correctionReason|reportSha256|"rank"/);
    const rows = await prisma.$queryRaw<{ report: Record<string, unknown> }[]>`SELECT report FROM v81_settlement_report_revisions
      WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid AND version=1`;
    const reportRows = rows[0]!.report.rows as Record<string, unknown>[];
    assert.ok(reportRows[0]!.finalGrade);
    for (const actor of [teacherToken, adminToken]) assert.equal((await request(studentPath, authenticated(actor))).status, 403);
    const otherStudentToken = await tokenFor(outside.userId, 'STUDENT');
    assert.equal((await request(studentPath, authenticated(otherStudentToken))).status, 404);
    const readMailboxJson = (url: string) => new Promise((resolve, reject) => {
      const incoming = get(url, response => {
        if (response.statusCode !== 200) { response.resume(); reject(new Error(`Mailbox HTTP ${response.statusCode}`)); return; }
        let text = ''; response.setEncoding('utf8');
        response.on('data', chunk => { text += chunk; });
        response.on('error', reject);
        response.on('end', () => { try { resolve(JSON.parse(text)); } catch (error) { reject(error); } });
      });
      incoming.setTimeout(5000, () => incoming.destroy(new Error('Mailbox request timed out')));
      incoming.on('error', reject);
    });
    const { probePhysicalCorrection } = await import('../../../tools/local-integration/v81-physical-correction-probe.mjs');
    await probePhysicalCorrection({ prisma, fixture, request: businessRequest, baseUrl: `${baseUrl}/api/v1`,
      outside, teacherToken, adminToken, otherTeacherTokens, readMailboxJson });
    const { probeFinalGradeCorrection } = await import('../../../tools/local-integration/v81-final-grade-correction-probe.mjs');
    await probeFinalGradeCorrection({ prisma, fixture, request: businessRequest, baseUrl: `${baseUrl}/api/v1`,
      student, teacherToken, adminToken, token: studentToken, otherTeacherTokens });
    const readReports = () => prisma.$queryRaw<{ id: string; version: number; report: Record<string, unknown>; report_sha256: string }[]>`
      SELECT id,version,report,report_sha256 FROM v81_settlement_report_revisions
      WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid ORDER BY version`;
    const beforeCorrection = await readReports();
    assert.equal((await prisma.semester.findUniqueOrThrow({ where: { id: fixture.semesterId } })).status, 'ARCHIVED');
    const adjustmentPath = `/api/v1/activity-certification-applications/${certificationApproved.id}/recognition-allocation-revisions`;
    const correctionInput = { expectedVersion: certificationApproved.version, reason: 'Synthetic old participation correction after archival',
      courseMinutes: 15, generalMinutes: 20 };
    assert.equal((await request(adjustmentPath, authenticated(studentToken, 'POST', correctionInput, uuidv7()))).status, 403);
    assert.equal((await request(adjustmentPath, authenticated(otherTeacherTokens[0]!.token, 'POST', correctionInput, uuidv7()))).status, 404);
    const recognitionSnapshot = async () => ({
      application: await prisma.exemptionApplication.findUniqueOrThrow({ where: { id: String(certificationApproved.id) } }),
      credit: await prisma.v81CertificationCredit.findUniqueOrThrow({ where: { applicationId: String(certificationApproved.id) } }),
      reviews: await prisma.exemptionReviewRecord.findMany({ where: { applicationId: String(certificationApproved.id) }, orderBy: { reviewVersion: 'asc' } }),
      notifications: await prisma.notification.findMany({ where: { targetId: String(certificationApproved.id) }, orderBy: { id: 'asc' } }),
      events: await prisma.$queryRaw`SELECT * FROM v81_events WHERE resource_id=${String(certificationApproved.id)}::uuid ORDER BY id`,
      audit: await prisma.auditLog.findMany({ where: { targetId: String(certificationApproved.id) }, orderBy: { id: 'asc' } }),
      reports: await readReports(),
    });
    const rejectReport = async (action: () => Promise<void>) => {
      await prisma.$executeRawUnsafe("CREATE FUNCTION probe_reject_recognition_report() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'Synthetic recognition report failure'; END; $$");
      try {
        await prisma.$executeRawUnsafe("CREATE TRIGGER probe_reject_recognition_report BEFORE INSERT ON v81_settlement_report_revisions FOR EACH ROW WHEN (NEW.kind='CORRECTION') EXECUTE FUNCTION probe_reject_recognition_report()");
        try { await action(); } finally { await prisma.$executeRawUnsafe('DROP TRIGGER probe_reject_recognition_report ON v81_settlement_report_revisions'); }
      } finally { await prisma.$executeRawUnsafe('DROP FUNCTION probe_reject_recognition_report()'); }
    };
    const correctionKey = uuidv7();
    const beforeFailure = await recognitionSnapshot();
    await rejectReport(async () => {
      assert.equal((await request(adjustmentPath, authenticated(teacherToken, 'POST', correctionInput, correctionKey))).status, 500);
      assert.deepEqual(await recognitionSnapshot(), beforeFailure);
    });
    const corrected = data(await request(adjustmentPath, authenticated(teacherToken, 'POST', correctionInput, correctionKey)), 201);
    assert.deepEqual(data(await request(adjustmentPath, authenticated(teacherToken, 'POST', correctionInput, correctionKey)), 201), corrected);
    assert.equal((await request(adjustmentPath, authenticated(teacherToken, 'POST', correctionInput, uuidv7()))).status, 409);
    const afterCorrection = await readReports();
    assert.deepEqual(afterCorrection.slice(0, -1), beforeCorrection);
    assert.equal(afterCorrection.length, beforeCorrection.length + 1);
    const correction = object(afterCorrection.at(-1)!.report.correction);
    assert.equal(correction.applicationId, certificationApproved.id);
    assert.equal(correction.recognitionVersion, corrected.version);
    assert.equal(correction.previousReportId, beforeCorrection.at(-1)!.id);
    assert.equal(correction.reason, correctionInput.reason);
    const credit = await prisma.v81CertificationCredit.findUniqueOrThrow({ where: { applicationId: String(corrected.id) } });
    assert.equal(credit.courseMinutes, 15); assert.equal(credit.generalMinutes, 20);
    assert.equal(data(await request(studentPath, authenticated(studentToken))).reportVersion, afterCorrection.at(-1)!.version);
    const adjustedProgress = object(object((afterCorrection.at(-1)!.report.rows as Record<string, unknown>[])[0]).progress);
    assert.equal(object(adjustedProgress.course).recognizedSeconds, 900);
    assert.equal(object(adjustedProgress.general).recognizedSeconds, 1200);
    const revokePath = `/api/v1/activity-certification-applications/${certificationApproved.id}/revoke`;
    const revokeInput = { expectedVersion: corrected.version, reason: 'Synthetic old fact revoked after archival' }, revokeKey = uuidv7();
    const beforeRevoke = await recognitionSnapshot();
    await rejectReport(async () => {
      assert.equal((await request(revokePath, authenticated(teacherToken, 'POST', revokeInput, revokeKey))).status, 500);
      assert.deepEqual(await recognitionSnapshot(), beforeRevoke);
    });
    assert.equal((await request(revokePath, authenticated(studentToken, 'POST', revokeInput, uuidv7()))).status, 403);
    assert.equal((await request(revokePath, authenticated(otherTeacherTokens[0]!.token, 'POST', revokeInput, uuidv7()))).status, 404);
    const revoked = data(await request(revokePath, authenticated(teacherToken, 'POST', revokeInput, revokeKey)), 201);
    assert.equal(revoked.status, 'REVOKED');
    assert.deepEqual(data(await request(revokePath, authenticated(teacherToken, 'POST', revokeInput, revokeKey)), 201), revoked);
    assert.equal((await request(revokePath, authenticated(teacherToken, 'POST', revokeInput, uuidv7()))).status, 409);
    const revokedReports = await readReports();
    assert.deepEqual(revokedReports.slice(0, -1), afterCorrection);
    assert.equal(revokedReports.length, afterCorrection.length + 1);
    const revokedProgress = object(object((revokedReports.at(-1)!.report.rows as Record<string, unknown>[])[0]).progress);
    assert.equal(object(revokedProgress.course).recognizedSeconds, 0);
    assert.equal(object(revokedProgress.general).recognizedSeconds, 0);
    assert.equal((await prisma.v81CertificationCredit.findUniqueOrThrow({ where: { applicationId: String(revoked.id) } })).active, false);
    assert.equal(data(await request(studentPath, authenticated(studentToken))).reportVersion, revokedReports.at(-1)!.version);



  });
});
