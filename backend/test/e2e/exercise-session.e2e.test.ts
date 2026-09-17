import assert from 'node:assert/strict';
import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { createServer } from 'node:net';
import { after, before, beforeEach, describe, it } from 'node:test';

import { v7 as uuidv7 } from 'uuid';
import { importPKCS8, SignJWT } from 'jose';

import type { PrismaClient } from '../../src/generated/prisma/client.js';
import {
  createTestPrisma,
  resetFoundationDatabase,
  seedFoundationFixture,
  type FoundationFixture,
} from '../helpers/database.js';
import {
  seedExerciseSessionStudent,
  type ExerciseSessionStudentFixture,
} from '../helpers/exercise-session.js';
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

function object(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  assert.equal(Array.isArray(value), false);
  return value as Record<string, unknown>;
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

describe('ExerciseSession HTTP E2E', () => {
  let prisma: PrismaClient;
  let foundation: FoundationFixture;
  let student: ExerciseSessionStudentFixture;
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
    return String(object(result.body.data).accessToken);
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

  const studentToken = async (candidate: ExerciseSessionStudentFixture): Promise<string> => {
    const seconds = Math.floor(Date.now() / 1_000);
    return new SignJWT({
      organizationId: foundation.organizationId,
      role: 'STUDENT',
      sessionId: candidate.authSessionId,
      tokenVersion: 0,
    })
      .setProtectedHeader({ alg: 'EdDSA', typ: 'JWT' })
      .setSubject(candidate.userId)
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
        // Process may still be starting.
      }
      await new Promise((resolve) => setTimeout(resolve, 100));
    }
    throw new Error(`Backend did not become live: ${childOutput}`);
  });

  beforeEach(async () => {
    await resetFoundationDatabase(prisma);
    foundation = await seedFoundationFixture(prisma);
    student = await seedExerciseSessionStudent(prisma, foundation);
    await prisma.classSection.update({ where: { id: foundation.teacherAActiveSectionId }, data: {
      dailyStartTime: new Date('1970-01-01T00:00:00Z'),
      dailyEndTime: new Date('1970-01-01T23:59:59Z'),
    } });
    await prisma.v81AccountSecurity.createMany({ data:
      [foundation.teacherUserId, foundation.adminUserId].map(userId => ({
        userId, organizationId: foundation.organizationId,
        mustChangePassword: false, passwordChangedAt: new Date(),
      })) });
    await prisma.v81AdminAccess.create({ data: {
      userId: foundation.adminUserId, organizationId: foundation.organizationId,
      kind: 'SUPER', permissions: [], mustChangePassword: false,
    } });
    const adminToken = await login(foundation.adminEmail);
    const teacherToken = await login(foundation.teacherEmail);
    const template = await request('/api/v1/rule-templates', authenticated(adminToken, 'POST',
      { displayName: 'Synthetic session E2E template', expectedVersion: 0 }, uuidv7()));
    assert.equal(template.status, 201, JSON.stringify(template.body));
    const rules = await request('/api/v1/class-sections/' + foundation.teacherAActiveSectionId + '/v81-rules',
      authenticated(teacherToken, 'POST', {
        templateId: object(template.body.data).id, minimumMinutes: 30, weeklyLimit: 3,
        courseTarget: 600, generalTarget: 600, regularDeadline: '2027-01-23T00:00:00Z',
        closingDeadline: '2027-01-30T00:00:00Z', settlementPlannedAt: '2027-01-30T01:00:00Z',
        publish: true, expectedVersion: 0,
      }, uuidv7()));
    assert.equal(rules.status, 201, JSON.stringify(rules.body));
    childOutput = '';
  });

  after(async () => {
    child.kill();
    await prisma.$disconnect();
  });

  it('runs start, active recovery, pause, resume, conservative reconcile, and finish atomically', async () => {
    const token = await studentToken(student);
    const none = await request('/api/v1/exercise-sessions/active', authenticated(token));
    assert.equal(none.status, 200);
    assert.equal(none.body.data, null);

    const startKey = uuidv7();
    const startBody = {
      enrollmentId: student.enrollmentId,
      clientObservedAt: '2099-01-01T00:00:00.000Z',
    };
    const started = await request(
      '/api/v1/exercise-sessions',
      authenticated(token, 'POST', startBody, startKey),
    );
    const replay = await request(
      '/api/v1/exercise-sessions',
      authenticated(token, 'POST', startBody, startKey),
    );
    assert.equal(started.status, 201, JSON.stringify(started.body));
    assert.equal(replay.status, 201);
    const initial = object(started.body.data);
    assert.deepEqual(replay.body.data, started.body.data);
    assert.equal(initial.status, 'IN_PROGRESS');
    assert.notEqual(initial.startedAt, startBody.clientObservedAt);
    assert.equal(
      initial.businessDate,
      new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Shanghai' }).format(new Date()),
    );
    assert.equal(await prisma.exerciseSession.count(), 1);
    assert.equal(await prisma.exerciseSessionSegment.count(), 1);
    assert.equal(await prisma.exerciseSessionEvent.count(), 1);
    assert.equal(await prisma.auditLog.count({ where: { targetType: 'EXERCISE_SESSION' } }), 1);
    assert.equal(
      await prisma.outboxEvent.count({ where: { aggregateType: 'EXERCISE_SESSION' } }),
      1,
    );

    const sessionId = String(initial.id);
    const fetched = await request(`/api/v1/exercise-sessions/${sessionId}`, authenticated(token));
    assert.equal(fetched.status, 200);
    assert.equal(object(fetched.body.data).id, sessionId);
    const active = await request('/api/v1/exercise-sessions/active', authenticated(token));
    assert.equal(object(active.body.data).id, sessionId);
    const paused = await request(
      `/api/v1/exercise-sessions/${sessionId}/pause`,
      authenticated(
        token,
        'POST',
        { expectedVersion: 1, clientObservedAt: '2000-01-01T00:00:00.000Z' },
        uuidv7(),
      ),
    );
    assert.equal(paused.status, 200);
    assert.equal(object(paused.body.data).status, 'PAUSED');
    assert.equal(object(paused.body.data).version, 2);

    const resumed = await request(
      `/api/v1/exercise-sessions/${sessionId}/resume`,
      authenticated(
        token,
        'POST',
        { expectedVersion: 2, clientObservedAt: '2099-01-01T00:00:00.000Z' },
        uuidv7(),
      ),
    );
    assert.equal(resumed.status, 200);
    assert.equal(object(resumed.body.data).status, 'IN_PROGRESS');
    const beforeReconcile = Number(object(resumed.body.data).actualDurationSeconds);

    const clientEventId = `synthetic-${uuidv7()}`;
    const reconciled = await request(
      `/api/v1/exercise-sessions/${sessionId}/reconcile`,
      authenticated(
        token,
        'POST',
        {
          expectedVersion: 3,
          clientEvents: [
            {
              eventId: clientEventId,
              eventType: 'STATE_SYNC',
              observedAt: new Date().toISOString(),
            },
          ],
        },
        uuidv7(),
      ),
    );
    assert.equal(reconciled.status, 200);
    assert.equal(object(reconciled.body.data).version, 4);
    assert.ok(Number(object(reconciled.body.data).actualDurationSeconds) - beforeReconcile < 5);

    const finished = await request(
      `/api/v1/exercise-sessions/${sessionId}/finish`,
      authenticated(
        token,
        'POST',
        { expectedVersion: 4, clientObservedAt: '2099-01-01T00:00:00.000Z' },
        uuidv7(),
      ),
    );
    assert.equal(finished.status, 200);
    const completed = object(finished.body.data);
    assert.equal(completed.status, 'COMPLETED');
    assert.equal(completed.version, 5);
    assert.equal(typeof completed.endedAt, 'string');
    assert.equal(await prisma.exerciseSessionSegment.count({ where: { endedAt: null } }), 0);
    assert.equal(await prisma.exerciseSessionEvent.count(), 5);
    const teacher = await login(foundation.teacherEmail);
    const settlement = await request(`/api/v1/class-sections/${foundation.teacherAActiveSectionId}/settlement-check`, authenticated(teacher));
    assert.equal(settlement.status, 200, JSON.stringify(settlement.body));
    const checks = object(settlement.body.data).checks as {code:string;status:string;count:number}[];
    assert.deepEqual(checks.find(check=>check.code==='ACTIVE_SESSION'), {code:'ACTIVE_SESSION',status:'CLEAR',count:0});
    assert.deepEqual(checks.find(check=>check.code==='UNSUBMITTED_RECORD'), {code:'UNSUBMITTED_RECORD',status:'BLOCKED',count:1});
    assert.equal(await prisma.exerciseRecord.count({where:{sessionId}}),0);

  });

  it('cancels without deleting history and rejects stale, duplicate-active, foreign-role, removed, and unknown input', async () => {
    const token = await studentToken(student);
    const started = await request(
      '/api/v1/exercise-sessions',
      authenticated(
        token,
        'POST',
        { enrollmentId: student.enrollmentId, clientObservedAt: new Date().toISOString() },
        uuidv7(),
      ),
    );
    const sessionId = String(object(started.body.data).id);
    const duplicate = await request(
      '/api/v1/exercise-sessions',
      authenticated(
        token,
        'POST',
        { enrollmentId: student.enrollmentId, clientObservedAt: new Date().toISOString() },
        uuidv7(),
      ),
    );
    assert.equal(duplicate.status, 409);
    assert.equal(duplicate.body.code, 'SESSION_ALREADY_ACTIVE');
    const stale = await request(
      `/api/v1/exercise-sessions/${sessionId}/pause`,
      authenticated(
        token,
        'POST',
        { expectedVersion: 99, clientObservedAt: new Date().toISOString() },
        uuidv7(),
      ),
    );
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'CONFLICT_VERSION_MISMATCH');
    const cancelled = await request(
      `/api/v1/exercise-sessions/${sessionId}/cancel`,
      authenticated(
        token,
        'POST',
        { expectedVersion: 1, reason: 'Synthetic user cancellation' },
        uuidv7(),
      ),
    );
    assert.equal(cancelled.status, 200);
    assert.equal(object(cancelled.body.data).status, 'CANCELLED');
    assert.equal(await prisma.exerciseSession.count(), 1);
    assert.equal(await prisma.exerciseSessionEvent.count(), 2);

    const teacherToken = await login(foundation.teacherEmail);
    const denied = await request(
      `/api/v1/exercise-sessions/${sessionId}`,
      authenticated(teacherToken),
    );
    assert.equal(denied.status, 403);
    const cancelledCheck = await request(`/api/v1/class-sections/${foundation.teacherAActiveSectionId}/settlement-check`, authenticated(teacherToken));
    assert.equal(cancelledCheck.status,200);
    assert.deepEqual((object(cancelledCheck.body.data).checks as {code:string;status:string;count:number}[]).find(check=>check.code==='UNSUBMITTED_RECORD'),
      {code:'UNSUBMITTED_RECORD',status:'CLEAR',count:0});

    const removed = await seedExerciseSessionStudent(prisma, foundation, 'REMOVED', 'REMOVED', false);
    const removedToken = await studentToken(removed);
    const inactive = await request(
      '/api/v1/exercise-sessions',
      authenticated(
        removedToken,
        'POST',
        { enrollmentId: removed.enrollmentId, clientObservedAt: new Date().toISOString() },
        uuidv7(),
      ),
    );
    assert.equal(inactive.status, 409);
    assert.equal(inactive.body.code, 'ENROLLMENT_NOT_ACTIVE');
    const massAssigned = await request(
      '/api/v1/exercise-sessions',
      authenticated(
        token,
        'POST',
        {
          enrollmentId: student.enrollmentId,
          clientObservedAt: new Date().toISOString(),
          studentId: student.studentId,
          status: 'COMPLETED',
          actualDurationSeconds: 7200,
        },
        uuidv7(),
      ),
    );
    assert.equal(massAssigned.status, 422);
  });

  it('fails closed outside the configured window and rejects unverified offline intervals', async () => {
    const token = await studentToken(student);
    await prisma.classSection.update({
      where: { id: foundation.teacherAActiveSectionId },
      data: { checkInWindowMode: 'UNAVAILABLE' },
    });
    const pausedWindow = await request('/api/v1/exercise-sessions',authenticated(token,'POST',
      {enrollmentId:student.enrollmentId,clientObservedAt:new Date().toISOString()},uuidv7()));
    assert.equal(pausedWindow.status,409);
    assert.equal(pausedWindow.body.code,'SESSION_OUTSIDE_TIME_WINDOW');
    await prisma.classSection.update({where:{id:foundation.teacherAActiveSectionId},data:{checkInWindowMode:'AVAILABLE'}});
    await prisma.classSection.update({
      where: { id: foundation.teacherAActiveSectionId },
      data: { status: 'CLOSED', isEnrollmentOpen: false, closedAt: new Date(), closedBy: foundation.teacherUserId, closeReason: 'Synthetic closed fixture' },
    });
    const denied = await request(
      '/api/v1/exercise-sessions',
      authenticated(
        token,
        'POST',
        { enrollmentId: student.enrollmentId, clientObservedAt: new Date().toISOString() },
        uuidv7(),
      ),
    );
    assert.equal(denied.status, 409);
    assert.equal(denied.body.code, 'SESSION_OUTSIDE_TIME_WINDOW');
    await prisma.classSection.update({
      where: { id: foundation.teacherAActiveSectionId },
      data: { status: 'ACTIVE', closedAt: null, closedBy: null, closeReason: null },
    });
    const started = await request(
      '/api/v1/exercise-sessions',
      authenticated(
        token,
        'POST',
        { enrollmentId: student.enrollmentId, clientObservedAt: new Date().toISOString() },
        uuidv7(),
      ),
    );
    const data = object(started.body.data);
    const forged = await request(
      `/api/v1/exercise-sessions/${String(data.id)}/reconcile`,
      authenticated(
        token,
        'POST',
        {
          expectedVersion: data.version,
          clientEvents: [
            {
              eventId: uuidv7(),
              eventType: 'OFFLINE_INTERVAL',
              observedAt: '2000-01-01T00:00:00.000Z',
            },
          ],
        },
        uuidv7(),
      ),
    );
    assert.equal(forged.status, 409);
    assert.equal(forged.body.code, 'SESSION_RECONCILIATION_REQUIRED');
    const stored = await prisma.exerciseSession.findUniqueOrThrow({
      where: { id: String(data.id) },
    });
    assert.ok(Number(stored.actualDurationSeconds) < 5);
  });

  it('allows further exercise with 20 hours of historical VALID records', async () => {
    const token = await studentToken(student);
    const now = new Date();
    const sessions = Array.from({ length: 10 }, (_, index) => ({
      sessionId: uuidv7(),
      recordId: uuidv7(),
      pendingReviewId: uuidv7(),
      validReviewId: uuidv7(),
      businessDate: new Date(Date.UTC(2026, 7, index + 1)),
    }));
    await prisma.$transaction(async (transaction) => {
      await transaction.exerciseSession.createMany({
        data: sessions.map((entry) => ({
          id: entry.sessionId,
          organizationId: foundation.organizationId,
          studentId: student.studentId,
          enrollmentId: student.enrollmentId,
          classSectionId: foundation.teacherAActiveSectionId,
          semesterId: foundation.semesterId,
          startedByAuthSessionId: student.authSessionId,
          status: 'COMPLETED',
          startedAt: new Date(entry.businessDate.getTime() + 1_000),
          businessDate: entry.businessDate,
          completedAt: new Date(entry.businessDate.getTime() + 7_201_000),
          endReason: 'USER_COMPLETED',
          actualDurationSeconds: 7_200n,
          pausedDurationSeconds: 0n,
          createdAt: now,
          updatedAt: now,
        })),
      });
      await transaction.exerciseRecord.createMany({
        data: sessions.map((entry, index) => ({
          id: entry.recordId,
          organizationId: foundation.organizationId,
          semesterId: foundation.semesterId,
          studentId: student.studentId,
          enrollmentId: student.enrollmentId,
          classSectionId: foundation.teacherAActiveSectionId,
          courseId: foundation.activeCourseId,
          teacherId: foundation.teacherProfileId,
          sessionId: entry.sessionId,
          businessDate: entry.businessDate,
          creditType: 'GENERAL',
          sportType: 'RUNNING',
          description: `Synthetic qualified record ${index + 1}`,
          actualDurationSeconds: 7_200n,
          pausedDurationSeconds: 0n,
          creditedDurationSeconds: 7_200n,
          status: 'REVIEWED',
          submittedAt: now,
          clientRequestId: `qualified-${index + 1}-${uuidv7()}`,
          version: 3,
          createdAt: now,
          updatedAt: now,
        })),
      });
      await transaction.reviewRecord.createMany({
        data: sessions.map((entry) => ({
          id: entry.pendingReviewId,
          organizationId: foundation.organizationId,
          recordId: entry.recordId,
          reviewVersion: 1,
          result: 'PENDING',
          createdAt: now,
        })),
      });
      await transaction.reviewRecord.createMany({
        data: sessions.map((entry) => ({
          id: entry.validReviewId,
          organizationId: foundation.organizationId,
          recordId: entry.recordId,
          reviewVersion: 2,
          previousReviewId: entry.pendingReviewId,
          teacherId: foundation.teacherProfileId,
          result: 'VALID',
          reviewedAt: now,
          createdAt: now,
        })),
      });
    });

    const rejected = await request(
      '/api/v1/exercise-sessions',
      authenticated(
        token,
        'POST',
        { enrollmentId: student.enrollmentId, clientObservedAt: now.toISOString() },
        uuidv7(),
      ),
    );

    assert.equal(rejected.status, 201, JSON.stringify(rejected.body));
    assert.equal(
      await prisma.exerciseSession.count({
        where: { enrollmentId: student.enrollmentId, status: { in: ['IN_PROGRESS', 'PAUSED'] } },
      }),
      1,
    );
  });
});
