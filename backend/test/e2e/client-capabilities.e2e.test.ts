import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';
import { importPKCS8, SignJWT } from 'jose';
import { AuthCodeCrypto } from '../../src/modules/client-capabilities/auth-code.crypto.js';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import {
  foundationEnvironment,
  requireTestDatabaseUrl,
  TEST_PASSWORD,
  TEST_PRIVATE_KEY,
} from '../helpers/test-environment.js';
import { seedSubmittedExerciseRecord } from '../helpers/exercise-review.js';
import { seedExerciseSessionStudent } from '../helpers/exercise-session.js';

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
}

interface AuthData {
  sessionId: string;
  accessToken: string;
}

function object(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function array(value: unknown): unknown[] {
  assert.ok(Array.isArray(value));
  return value;
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === 'object');
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return address.port;
}

describe('Stage 21 client capabilities with real PostgreSQL', () => {
  let prisma: PrismaClient;
  let fixture: FoundationFixture;
  let child: ChildProcessWithoutNullStreams;
  let baseUrl: string;
  let childOutput = '';

  const request = async (path: string, init: RequestInit = {}): Promise<HttpResult> => {
    const response = await fetch(`${baseUrl}${path}`, init);
    const text = await response.text();
    return {
      status: response.status,
      body: text.length === 0 ? {} : (JSON.parse(text) as Record<string, unknown>),
    };
  };

  const login = async (
    account = fixture.teacherEmail,
  ): Promise<{ result: HttpResult; data: AuthData }> => {
    const result = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account, password: TEST_PASSWORD }),
    });
    return { result, data: object(result.body.data) as unknown as AuthData };
  };

  const authorization = (accessToken: string): Record<string, string> => ({
    authorization: `Bearer ${accessToken}`,
  });

  const authCodeCrypto = (): AuthCodeCrypto => {
    const securityHashKey = 'synthetic-test-hmac-key-never-use-in-production';
    const derive = (purpose: string): Buffer =>
      createHmac('sha256', securityHashKey).update(`auth-code:${purpose}:v1`).digest();
    return new AuthCodeCrypto({
      digestKey: derive('digest'),
      escrowKey: derive('escrow'),
      escrowKeyVersion: 1,
    });
  };

  const studentAccessToken = async (
    userId: string,
    sessionId: string,
    tokenVersion = 0,
  ): Promise<string> => {
    const seconds = Math.floor(Date.now() / 1000);
    return new SignJWT({
      organizationId: fixture.organizationId,
      role: 'STUDENT',
      sessionId,
      tokenVersion,
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

  before(async () => {
    const databaseUrl = requireTestDatabaseUrl();
    prisma = createTestPrisma(databaseUrl);
    await resetFoundationDatabase(prisma);
    await seedFoundationFixture(prisma);
    const port = await availablePort();
    baseUrl = `http://127.0.0.1:${port}`;
    child = spawn(process.execPath, ['--enable-source-maps', 'dist/main.js'], {
      cwd: new URL('../..', import.meta.url),
      env: { ...foundationEnvironment(databaseUrl, port), LOG_LEVEL: 'error' },
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => (childOutput += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (childOutput += chunk.toString()));

    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Backend exited during startup: ${childOutput}`);
      try {
        const response = await fetch(`${baseUrl}/api/v1/health/live`);
        if (response.ok) return;
      } catch {
        // The compiled server may still be starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Backend did not become live: ${childOutput}`);
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    fixture = await seedFoundationFixture(prisma);
    await prisma.v81AccountSecurity.createMany({
      data: [fixture.teacherUserId, fixture.teacherBUserId, fixture.adminUserId].map((userId) => ({
        userId,
        organizationId: fixture.organizationId,
        loginAccount: userId === fixture.adminUserId ? fixture.adminEmail : null,
        mustChangePassword: false,
        passwordChangedAt: new Date(),
      })),
    });
    await prisma.v81AdminAccess.create({
      data: {
        userId: fixture.adminUserId, organizationId: fixture.organizationId,
        kind: 'SUB', permissions: ['GLOBAL_RULES'], mustChangePassword: false,
      },
    });
  });

  after(async () => {
    child.kill();
    await prisma.$disconnect();
  });

  it('keeps student account deletion deferred with no challenge or account mutation', async () => {
    const student = await seedExerciseSessionStudent(prisma, fixture, 'DEFERRED');
    const token = await studentAccessToken(student.userId, student.authSessionId);
    const before = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
    const key = uuidv7();
    const init = { method: 'POST', headers: { ...authorization(token),
      'content-type': 'application/json', 'idempotency-key': key },
      body: JSON.stringify({ expectedVersion: before.version, locale: 'zh-CN' }) };
    for (let attempt = 0; attempt < 2; attempt++) {
      const result = await request('/api/v1/me/account-deletion-challenges', init);
      assert.equal(result.status, 503, JSON.stringify(result.body));
      assert.equal(result.body.code, 'SYSTEM_SERVICE_UNAVAILABLE');
      assert.equal(object(result.body.details).currentState, 'FEATURE_DEFERRED');
    }
    const teacher = await login();
    const denied = await request('/api/v1/me/account-deletion-challenges',
      { ...init, headers: { ...init.headers, ...authorization(teacher.data.accessToken) } });
    assert.equal(denied.status, 403);
    assert.deepEqual(await prisma.user.findUniqueOrThrow({ where: { id: student.userId } }), before);
    const rows = await prisma.$queryRaw<{ count: number }[]>`SELECT count(*)::int AS count
      FROM v81_account_deletion_challenges WHERE user_id=${student.userId}::uuid`;
    assert.equal(rows[0]!.count, 0);
    assert.equal((await request('/api/v1/me', { headers: authorization(token) })).status, 200);
  });

  it('accepts an organization-scoped student challenge without exposing its code and keeps an empty release policy fail-closed', async () => {
    const signInCode = await request('/api/v1/auth/student-sign-in-codes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({
        organizationCode: 'BNBU-TEST',
        account: 'synthetic@invalid.test',
        channel: 'EMAIL',
        locale: 'zh-CN',
      }),
    });
    assert.equal(signInCode.status, 202, `${JSON.stringify(signInCode.body)}\n${childOutput}`);
    const challenge = object(signInCode.body.data);
    assert.equal(typeof challenge.challengeId, 'string');
    assert.equal('code' in challenge, false);
    assert.equal(
      await prisma.studentSignInChallenge.count({
        where: { id: challenge.challengeId as string, status: 'ACTIVE', userId: null },
      }),
      1,
    );

    const release = await request('/api/v1/app-release-policy?platform=IOS');
    assert.equal(release.status, 503);
    assert.equal(release.body.code, 'SYSTEM_MODE_UNSUPPORTED');
  });

  it('rejects PHONE without creating a challenge and activates a pending student through first email binding', async () => {
    const phoneAttempt = await request('/api/v1/auth/student-sign-in-codes', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({
        organizationCode: 'BNBU-TEST',
        account: 'synthetic@invalid.test',
        channel: 'PHONE',
        locale: 'zh-CN',
      }),
    });
    assert.equal(phoneAttempt.status, 422);
    assert.equal(await prisma.studentSignInChallenge.count(), 0);

    const student = await seedExerciseSessionStudent(prisma, fixture, 'EMAIL-FIRST-BIND');
    await prisma.user.update({
      where: { id: student.userId },
      data: {
        status: 'PENDING_CONTACT_BINDING',
        primaryEmail: null,
        primaryEmailNormalized: null,
        emailVerifiedAt: null,
      },
    });
    const accessToken = await studentAccessToken(student.userId, student.authSessionId);
    const meBefore = await request('/api/v1/me', {
      headers: authorization(accessToken),
    });
    assert.equal(meBefore.status, 200);
    const beforeUser = object(object(meBefore.body.data).user);
    assert.equal(beforeUser.status, 'PENDING_CONTACT_BINDING');
    assert.equal('primaryPhoneMasked' in beforeUser, false);
    assert.equal('phoneVerified' in beforeUser, false);

    const blocked = await request('/api/v1/me/preferences', {
      headers: authorization(accessToken),
    });
    assert.equal(blocked.status, 409);
    assert.equal(blocked.body.code, 'USER_STATUS_NOT_ACTIVE');

    const targetEmail = 'pending.student@invalid.test';
    const requested = await request('/api/v1/me/email-verification-challenges', {
      method: 'POST',
      headers: {
        ...authorization(accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        email: targetEmail,
        locale: 'en',
        expectedVersion: beforeUser.version,
      }),
    });
    assert.equal(requested.status, 202, JSON.stringify(requested.body));
    const challenge = object(requested.body.data);
    assert.equal(challenge.mode, 'FIRST_BIND');

    const newCode = '246810';
    const challengeId = String(challenge.challengeId);
    await prisma.emailVerificationChallenge.update({
      where: { id: challengeId },
      data: {
        newEmailCodeDigest: authCodeCrypto().digestCode(
          `EMAIL_VERIFICATION:NEW:${challengeId}`,
          newCode,
        ),
      },
    });
    const otherSessionId = uuidv7();
    const now = new Date();
    await prisma.authSession.create({
      data: {
        id: otherSessionId,
        organizationId: fixture.organizationId,
        userId: student.userId,
        status: 'ACTIVE',
        tokenFamilyId: uuidv7(),
        createdAt: now,
        lastSeenAt: now,
        absoluteExpiresAt: new Date(now.getTime() + 3_600_000),
        idleExpiresAt: new Date(now.getTime() + 3_600_000),
      },
    });
    const verified = await request(
      `/api/v1/me/email-verification-challenges/${challengeId}/verify`,
      {
        method: 'POST',
        headers: {
          ...authorization(accessToken),
          'content-type': 'application/json',
          'idempotency-key': uuidv7(),
        },
        body: JSON.stringify({ newEmailCode: newCode }),
      },
    );
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const afterUser = object(object(verified.body.data).user);
    assert.equal(afterUser.status, 'ACTIVE');
    assert.equal(afterUser.emailVerified, true);
    assert.equal('primaryPhoneMasked' in afterUser, false);
    assert.equal(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: otherSessionId } })).status,
      'REVOKED',
    );
    const stored = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
    assert.equal(stored.primaryEmailNormalized, targetEmail);
    const audit = await prisma.auditLog.findFirst({ where: { targetId: student.userId } });
    assert.equal(JSON.stringify(audit).includes(targetEmail), false);
  });

  it('requires both current and new mailbox codes for email rebinding', async () => {
    const student = await seedExerciseSessionStudent(prisma, fixture, 'EMAIL-REBIND');
    const accessToken = await studentAccessToken(student.userId, student.authSessionId);
    const current = await request('/api/v1/me', { headers: authorization(accessToken) });
    const user = object(object(current.body.data).user);
    const targetEmail = 'rebound.student@invalid.test';
    const requested = await request('/api/v1/me/email-verification-challenges', {
      method: 'POST',
      headers: {
        ...authorization(accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        email: targetEmail,
        locale: 'zh-CN',
        expectedVersion: user.version,
      }),
    });
    assert.equal(requested.status, 202, JSON.stringify(requested.body));
    const challenge = object(requested.body.data);
    assert.equal(challenge.mode, 'REBIND');
    const challengeId = String(challenge.challengeId);
    const currentCode = '135791';
    const newCode = '864209';
    await prisma.emailVerificationChallenge.update({
      where: { id: challengeId },
      data: {
        currentEmailCodeDigest: authCodeCrypto().digestCode(
          `EMAIL_VERIFICATION:CURRENT:${challengeId}`,
          currentCode,
        ),
        newEmailCodeDigest: authCodeCrypto().digestCode(
          `EMAIL_VERIFICATION:NEW:${challengeId}`,
          newCode,
        ),
      },
    });

    const missingCurrent = await request(
      `/api/v1/me/email-verification-challenges/${challengeId}/verify`,
      {
        method: 'POST',
        headers: {
          ...authorization(accessToken),
          'content-type': 'application/json',
          'idempotency-key': uuidv7(),
        },
        body: JSON.stringify({ newEmailCode: newCode }),
      },
    );
    assert.equal(missingCurrent.status, 401);
    assert.equal(missingCurrent.body.code, 'AUTH_VERIFICATION_CODE_INVALID');

    const verified = await request(
      `/api/v1/me/email-verification-challenges/${challengeId}/verify`,
      {
        method: 'POST',
        headers: {
          ...authorization(accessToken),
          'content-type': 'application/json',
          'idempotency-key': uuidv7(),
        },
        body: JSON.stringify({ currentEmailCode: currentCode, newEmailCode: newCode }),
      },
    );
    assert.equal(verified.status, 200, JSON.stringify(verified.body));
    const rebound = object(object(verified.body.data).user);
    assert.equal(rebound.emailVerified, true);
    assert.notEqual(rebound.primaryEmailMasked, student.email);
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: student.userId } }))
        .primaryEmailNormalized,
      targetEmail,
    );
  });

  it('uses the numeric iOS build number for enforcement and keeps marketing version display-only', async () => {
    const now = new Date();
    await prisma.appReleasePolicy.create({
      data: {
        id: uuidv7(),
        platform: 'IOS',
        minimumSupportedVersion: '1.2.0',
        latestVersion: '1.4.0',
        minimumSupportedBuildNumber: 120,
        latestBuildNumber: 140,
        enforcement: 'RECOMMENDED',
        message: 'Synthetic staging policy only.',
        downloadUrl: 'https://apps.apple.com/app/id000000000',
        effectiveAt: new Date(now.getTime() - 60_000),
        expiresAt: new Date(now.getTime() + 3_600_000),
        policyVersion: 'ios-synthetic-v1',
        createdAt: now,
      },
    });

    const response = await request(
      '/api/v1/app-release-policy?platform=IOS&currentVersion=99.99.99&currentBuildNumber=119',
    );
    assert.equal(response.status, 200);
    const data = object(response.body.data);
    assert.equal(data.platform, 'IOS');
    assert.equal(data.enforcement, 'REQUIRED');
    assert.equal(data.minimumSupportedBuildNumber, 120);
    assert.equal(data.latestBuildNumber, 140);
    assert.equal(data.policyVersion, 'ios-synthetic-v1');
    assert.equal('id' in data, false);
    assert.equal('createdAt' in data, false);
  });

  it('establishes a student OTP session and completes the private exemption-media review flow', async () => {
    const student = await seedExerciseSessionStudent(prisma, fixture, 'EXEMPTION-IOS');
    const challengeId = uuidv7();
    const code = '314159';
    const now = new Date();
    await prisma.studentSignInChallenge.create({
      data: {
        id: challengeId,
        organizationId: fixture.organizationId,
        userId: student.userId,
        channel: 'EMAIL',
        locale: 'zh-CN',
        accountDigest: 'a'.repeat(64),
        sourceIpDigest: null,
        codeDigest: authCodeCrypto().digestCode(`STUDENT_SIGN_IN:${challengeId}`, code),
        codeKeyVersion: 1,
        status: 'ACTIVE',
        failedAttempts: 0,
        maxAttempts: 5,
        requestedAt: now,
        deliveredAt: now,
        expiresAt: new Date(now.getTime() + 600_000),
        requestId: uuidv7(),
      },
    });
    const verified = await request('/api/v1/auth/student-sign-in-codes/verify', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ challengeId, code, deviceId: 'synthetic-ios-device' }),
    });
    assert.equal(verified.status, 200);
    const studentAuth = object(verified.body.data) as unknown as AuthData;
    assert.equal(typeof studentAuth.accessToken, 'string');
    assert.equal(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: studentAuth.sessionId } }))
        .deviceIdHash?.length,
      64,
    );

    const mediaId = uuidv7();
    await prisma.mediaEvidence.create({
      data: {
        id: mediaId,
        organizationId: fixture.organizationId,
        ownerStudentId: student.studentId,
        sessionId: null,
        enrollmentId: student.enrollmentId,
        initiatedByUserId: student.userId,
        businessPurpose: 'EXEMPTION_APPLICATION',
        mediaType: 'IMAGE',
        captureSource: 'FILE_PICKER',
        declaredMimeType: 'image/png',
        verifiedMimeType: 'image/png',
        declaredFileSizeBytes: 45n,
        verifiedFileSizeBytes: 45n,
        declaredContentSha256: 'b'.repeat(64),
        verifiedContentSha256: 'b'.repeat(64),
        uploadStatus: 'AVAILABLE',
        storageKey: `media/${fixture.organizationId}/${mediaId}/exemption.png`,
        uploadedAt: now,
        boundAt: now,
        processingStartedAt: now,
        availableAt: now,
        createdAt: now,
        updatedAt: now,
      },
    });
    const invalidDetails = await request('/api/v1/exemption-applications', {
      method: 'POST',
      headers: {
        ...authorization(studentAuth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        enrollmentId: student.enrollmentId,
        applicationType: 'PHYSICAL_TEST',
        applicationSubtype: 'SCHOOL_TEAM',
        organizationName: null,
        reason: 'Invalid synthetic subtype combination.',
        mediaIds: [mediaId],
      }),
    });
    assert.equal(invalidDetails.status, 422);
    assert.equal(invalidDetails.body.code, 'VALIDATION_FAILED');
    assert.deepEqual(object(invalidDetails.body.details).fieldErrors, [
      {
        field: 'applicationSubtype',
        code: 'INVALID',
        i18nKey: 'error.validation.failed',
        params: {},
      },
    ]);

    const created = await request('/api/v1/exemption-applications', {
      method: 'POST',
      headers: {
        ...authorization(studentAuth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        enrollmentId: student.enrollmentId,
        applicationType: 'PHYSICAL_TEST',
        applicationSubtype: 'RUN_800M',
        organizationName: null,
        reason: 'Synthetic exemption evidence for iOS integration.',
        mediaIds: [mediaId],
      }),
    });
    assert.equal(created.status, 201);
    const draft = object(created.body.data);
    assert.equal(draft.status, 'DRAFT');
    assert.equal('applicationSubtype' in draft, false);
    assert.equal('organizationName' in draft, false);
    assert.deepEqual(draft.mediaIds, [mediaId]);

    const listedDrafts = await request('/api/v1/exemption-applications?status=DRAFT&limit=20', {
      headers: authorization(studentAuth.accessToken),
    });
    assert.equal(listedDrafts.status, 200);
    assert.equal(array(listedDrafts.body.data).length, 1);
    const structuredDrafts = await request(
      '/api/v1/exemption-application-details?status=DRAFT&limit=20',
      { headers: authorization(studentAuth.accessToken) },
    );
    assert.equal(structuredDrafts.status, 200);
    const structuredDraft = array(structuredDrafts.body.data).find(
      (item) => object(item).id === draft.id,
    );
    assert.notEqual(structuredDraft, undefined);
    assert.equal(object(structuredDraft).applicationSubtype, 'RUN_800M');
    assert.equal(object(structuredDraft).organizationName, null);
    const fetchedDraft = await request(`/api/v1/exemption-applications/${String(draft.id)}`, {
      headers: authorization(studentAuth.accessToken),
    });
    assert.equal(fetchedDraft.status, 200);
    const updatedDraft = await request(`/api/v1/exemption-applications/${String(draft.id)}`, {
      method: 'PATCH',
      headers: {
        ...authorization(studentAuth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        reason: 'Updated synthetic exemption evidence for iOS integration.',
        expectedVersion: draft.version,
      }),
    });
    assert.equal(updatedDraft.status, 200);
    const updatedDraftData = object(updatedDraft.body.data);

    const submitted = await request(`/api/v1/exemption-applications/${String(draft.id)}/submit`, {
      method: 'POST',
      headers: {
        ...authorization(studentAuth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({ expectedVersion: updatedDraftData.version }),
    });
    assert.equal(submitted.status, 200);
    assert.equal(object(submitted.body.data).status, 'SUBMITTED');

    const { data: teacherAuth } = await login();
    const reviewed = await request(`/api/v1/exemption-applications/${String(draft.id)}/review`, {
      method: 'POST',
      headers: {
        ...authorization(teacherAuth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        decision: 'APPROVE',
        publicComment: 'Synthetic approval.',
        internalNote: 'Internal synthetic note must not project.',
        expectedVersion: object(submitted.body.data).version,
      }),
    });
    assert.equal(reviewed.status, 200);
    const approved = object(reviewed.body.data);
    assert.equal(approved.status, 'APPROVED');
    assert.equal('internalNote' in approved, false);
    assert.equal(
      (
        await prisma.exemptionReviewRecord.findFirstOrThrow({
          where: { applicationId: String(draft.id) },
        })
      ).internalNote,
      'Internal synthetic note must not project.',
    );

    const noMediaDraft = await request('/api/v1/exemption-applications', {
      method: 'POST',
      headers: {
        ...authorization(studentAuth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        enrollmentId: student.enrollmentId,
        applicationType: 'PHYSICAL_TEST',
        applicationSubtype: 'RUN_1000M',
        organizationName: null,
        reason: 'Synthetic draft without evidence.',
        mediaIds: [],
      }),
    });
    assert.equal(noMediaDraft.status, 201);
    const noMediaData = object(noMediaDraft.body.data);
    const rejectedSubmission = await request(
      `/api/v1/exemption-applications/${String(noMediaData.id)}/submit`,
      {
        method: 'POST',
        headers: {
          ...authorization(studentAuth.accessToken),
          'content-type': 'application/json',
          'idempotency-key': uuidv7(),
        },
        body: JSON.stringify({ expectedVersion: noMediaData.version }),
      },
    );
    assert.equal(rejectedSubmission.status, 422);
    assert.equal(rejectedSubmission.body.code, 'EXEMPTION_APPLICATION_MEDIA_INVALID');
  });

  for (const role of ['TEACHER','ADMIN'] as const) {
  it(`completes ${role} recovery and revokes every prior session`, async () => {
    const userId=role==='TEACHER'?fixture.teacherUserId:fixture.adminUserId;
    const email=role==='TEACHER'?fixture.teacherEmail:fixture.adminEmail;
    const { data: existingSession } = await login(email);
    const { data: secondSession } = await login(email);
    const requested = await request('/api/v1/auth/account-recovery-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({
        organizationCode: 'BNBU-TEST',
        account: 'absent.recovery.synthetic@invalid.test',
        requestedRole: role,
        channel: 'EMAIL',
        locale: 'en',
      }),
    });
    assert.equal(requested.status, 202);
    assert.equal(typeof object(requested.body.data).recoveryId, 'string');
    const known = await request('/api/v1/auth/account-recovery-requests', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({organizationCode: 'BNBU-TEST', account: email,
        requestedRole: role, channel: 'EMAIL', locale: 'en'}),
    });
    assert.equal(known.status, 202);
    const issued = await prisma.auditLog.findFirstOrThrow({where: {
      targetId: String(object(known.body.data).recoveryId), actionType: 'AUTH_CHALLENGE_ISSUED',
    }});
    assert.equal(issued.actorUserId, userId);
    assert.equal(issued.actorRoleSnapshot, role);
    const recoveryId = uuidv7();
    const code = '271828';
    const now = new Date();
    await prisma.accountRecoveryChallenge.create({
      data: {
        id: recoveryId,
        organizationId: fixture.organizationId,
        userId,
        requestedRole: role,
        channel: 'EMAIL',
        locale: 'zh-CN',
        accountDigest: 'c'.repeat(64),
        sourceIpDigest: null,
        codeDigest: authCodeCrypto().digestCode(`ACCOUNT_RECOVERY:${recoveryId}`, code),
        codeKeyVersion: 1,
        status: 'ACTIVE',
        failedAttempts: 0,
        maxAttempts: 5,
        requestedAt: now,
        deliveredAt: now,
        expiresAt: new Date(now.getTime() + 600_000),
        requestId: uuidv7(),
      },
    });
    const completed = await request('/api/v1/auth/account-recovery-requests/complete', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({
        recoveryId,
        verificationCode: code,
        newPassword: 'Synthetic-Recovered-Password-2026',
      }),
    });
    assert.equal(completed.status, 200);
    for(const session of [existingSession,secondSession])assert.equal((await request('/api/v1/me',{headers:authorization(session.accessToken)})).status,401);
    assert.equal(await prisma.authSession.count({where:{userId,status:'ACTIVE'}}),0);
    const newLogin=await request('/api/v1/auth/password-login',{method:'POST',headers:{'content-type':'application/json','idempotency-key':uuidv7()},body:JSON.stringify({account:email,password:'Synthetic-Recovered-Password-2026'})});
    assert.equal(newLogin.status,200,JSON.stringify(newLogin.body));

    assert.equal(
      (await prisma.authSession.findUniqueOrThrow({ where: { id: existingSession.sessionId } }))
        .status,
      'REVOKED',
    );
    assert.equal(
      (await prisma.user.findUniqueOrThrow({ where: { id: userId } })).tokenVersion,
      1,
    );
  });

  }

  it('lists and marks only the authenticated user notification with durable evidence', async () => {
    const { data: auth } = await login();
    const notificationId = uuidv7();
    const foreignNotificationId = uuidv7();
    await prisma.notification.createMany({
      data: [
        {
          id: notificationId,
          organizationId: fixture.organizationId,
          recipientUserId: fixture.teacherUserId,
          notificationType: 'COURSE_UPDATE',
          title: 'Synthetic schedule update',
          body: 'A synthetic class time changed.',
          targetType: null,
          targetId: null,
          readAt: null,
          createdAt: new Date(),
          version: 1,
        },
        {
          id: foreignNotificationId,
          organizationId: fixture.organizationId,
          recipientUserId: fixture.teacherBUserId,
          notificationType: 'COURSE_UPDATE',
          title: 'Another user notification',
          body: 'This notification must stay outside the caller projection.',
          targetType: null,
          targetId: null,
          readAt: null,
          createdAt: new Date(),
          version: 1,
        },
      ],
    });

    const listed = await request('/api/v1/notifications?unreadOnly=true&limit=20', {
      headers: authorization(auth.accessToken),
    });
    assert.equal(listed.status, 200);
    assert.equal(array(listed.body.data).length, 1);
    assert.equal(object(array(listed.body.data)[0]).id, notificationId);
    const pagination = object(object(listed.body.meta).pagination);
    assert.equal(pagination.hasMore, false);
    assert.equal(pagination.limit, 20);

    const idempotencyKey = uuidv7();
    const readInit: RequestInit = {
      method: 'POST',
      headers: {
        ...authorization(auth.accessToken),
        'idempotency-key': idempotencyKey,
      },
    };
    const first = await request(`/api/v1/notifications/${notificationId}/read`, readInit);
    const replay = await request(`/api/v1/notifications/${notificationId}/read`, readInit);
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(await prisma.notificationEvent.count({ where: { notificationId } }), 1);
    assert.equal(
      await prisma.auditLog.count({
        where: { actionType: 'NOTIFICATION_READ', targetId: notificationId },
      }),
      1,
    );
    assert.equal(
      await prisma.outboxEvent.count({
        where: { eventType: 'NOTIFICATION_READ_V1', aggregateId: notificationId },
      }),
      1,
    );
    const foreignRead = await request(`/api/v1/notifications/${foreignNotificationId}/read`, {
      method: 'POST',
      headers: {
        ...authorization(auth.accessToken),
        'idempotency-key': uuidv7(),
      },
    });
    assert.equal(foreignRead.status, 404);
    assert.equal(foreignRead.body.code, 'PERMISSION_RESOURCE_NOT_FOUND');
    assert.equal(
      (await prisma.notification.findUniqueOrThrow({ where: { id: foreignNotificationId } }))
        .readAt,
      null,
    );
    await assert.rejects(() =>
      prisma.notification.update({
        where: { id: notificationId },
        data: { body: 'A direct rewrite must fail.', version: { increment: 1 } },
      }),
    );
  });

  it('accepts only authenticated bounded client diagnostics with durable replay and no free-form metadata', async () => {
    const { data: auth } = await login();
    const body = { platform: 'WEB_TEACHER', level: 'ERROR', category: 'NETWORK', errorCode: 'NETWORK_UNAVAILABLE',
      retryable: true, clientOccurredAt: '2020-01-01T00:00:00.000Z', method: 'GET', route: '/students/private-id', relatedRequestId: 'private-reference' };
    const headers = { ...authorization(auth.accessToken), 'content-type': 'application/json', 'idempotency-key': uuidv7() };
    const send = (input: unknown, extra = headers) => request('/api/v1/audit-logs/client-errors', {method:'POST',headers:extra,body:JSON.stringify(input)});
    assert.equal((await send(body, {'content-type':'application/json','idempotency-key':uuidv7()})).status,401);
    assert.equal((await send({...body,platform:'WEB_ADMIN'})).status,403);
    assert.equal((await send({...body,message:'private free text'})).status,422);
    assert.equal((await send({...body,route:'/students?token=private'})).status,422);
    const first=await send(body);if(first.status===500)console.error(childOutput);assert.equal(first.status,200,JSON.stringify(first.body));
    const replay=await send(body);assert.equal(replay.status,200);assert.deepEqual(replay.body.data,first.body.data);
    const receipt=object(first.body.data), row=await prisma.auditLog.findUniqueOrThrow({where:{id:String(receipt.auditLogId)}});
    assert.equal(row.actorUserId,fixture.teacherUserId);assert.equal(row.organizationId,fixture.organizationId);
    assert.equal(row.actionType,'CLIENT_ERROR_REPORTED');assert.equal(row.actorRoleSnapshot,'TEACHER');
    assert.deepEqual(row.safeMetadata,{reportedByClient:true,platform:'WEB_TEACHER',category:'NETWORK',errorCode:'NETWORK_UNAVAILABLE',retryable:true,method:'GET'});
    assert.equal(row.occurredAt.toISOString(),receipt.receivedAt);assert.notEqual(receipt.receivedAt,body.clientOccurredAt);
    assert.equal(await prisma.auditLog.count({where:{actionType:'CLIENT_ERROR_REPORTED'}}),1);
    assert.equal((await send({...body,category:'SERVER'})).status,409);
    const relatedRequestId=uuidv7();
    const normalized=await send({...body,errorCode:'PRIVATE_CUSTOM_CODE',route:'/api/v1/notifications',relatedRequestId},{...headers,'idempotency-key':uuidv7()});
    assert.equal(normalized.status,200);
    const other=await prisma.auditLog.findUniqueOrThrow({where:{id:String(object(normalized.body.data).auditLogId)}});
    assert.equal(object(other.safeMetadata).errorCode,'UNKNOWN');
    assert.equal(object(other.safeMetadata).relatedRequestId,relatedRequestId);
    assert.equal(object(other.safeMetadata).route,'/notifications');
    assert.equal(typeof object(other.safeMetadata).operationId,'string');
    let limited: HttpResult | undefined;
    for(let i=0;i<31;i++){limited=await send(body);if(limited.status===429)break;assert.equal(limited.status,200);}
    assert.equal(limited?.status,429);assert.equal(await prisma.auditLog.count({where:{actionType:'CLIENT_ERROR_REPORTED'}}),2);
  });
  it('marks 24 distinct notifications concurrently with one durable event per notification', async () => {
    const { data: auth } = await login();
    const ids = Array.from({ length: 24 }, () => uuidv7());
    await prisma.notification.createMany({
      data: ids.map((id) => ({
        id,
        organizationId: fixture.organizationId,
        recipientUserId: fixture.teacherUserId,
        notificationType: 'COURSE_UPDATE',
        title: 'Synthetic concurrent read',
        body: 'Synthetic notification concurrency fixture.',
        createdAt: new Date(),
        version: 1,
      })),
    });
    const writes = ids.map((id) => ({ id, key: uuidv7() }));
    const results = await Promise.all(
      writes.map(({ id, key }) =>
        request(`/api/v1/notifications/${id}/read`, {
          method: 'POST',
          headers: { ...authorization(auth.accessToken), 'idempotency-key': key },
        }),
      ),
    );
    if (results.some((result) => result.status === 500)) console.error(childOutput);
    assert.deepEqual(
      results.map((result) => ({ status: result.status, code: result.body.code })),
      ids.map(() => ({ status: 200, code: undefined })),
    );
    for (const { id, key } of writes) {
      const saved = await prisma.notification.findUniqueOrThrow({ where: { id } });
      assert.ok(saved.readAt);
      assert.equal(saved.version, 2);
      const replay = await request(`/api/v1/notifications/${id}/read`, {
        method: 'POST',
        headers: { ...authorization(auth.accessToken), 'idempotency-key': key },
      });
      assert.equal(replay.status, 200);
      assert.equal(object(replay.body.data).readAt, saved.readAt.toISOString());
      assert.equal(await prisma.notificationEvent.count({ where: { notificationId: id } }), 1);
      assert.equal(
        await prisma.auditLog.count({ where: { actionType: 'NOTIFICATION_READ', targetId: id } }),
        1,
      );
      assert.equal(
        await prisma.outboxEvent.count({
          where: { eventType: 'NOTIFICATION_READ_V1', aggregateId: id },
        }),
        1,
      );
    }
  });

  it('registers and revokes an IOS push token without exposing plaintext or ciphertext', async () => {
    const { data: auth } = await login();
    const registrationToken = 'synthetic-ios-apns-registration-token-0001';
    const registrationKey = uuidv7();
    const registerInit: RequestInit = {
      method: 'POST',
      headers: {
        ...authorization(auth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': registrationKey,
      },
      body: JSON.stringify({
        platform: 'IOS',
        registrationToken,
        appVersion: '1.4.0',
        locale: 'zh-CN',
      }),
    };
    const registered = await request('/api/v1/push-devices', registerInit);
    assert.equal(registered.status, 201, `${JSON.stringify(registered.body)}\n${childOutput}`);
    const projection = object(registered.body.data);
    const deviceId = String(projection.id);
    assert.equal(projection.platform, 'IOS');
    assert.equal(JSON.stringify(registered.body).includes(registrationToken), false);
    const stored = await prisma.pushDevice.findUniqueOrThrow({ where: { id: deviceId } });
    assert.notEqual(stored.registrationTokenHash, registrationToken);
    assert.notEqual(stored.registrationTokenCiphertext, registrationToken);

    const conflictingReplay = await request('/api/v1/push-devices', {
      ...registerInit,
      body: JSON.stringify({
        platform: 'IOS',
        registrationToken: 'synthetic-ios-apns-registration-token-0002',
        appVersion: '1.4.0',
        locale: 'zh-CN',
      }),
    });
    assert.equal(conflictingReplay.status, 409);
    assert.equal(conflictingReplay.body.code, 'CONFLICT_IDEMPOTENCY_KEY_REUSED');

    const revoked = await request(`/api/v1/push-devices/${deviceId}`, {
      method: 'DELETE',
      headers: {
        ...authorization(auth.accessToken),
        'idempotency-key': uuidv7(),
      },
    });
    assert.equal(revoked.status, 200);
    assert.equal(revoked.body.data, null);
    const revokedRow = await prisma.pushDevice.findUniqueOrThrow({ where: { id: deviceId } });
    assert.equal(revokedRow.status, 'REVOKED');
    assert.equal(revokedRow.registrationTokenCiphertext, null);
    assert.notEqual(revokedRow.registrationTokenHash, stored.registrationTokenHash);

    const { data: otherAuth } = await login(fixture.teacherBEmail);
    const transferred = await request('/api/v1/push-devices', {
      method: 'POST',
      headers: {
        ...authorization(otherAuth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        platform: 'IOS',
        registrationToken,
        appVersion: '1.4.0',
        locale: 'zh-CN',
      }),
    });
    assert.equal(transferred.status, 201);
    assert.notEqual(object(transferred.body.data).id, deviceId);
  });

  it('persists preferences and feedback while exposing only published help content', async () => {
    const { data: auth } = await login();
    const initial = await request('/api/v1/me/preferences', {
      headers: authorization(auth.accessToken),
    });
    assert.equal(initial.status, 200);
    assert.equal(object(initial.body.data).version, 1);

    const updated = await request('/api/v1/me/preferences', {
      method: 'PATCH',
      headers: {
        ...authorization(auth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        locale: 'en',
        pushEnabled: true,
        emailEnabled: false,
        expectedVersion: 1,
      }),
    });
    assert.equal(updated.status, 200, `${JSON.stringify(updated.body)}\n${childOutput}`);
    assert.equal(object(updated.body.data).version, 2);

    const articleId = uuidv7();
    await prisma.helpArticle.createMany({
      data: [
        {
          id: articleId,
          category: 'ACCOUNT',
          locale: 'en',
          title: 'Synthetic sign-in help',
          bodyMarkdown: 'Use the approved synthetic account.',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv7(),
          category: 'ACCOUNT',
          locale: 'en',
          title: 'Unpublished draft',
          bodyMarkdown: 'This draft must remain private.',
          status: 'DRAFT',
          publishedAt: new Date(),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: uuidv7(),
          category: 'ACCOUNT',
          locale: 'en',
          title: 'Future publication',
          bodyMarkdown: 'This scheduled article must remain private.',
          status: 'PUBLISHED',
          publishedAt: new Date(Date.now() + 3_600_000),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ],
    });
    const help = await request('/api/v1/help-articles?locale=en');
    assert.equal(help.status, 200);
    assert.equal(array(help.body.data).length, 1);
    assert.equal(object(array(help.body.data)[0]).id, articleId);
    const helpDetail = await request(`/api/v1/help-articles/${articleId}?locale=en`);
    assert.equal(helpDetail.status, 200);
    assert.equal(object(helpDetail.body.data).id, articleId);
    await assert.rejects(() =>
      prisma.helpArticle.create({
        data: {
          id: uuidv7(),
          category: 'ACCOUNT',
          locale: 'en',
          title: 'Unsafe content',
          bodyMarkdown: '<img src=x onerror=alert(1)>',
          status: 'PUBLISHED',
          publishedAt: new Date(),
          version: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      }),
    );

    const content = 'Synthetic iOS feedback that must not enter audit or outbox payloads.';
    const feedback = await request('/api/v1/feedback', {
      method: 'POST',
      headers: {
        ...authorization(auth.accessToken),
        'content-type': 'application/json',
        'idempotency-key': uuidv7(),
      },
      body: JSON.stringify({
        category: 'BUG',
        content,
        clientContext: { platform: 'IOS', appVersion: '1.4.0', osVersion: '19.0' },
      }),
    });
    assert.equal(feedback.status, 201);
    const feedbackId = String(object(feedback.body.data).id);
    const fetchedFeedback = await request(`/api/v1/feedback/${feedbackId}`, {
      headers: authorization(auth.accessToken),
    });
    assert.equal(fetchedFeedback.status, 200);
    assert.equal(object(fetchedFeedback.body.data).id, feedbackId);
    const foreignFeedbackId = uuidv7();
    await prisma.feedback.create({
      data: {
        id: foreignFeedbackId,
        organizationId: fixture.organizationId,
        createdByUserId: fixture.teacherBUserId,
        category: 'SUGGESTION',
        content: 'Another user private feedback.',
        status: 'OPEN',
        publicReply: null,
        clientPlatform: 'IOS',
        clientAppVersion: '1.4.0',
        clientOsVersion: '19.0',
        createdAt: new Date(),
        updatedAt: new Date(),
        version: 1,
      },
    });
    const listedFeedback = await request('/api/v1/feedback?limit=20', {
      headers: authorization(auth.accessToken),
    });
    assert.equal(listedFeedback.status, 200);
    assert.equal(array(listedFeedback.body.data).length, 1);
    assert.equal(object(array(listedFeedback.body.data)[0]).id, feedbackId);
    const foreignFeedback = await request(`/api/v1/feedback/${foreignFeedbackId}`, {
      headers: authorization(auth.accessToken),
    });
    assert.equal(foreignFeedback.status, 404);
    assert.equal(foreignFeedback.body.code, 'PERMISSION_RESOURCE_NOT_FOUND');
    const evidence = JSON.stringify({
      audit: await prisma.auditLog.findMany({ where: { targetId: feedbackId } }),
      outbox: await prisma.outboxEvent.findMany({ where: { aggregateId: feedbackId } }),
      events: await prisma.feedbackEvent.findMany({ where: { feedbackId } }),
    });
    assert.equal(evidence.includes(content), false);
    assert.equal(evidence.includes('19.0'), false);
    await assert.rejects(() =>
      prisma.feedback.update({
        where: { id: feedbackId },
        data: { content: 'Direct rewrite must fail.', version: { increment: 1 } },
      }),
    );
  });

  it('keeps all location and conversion capabilities explicitly fail-closed', async () => {
    const resources = await seedSubmittedExerciseRecord(prisma, fixture, 'LOC-DENY');
    const seconds = Math.floor(Date.now() / 1000);
    const accessToken = await new SignJWT({
      organizationId: fixture.organizationId,
      role: 'STUDENT',
      sessionId: resources.studentAuthSessionId,
      tokenVersion: 0,
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setSubject(resources.studentUserId)
      .setJti(uuidv7())
      .setIssuer('bnbu-sports-test')
      .setAudience('bnbu-sports-test-clients')
      .setIssuedAt(seconds)
      .setExpirationTime(seconds + 600)
      .sign(await importPKCS8(TEST_PRIVATE_KEY, 'EdDSA'));
    const { data: adminAuth } = await login(fixture.adminEmail);
    const { data: teacherAuth } = await login();
    const sessionId = resources.sessionId;
    const recordId = resources.recordId;
    const now = new Date().toISOString();
    const probes: { path: string; init?: RequestInit; accessToken?: string; status?: number }[] = [
      { path: '/api/v1/sport-catalog' },
      { path: '/api/v1/activity-conversion-rules', status: 403 },
      { path: '/api/v1/activity-conversion-rules', accessToken: teacherAuth.accessToken },
      {
        path: `/api/v1/exercise-sessions/${sessionId}/location-track`,
        init: {
          method: 'POST',
          body: JSON.stringify({ consentPolicyVersion: 'synthetic-v1', clientObservedAt: now }),
        },
      },
      {
        path: `/api/v1/exercise-sessions/${sessionId}/location-samples`,
        init: {
          method: 'POST',
          body: JSON.stringify({
            samples: [
              {
                sampleId: uuidv7(),
                observedAt: now,
                latitude: 22.35,
                longitude: 113.53,
                accuracyMeters: 10,
              },
            ],
            expectedVersion: 1,
          }),
        },
      },
      {
        path: `/api/v1/exercise-sessions/${sessionId}/location-track/finalize`,
        init: {
          method: 'POST',
          body: JSON.stringify({ clientObservedAt: now, expectedVersion: 1 }),
        },
      },
      { path: `/api/v1/exercise-records/${recordId}/location-summary` },
      { path: '/api/v1/location-privacy-policy' },
      {
        path: '/api/v1/location-privacy-policy',
        accessToken: adminAuth.accessToken,
        status: 403,
        init: {
          method: 'PATCH',
          body: JSON.stringify({
            policyVersion: 'synthetic-v1',
            collectionEnabled: false,
            expectedVersion: 1,
          }),
        },
      },
    ];

    for (const probe of probes) {
      const mutation = probe.init?.method !== undefined;
      const response = await request(probe.path, {
        ...probe.init,
        headers: {
          ...authorization(probe.accessToken ?? accessToken),
          ...(mutation ? { 'content-type': 'application/json', 'idempotency-key': uuidv7() } : {}),
        },
      });
      assert.equal(response.status, probe.status ?? 503, `${probe.path}: ${JSON.stringify(response.body)}`);
      assert.equal(response.body.code, probe.status === 403 ? 'PERMISSION_RESOURCE_SCOPE_DENIED' : 'SYSTEM_MODE_UNSUPPORTED');
    }
  });
});
