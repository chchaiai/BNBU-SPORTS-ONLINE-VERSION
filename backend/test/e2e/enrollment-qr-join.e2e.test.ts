import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import { importPKCS8, SignJWT } from 'jose';
import { v7 as uuidv7 } from 'uuid';

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

interface HttpResult {
  status: number;
  body: Record<string, unknown>;
  headers: Headers;
}

interface SyntheticIdentity {
  fullName: string;
  studentNumber: string;
  gender: string;
  gradeYear: number;
}

const IDENTITY: SyntheticIdentity = {
  fullName: 'Synthetic QR Student',
  studentNumber: '00001234',
  gender: 'MALE',
  gradeYear: 2026,
};

function object(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
}

function array(value: unknown): Record<string, unknown>[] {
  assert.equal(Array.isArray(value), true);
  return value as Record<string, unknown>[];
}

async function availablePort(): Promise<number> {
  const server = createServer();
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, 'object');
  const port = (address as { port: number }).port;
  await new Promise<void>((resolve, reject) =>
    server.close((error) => (error ? reject(error) : resolve())),
  );
  return port;
}

describe('Student identity, Enrollment, and QR Join HTTP E2E', () => {
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
      headers: response.headers,
    };
  };

  const login = async (account: string): Promise<string> => {
    const result = await request('/api/v1/auth/password-login', {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': uuidv7() },
      body: JSON.stringify({ account, password: TEST_PASSWORD }),
    });
    assert.equal(result.status, 200);
    const token = object(result.body.data).accessToken;
    assert.equal(typeof token, 'string');
    return token as string;
  };

  const authenticated = (
    token: string,
    method = 'GET',
    body?: Record<string, unknown>,
    idempotencyKey?: string,
  ): RequestInit => ({
    method,
    headers: {
      authorization: `Bearer ${token}`,
      ...(body === undefined ? {} : { 'content-type': 'application/json' }),
      ...(idempotencyKey === undefined ? {} : { 'idempotency-key': idempotencyKey }),
    },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });

  const createInvite = async (
    teacherToken: string,
    classSectionId = fixture.teacherAActiveSectionId,
    idempotencyKey = uuidv7(),
  ): Promise<HttpResult> =>
    request(
      `/api/v1/class-sections/${classSectionId}/course-invites`,
      authenticated(teacherToken, 'POST', {}, idempotencyKey),
    );

  const issueCapability = async (
    inviteToken: string,
    identity: SyntheticIdentity = IDENTITY,
    idempotencyKey = uuidv7(),
  ): Promise<HttpResult> =>
    request(`/api/v1/course-invites/${encodeURIComponent(inviteToken)}/join-capabilities`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'idempotency-key': idempotencyKey },
      body: JSON.stringify(identity),
    });

  const join = async (
    inviteToken: string,
    capability: string,
    idempotencyKey: string,
    authorization?: string,
  ): Promise<HttpResult> =>
    request(`/api/v1/course-invites/${encodeURIComponent(inviteToken)}/join`, {
      method: 'POST',
      headers: {
        'idempotency-key': idempotencyKey,
        'x-join-capability': capability,
        ...(authorization === undefined ? {} : { authorization: `Bearer ${authorization}` }),
      },
    });

  const createSyntheticStudent = async (): Promise<{
    userId: string;
    profileId: string;
    accessToken: string;
  }> => {
    const userId = uuidv7();
    const profileId = uuidv7();
    const sessionId = uuidv7();
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 3_600_000);
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
          studentNumber: '00005678',
          fullName: 'Synthetic Manual Student',
          gender: 'FEMALE',
          gradeYear: 2026,
          status: 'ACTIVE',
          createdAt: now,
          updatedAt: now,
        },
      });
      await transaction.authSession.create({
        data: {
          id: sessionId,
          organizationId: fixture.organizationId,
          userId,
          status: 'ACTIVE',
          tokenFamilyId: uuidv7(),
          createdAt: now,
          lastSeenAt: now,
          absoluteExpiresAt: expiresAt,
          idleExpiresAt: expiresAt,
        },
      });
    });
    const seconds = Math.floor(now.getTime() / 1_000);
    const accessToken = await new SignJWT({
      organizationId: fixture.organizationId,
      role: 'STUDENT',
      sessionId,
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
    return { userId, profileId, accessToken };
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
      env: foundationEnvironment(databaseUrl, port),
      stdio: ['pipe', 'pipe', 'pipe'],
    });
    child.stdout.on('data', (chunk: Buffer) => (childOutput += chunk.toString()));
    child.stderr.on('data', (chunk: Buffer) => (childOutput += chunk.toString()));
    const deadline = Date.now() + 20_000;
    while (Date.now() < deadline) {
      if (child.exitCode !== null) throw new Error(`Backend exited during startup: ${childOutput}`);
      try {
        if ((await fetch(`${baseUrl}/api/v1/health/live`)).ok) return;
      } catch {
        // The process may still be starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Backend did not become live: ${childOutput}`);
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
      kind: 'SUB', permissions: ['COURSE_VIEW'], mustChangePassword: false,
    } });
    await prisma.classSection.update({
      where: { id: fixture.teacherAActiveSectionId },
      data: { isEnrollmentOpen: true },
    });
    childOutput = '';
  });

  after(async () => {
    child.kill();
    await prisma.$disconnect();
  });

  it('rotates digest-only invites and issues one replayable capability without creating identity', async () => {
    const teacher = await login(fixture.teacherEmail);
    const firstKey = uuidv7();
    const first = await createInvite(teacher, fixture.teacherAActiveSectionId, firstKey);
    const replay = await createInvite(teacher, fixture.teacherAActiveSectionId, firstKey);
    assert.equal(first.status, 201);
    assert.equal(replay.status, 201);
    assert.equal(first.headers.get('cache-control'), 'no-store');
    const firstData = object(first.body.data);
    const firstToken = String(firstData.inviteToken);
    assert.equal(object(replay.body.data).inviteToken, firstToken);
    assert.equal(await prisma.courseInvite.count(), 1);
    const stored = await prisma.courseInvite.findFirstOrThrow();
    assert.notEqual(stored.tokenHash, firstToken);
    assert.equal(stored.secretCiphertext?.includes(firstToken), false);

    const rotated = await createInvite(teacher);
    assert.equal(rotated.status, 201);
    const nextToken = String(object(rotated.body.data).inviteToken);
    assert.notEqual(nextToken, firstToken);
    assert.equal(await prisma.courseInvite.count({ where: { status: 'ACTIVE' } }), 1);
    assert.equal(
      (await request(`/api/v1/course-invites/${encodeURIComponent(firstToken)}/preview`)).body.code,
      'COURSE_INVITE_REVOKED',
    );
    const preview = await request(
      `/api/v1/course-invites/${encodeURIComponent(nextToken)}/preview`,
    );
    assert.equal(preview.status, 200);
    assert.equal(object(preview.body.data).courseCode, 'SYNTH-PE-101');
    assert.equal(object(preview.body.data).teacherDisplayName, 'Synthetic Test Teacher A');
    assert.equal(preview.headers.get('referrer-policy'), 'no-referrer');

    const before = {
      users: await prisma.user.count(),
      profiles: await prisma.studentProfile.count(),
      enrollments: await prisma.enrollment.count(),
      sessions: await prisma.authSession.count(),
    };
    const capabilityKey = uuidv7();
    const issued = await issueCapability(nextToken, IDENTITY, capabilityKey);
    const issuedReplay = await issueCapability(nextToken, IDENTITY, capabilityKey);
    assert.equal(issued.status, 201);
    assert.equal(issuedReplay.status, 201);
    const capability = String(object(issued.body.data).joinCapability);
    assert.equal(object(issuedReplay.body.data).joinCapability, capability);
    assert.equal(await prisma.joinCapability.count(), 1);
    const storedCapability = await prisma.joinCapability.findFirstOrThrow();
    assert.notEqual(storedCapability.tokenHash, capability);
    assert.equal(storedCapability.encryptedIdentitySnapshot.includes('00001234'), false);
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        profiles: await prisma.studentProfile.count(),
        enrollments: await prisma.enrollment.count(),
        sessions: await prisma.authSession.count(),
      },
      before,
    );
    assert.equal((await request('/api/v1/course-invites/not-a-token/preview')).status, 400);
  });

  it('rejects non-binary QR join genders and malformed cohort years before issuing a capability', async () => {
    const teacher = await login(fixture.teacherEmail);
    const invite = await createInvite(teacher);
    const inviteToken = String(object(invite.body.data).inviteToken);

    for (const identity of [
      { ...IDENTITY, gender: 'OTHER' },
      { ...IDENTITY, gender: 'UNKNOWN' },
      { ...IDENTITY, gradeYear: 999 },
      { ...IDENTITY, gradeYear: 10_000 },
      { ...IDENTITY, gradeYear: 2026.5 },
    ]) {
      const rejected = await issueCapability(inviteToken, identity);
      assert.equal(rejected.status, 422);
    }
    assert.equal(await prisma.joinCapability.count(), 0);

    const accepted = await issueCapability(inviteToken, {
      ...IDENTITY,
      studentNumber: '00009999',
      gender: 'FEMALE',
      gradeYear: 9999,
    });
    assert.equal(accepted.status, 201);
  });

  it('joins atomically, replays the exact encrypted result, and grants only Enrollment projections', async () => {
    const teacher = await login(fixture.teacherEmail);
    const invite = await createInvite(teacher);
    const inviteToken = String(object(invite.body.data).inviteToken);
    const issued = await issueCapability(inviteToken);
    const capability = String(object(issued.body.data).joinCapability);
    const deniedBearer = await join(inviteToken, capability, uuidv7(), teacher);
    assert.equal(deniedBearer.status, 401);
    assert.equal(deniedBearer.body.code, 'AUTH_TOKEN_INVALID');
    assert.equal((await prisma.joinCapability.findFirstOrThrow()).status, 'ACTIVE');

    const key = uuidv7();
    const joined = await join(inviteToken, capability, key);
    const replay = await join(inviteToken, capability, key);
    assert.equal(joined.status, 201);
    assert.equal(replay.status, 201);
    assert.equal(joined.headers.get('cache-control'), 'no-store');
    const data = object(joined.body.data);
    const replayData = object(replay.body.data);
    const profile = object(data.studentProfile);
    const enrollment = object(data.enrollment);
    const auth = object(data.authSession);
    assert.equal(object(auth.user).status, 'PENDING_CONTACT_BINDING');
    assert.equal(profile.studentNumber, '00001234');
    assert.equal(enrollment.status, 'ACTIVE');
    assert.equal(object(data.course).id, fixture.activeCourseId);
    assert.equal(object(data.classSection).id, fixture.teacherAActiveSectionId);
    assert.equal(object(replayData.authSession).refreshToken, auth.refreshToken);
    assert.equal(await prisma.user.count({ where: { role: 'STUDENT' } }), 1);
    assert.equal(await prisma.studentProfile.count(), 1);
    assert.equal(await prisma.enrollment.count(), 1);
    assert.equal(await prisma.enrollmentStatusEvent.count(), 1);
    const consumed = await prisma.joinCapability.findFirstOrThrow();
    assert.equal(consumed.status, 'CONSUMED');
    assert.equal(consumed.secretCiphertext, null);
    assert.equal(consumed.resultCiphertext?.includes(String(auth.refreshToken)), false);
    const newKey = await join(inviteToken, capability, uuidv7());
    assert.equal(newKey.status, 409);
    assert.equal(newKey.body.code, 'AUTH_JOIN_CAPABILITY_ALREADY_USED');

    const studentToken = String(auth.accessToken);
    const me = await request('/api/v1/me', authenticated(studentToken));
    assert.equal(me.status, 200);
    assert.equal(object(object(me.body.data).studentProfile).studentNumber, '00001234');
    assert.equal(object(object(me.body.data).user).status, 'PENDING_CONTACT_BINDING');
    const blockedPreferences = await request('/api/v1/me/preferences', authenticated(studentToken));
    assert.equal(blockedPreferences.status, 409);
    assert.equal(blockedPreferences.body.code, 'USER_STATUS_NOT_ACTIVE');
    assert.equal(childOutput.includes(firstSecret(capability)), false);
    assert.equal(childOutput.includes(String(auth.refreshToken)), false);
    const revokePath = `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/course-invites/revocations`;
    const revokeBody = { inviteToken };
    const otherTeacher = await login(fixture.teacherBEmail);
    const admin = await login(fixture.adminEmail);
    assert.equal((await request(revokePath, authenticated(otherTeacher, 'POST', revokeBody, uuidv7()))).status, 404);
    assert.equal((await request(revokePath, authenticated(admin, 'POST', revokeBody, uuidv7()))).status, 403);
    const revokeKey = uuidv7();
    const revoked = await request(revokePath, authenticated(teacher, 'POST', revokeBody, revokeKey));
    assert.equal(revoked.status, 201, JSON.stringify(revoked.body));
    assert.equal(object(revoked.body.data).status, 'REVOKED');
    assert.deepEqual((await request(revokePath, authenticated(teacher, 'POST', revokeBody, revokeKey))).body.data, revoked.body.data);
    assert.equal((await request(revokePath, authenticated(teacher, 'POST', revokeBody, uuidv7()))).status, 409);
    assert.equal((await request(`/api/v1/course-invites/${encodeURIComponent(inviteToken)}/preview`)).body.code, 'COURSE_INVITE_REVOKED');
    assert.equal((await issueCapability(inviteToken)).body.code, 'COURSE_INVITE_REVOKED');
    assert.equal(await prisma.courseInvite.count({ where: { status: 'ACTIVE' } }), 0);
    assert.equal(await prisma.enrollment.count({ where: { status: 'ACTIVE' } }), 1);
    assert.equal(await prisma.enrollmentStatusEvent.count(), 1);
    const events = await prisma.$queryRaw<{ facts: unknown }[]>`SELECT facts FROM v81_events WHERE resource_id=${String(object(revoked.body.data).id)}::uuid AND event_type='REVOKED'`;
    assert.equal(events.length, 1);
    assert.ok(!JSON.stringify(events).includes(inviteToken));

  });

  it('manually enrolls an existing student and enforces remove, restore, read, and withdraw scopes', async () => {
    const teacherA = await login(fixture.teacherEmail);
    const teacherB = await login(fixture.teacherBEmail);
    const admin = await login(fixture.adminEmail);
    const student = await createSyntheticStudent();
    const key = uuidv7();
    const body = { studentId: student.profileId, reason: 'Synthetic manual placement' };
    const created = await request(
      `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/enrollments`,
      authenticated(teacherA, 'POST', body, key),
    );
    const replay = await request(
      `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/enrollments`,
      authenticated(teacherA, 'POST', body, key),
    );
    assert.equal(created.status, 201);
    assert.equal(replay.status, 201);
    const enrollment = object(created.body.data);
    const enrollmentId = String(enrollment.id);
    assert.equal(object(replay.body.data).id, enrollmentId);
    assert.equal(await prisma.enrollment.count(), 1);
    assert.equal(
      (await request(`/api/v1/enrollments/${enrollmentId}`, authenticated(teacherB))).status,
      404,
    );
    assert.equal(
      (await request(`/api/v1/enrollments/${enrollmentId}`, authenticated(admin))).status,
      200,
    );
    const listed = await request('/api/v1/enrollments?limit=20', authenticated(admin));
    assert.equal(listed.status, 200);
    assert.equal(array(listed.body.data).length, 1);
    assert.equal(
      (
        await request(
          `/api/v1/enrollments/${enrollmentId}/remove`,
          authenticated(
            admin,
            'POST',
            { reason: 'Admin proxy denied', expectedVersion: 1 },
            uuidv7(),
          ),
        )
      ).status,
      403,
    );

    const removed = await request(
      `/api/v1/enrollments/${enrollmentId}/remove`,
      authenticated(
        teacherA,
        'POST',
        { reason: 'Synthetic teacher removal', expectedVersion: 1 },
        uuidv7(),
      ),
    );
    assert.equal(removed.status, 200);
    assert.equal(object(removed.body.data).status, 'REMOVED');
    const studentRead = await request(
      `/api/v1/enrollments/${enrollmentId}`,
      authenticated(student.accessToken),
    );
    assert.equal(studentRead.status, 200);
    assert.equal(object(studentRead.body.data).endReason, null);
    const deniedWithdraw = await request(
      `/api/v1/enrollments/${enrollmentId}/withdraw`,
      authenticated(
        student.accessToken,
        'POST',
        { reason: 'Synthetic self withdrawal', expectedVersion: 2 },
        uuidv7(),
      ),
    );
    assert.equal(deniedWithdraw.status, 409);
    assert.equal(deniedWithdraw.body.code, 'ENROLLMENT_WITHDRAWAL_DISABLED');
    assert.equal(
      (await prisma.enrollment.findUniqueOrThrow({ where: { id: enrollmentId } })).version,
      2,
    );

    const restored = await request(
      `/api/v1/enrollments/${enrollmentId}/restore`,
      authenticated(
        teacherA,
        'POST',
        { reason: 'Synthetic teacher restore', expectedVersion: 2 },
        uuidv7(),
      ),
    );
    assert.equal(restored.status, 200);
    assert.equal(object(restored.body.data).status, 'ACTIVE');
    assert.equal(object(restored.body.data).id, enrollmentId);
    assert.equal(await prisma.enrollmentStatusEvent.count(), 3);
    assert.equal(await prisma.auditLog.count({ where: { targetId: enrollmentId } }), 3);
  });

  it('rolls back a second same-semester join and refuses self rejoin after teacher removal', async () => {
    const teacherA = await login(fixture.teacherEmail);
    const teacherB = await login(fixture.teacherBEmail);
    const inviteA = String(object((await createInvite(teacherA)).body.data).inviteToken);
    const capabilityA = String(object((await issueCapability(inviteA)).body.data).joinCapability);
    const first = await join(inviteA, capabilityA, uuidv7());
    assert.equal(first.status, 201);
    const firstData = object(first.body.data);
    const firstEnrollment = object(firstData.enrollment);

    await prisma.classSection.update({
      where: { id: fixture.teacherBActiveSectionId },
      data: { isEnrollmentOpen: true },
    });
    const inviteB = String(
      object((await createInvite(teacherB, fixture.teacherBActiveSectionId)).body.data).inviteToken,
    );
    const capabilityBResult = await issueCapability(inviteB);
    const capabilityB = String(object(capabilityBResult.body.data).joinCapability);
    const before = {
      users: await prisma.user.count(),
      profiles: await prisma.studentProfile.count(),
      enrollments: await prisma.enrollment.count(),
      sessions: await prisma.authSession.count(),
      events: await prisma.enrollmentStatusEvent.count(),
    };
    const conflict = await join(inviteB, capabilityB, uuidv7());
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'ENROLLMENT_SEMESTER_CONFLICT');
    assert.deepEqual(
      {
        users: await prisma.user.count(),
        profiles: await prisma.studentProfile.count(),
        enrollments: await prisma.enrollment.count(),
        sessions: await prisma.authSession.count(),
        events: await prisma.enrollmentStatusEvent.count(),
      },
      before,
    );
    const capabilityBId = capabilityB.split('.')[0];
    if (capabilityBId === undefined) assert.fail('Capability public id is required');
    assert.equal(
      (await prisma.joinCapability.findUniqueOrThrow({ where: { id: capabilityBId } })).status,
      'ACTIVE',
    );

    const removed = await request(
      `/api/v1/enrollments/${String(firstEnrollment.id)}/remove`,
      authenticated(
        teacherA,
        'POST',
        { reason: 'Synthetic rejoin denial setup', expectedVersion: 1 },
        uuidv7(),
      ),
    );
    assert.equal(removed.status, 200);
    const replacementCapability = String(
      object((await issueCapability(inviteA)).body.data).joinCapability,
    );
    const rejoin = await join(inviteA, replacementCapability, uuidv7());
    assert.equal(rejoin.status, 409);
    assert.equal(rejoin.body.code, 'ENROLLMENT_REJOIN_DISABLED');
    assert.equal(await prisma.enrollment.count(), 1);
  });
});

function firstSecret(token: string): string {
  return token.split('.')[1]?.slice(0, 12) ?? token;
}
