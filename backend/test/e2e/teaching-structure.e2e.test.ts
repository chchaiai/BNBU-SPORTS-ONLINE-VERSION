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
}

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

describe('Course and ClassSection HTTP E2E', () => {
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

  const createStudentToken = async (): Promise<string> => {
    const userId = uuidv7();
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
          id: uuidv7(),
          organizationId: fixture.organizationId,
          userId,
          studentNumber: '00999999',
          fullName: 'Synthetic E2E Student',
          gender: 'OTHER',
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
    const nowSeconds = Math.floor(now.getTime() / 1_000);
    return new SignJWT({
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
      .setIssuedAt(nowSeconds)
      .setExpirationTime(nowSeconds + 600)
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
    await prisma.v81AccountSecurity.create({ data: {
      userId: fixture.teacherCUserId, organizationId: fixture.isolationOrganizationId,
      mustChangePassword: false, passwordChangedAt: new Date(),
    } });
    await prisma.v81AdminAccess.create({ data: {
      userId: fixture.adminUserId, organizationId: fixture.organizationId,
      kind: 'SUB', permissions: ['COURSE_VIEW'], mustChangePassword: false,
    } });
  });

  after(async () => {
    child.kill();
    await prisma.$disconnect();
  });

  it('applies role-scoped Course reads and stable bound cursor pagination', async () => {
    const adminToken = await login(fixture.adminEmail);
    const teacherToken = await login(fixture.teacherEmail);
    const first = await request(
      '/api/v1/courses?limit=2&sort=courseCode',
      authenticated(adminToken),
    );
    assert.equal(first.status, 200);
    assert.equal(array(first.body.data).length, 2);
    const pagination = object(object(first.body.meta).pagination);
    assert.equal(pagination.hasMore, true);
    assert.equal(typeof pagination.nextCursor, 'string');

    const second = await request(
      `/api/v1/courses?limit=2&sort=courseCode&cursor=${encodeURIComponent(String(pagination.nextCursor))}`,
      authenticated(adminToken),
    );
    assert.equal(second.status, 200);
    assert.equal(array(second.body.data).length, 1);

    const wrongPrincipal = await request(
      `/api/v1/courses?limit=2&sort=courseCode&cursor=${encodeURIComponent(String(pagination.nextCursor))}`,
      authenticated(teacherToken),
    );
    assert.equal(wrongPrincipal.status, 422);
    assert.equal(wrongPrincipal.body.code, 'VALIDATION_FORMAT_INVALID');

    const teacherList = await request('/api/v1/courses?limit=100', authenticated(teacherToken));
    assert.equal(teacherList.status, 200);
    assert.equal(array(teacherList.body.data).length, 2);
    assert.equal(
      (await request(`/api/v1/courses/${fixture.inactiveCourseId}`, authenticated(teacherToken)))
        .status,
      404,
    );
  });

  it('exposes organization-scoped outbox diagnostics with filtering, pagination and no sensitive payload', async()=>{
    const admin=await login(fixture.adminEmail),teacher=await login(fixture.teacherEmail);
    const path='/api/v1/health/admin/outbox';
    assert.equal((await request(path,authenticated(admin))).status,403);
    assert.equal((await request(path,authenticated(teacher))).status,403);
    await prisma.v81AdminAccess.update({where:{userId:fixture.adminUserId},data:{permissions:['AUDIT_QUERY']}});
    const now=new Date(),diagnostic=uuidv7();
    for(const [organizationId,status] of [[fixture.organizationId,'PENDING'],[fixture.organizationId,'FAILED'],[fixture.isolationOrganizationId,'PENDING']] as const){
      await prisma.$executeRaw`INSERT INTO outbox_events(id,organization_id,status,aggregate_type,aggregate_id,event_type,event_version,payload,created_at,available_at,attempts,last_error_code)
        VALUES(${uuidv7()}::uuid,${organizationId}::uuid,${status},'SYNTHETIC',${uuidv7()}::uuid,'DEMAND_DIAGNOSTIC',1,
          ${JSON.stringify({requestId:diagnostic,token:'DO_NOT_EXPOSE_TOKEN',email:'private@example.invalid'})}::jsonb,
          ${now}::timestamptz + interval '500 microseconds',${now}::timestamptz + interval '500 microseconds',${status==='FAILED'?2:0},${status==='FAILED'?'DELIVERY_FAILED':null})`;
    }
    const first=await request(path+'?eventType=DEMAND_DIAGNOSTIC&limit=1',authenticated(admin));
    assert.equal(first.status,200,JSON.stringify(first.body));
    const firstPage=object(first.body.data);assert.equal(firstPage.total,2);
    assert.equal(array(firstPage.items).length,1);assert.equal(array(firstPage.items)[0]?.requestId,diagnostic);
    assert.doesNotMatch(JSON.stringify(first.body),/DO_NOT_EXPOSE_TOKEN|private@example|payload|lockedBy/);
    const second=await request(path+'?eventType=DEMAND_DIAGNOSTIC&limit=1&cursor='+encodeURIComponent(String(firstPage.nextCursor)),authenticated(admin));
    assert.equal(second.status,200);assert.equal(array(object(second.body.data).items).length,1);
    assert.notEqual(array(object(second.body.data).items)[0]?.id,array(firstPage.items)[0]?.id);
    const failed=await request(path+'?status=FAILED&eventType=DEMAND_DIAGNOSTIC',authenticated(admin));
    assert.equal(object(failed.body.data).total,1);
    assert.equal(array(object(failed.body.data).items)[0]?.lifecycle,'RETRY_PENDING');
    const health=await request('/api/v1/health/admin',authenticated(admin));
    assert.equal(object(object(object(health.body.data).dependencies).notificationQueue).backlog,firstPage.backlog);
    const invalid=await request(path+'?from=2026-09-17T00:00:00Z&to=2026-09-16T00:00:00Z',authenticated(admin));assert.equal(invalid.status,422);
  });

  it('keeps formal major confirmation locked across administrator correction and repeated requests', async () => {
    const studentToken=await createStudentToken();
    const profile=await prisma.studentProfile.findFirstOrThrow({where:{studentNumber:'00999999'}});
    await prisma.studentProfile.update({where:{id:profile.id},data:{fullName:'Synthetic Student',studentNumber:'2300000001',collegeName:'SCC',majorName:'未分流',dateOfBirth:new Date('2004-01-01'),regionCode:'HK'}});
    const body={collegeName:'SCC',majorName:'JC',dateOfBirth:'2004-01-01',regionCode:'HK',expectedVersion:1};
    const key=uuidv7();
    const confirmed=await request('/api/v1/me/student-profile',authenticated(studentToken,'POST',body,key));
    assert.equal(confirmed.status,200,JSON.stringify(confirmed.body));
    const replay=await request('/api/v1/me/student-profile',authenticated(studentToken,'POST',body,key));
    assert.deepEqual(replay.body.data,confirmed.body.data);
    const denied=await request('/api/v1/me/student-profile',authenticated(studentToken,'POST',{...body,majorName:'MUS',expectedVersion:2},uuidv7()));
    assert.equal(denied.status,422,JSON.stringify(denied.body));
    const admin=await login(fixture.adminEmail),teacher=await login(fixture.teacherEmail);
    const correction={collegeName:'SCC',majorName:'未分流',majorCorrectionReason:'Synthetic correction verification',expectedVersion:2};
    const path=`/api/v1/students/${profile.id}`;
    assert.equal((await request(path,authenticated(teacher,'PATCH',correction,uuidv7()))).status,403);
    assert.equal((await request(path,authenticated(admin,'PATCH',correction,uuidv7()))).status,403);
    await prisma.v81AdminAccess.update({where:{userId:fixture.adminUserId},data:{permissions:['USER_ACCOUNTS']}});
    const corrected=await request(path,authenticated(admin,'PATCH',correction,uuidv7()));
    assert.equal(corrected.status,200,JSON.stringify(corrected.body));
    assert.equal(object(corrected.body.data).majorConfirmationLocked,true);
    const reused=await request('/api/v1/me/student-profile',authenticated(studentToken,'POST',{...body,expectedVersion:3},uuidv7()));
    assert.equal(reused.status,422,JSON.stringify(reused.body));
    const saved=await prisma.studentProfile.findUniqueOrThrow({where:{id:profile.id}});
    assert.equal(saved.majorName,'未分流');assert.equal(saved.userId,profile.userId);assert.equal(saved.version,3);
  });

  it('creates and updates the teacher course with replay while administrators remain read-only', async () => {
    const teacher = await login(fixture.teacherEmail);
    const admin = await login(fixture.adminEmail);
    const before = await prisma.course.count();
    const body = { displayName: 'Synthetic Teacher New Course' };
    for (const token of [teacher, admin]) {
      const denied = await request('/api/v1/courses', authenticated(token, 'POST',
        { courseCode: 'SYNTH-DENIED', courseName: 'Synthetic denied legacy creation' }, uuidv7()));
      assert.equal(denied.status, 403);
    }
    assert.equal((await request('/api/v1/teacher/courses', authenticated(admin, 'POST', body, uuidv7()))).status, 403);
    assert.equal(await prisma.course.count(), before);
    const oldCourse = await prisma.course.findUniqueOrThrow({ where: { id: fixture.activeCourseId } });
    for (const access of [teacher, admin]) {
      const deniedUpdate = await request(`/api/v1/courses/${fixture.activeCourseId}`, authenticated(access, 'PATCH',
        { courseName: 'Denied legacy update', expectedVersion: oldCourse.version }, uuidv7()));
      assert.equal(deniedUpdate.status, 403, JSON.stringify(deniedUpdate.body));
    }
    assert.deepEqual(await prisma.course.findUniqueOrThrow({ where: { id: fixture.activeCourseId } }), oldCourse);

    const key = uuidv7();
    const created = await request('/api/v1/teacher/courses', authenticated(teacher, 'POST', body, key));
    assert.equal(created.status, 201, JSON.stringify(created.body));
    const section = object(created.body.data);
    const replay = await request('/api/v1/teacher/courses', authenticated(teacher, 'POST', body, key));
    assert.deepEqual(replay.body.data, created.body.data);
    assert.equal(await prisma.course.count(), before + 1);
    const events = await prisma.$queryRaw<{ count: bigint }[]>`SELECT count(*) FROM v81_events
      WHERE resource_id=${String(section.id)}::uuid AND event_type='CREATED'`;
    assert.equal(events[0]?.count, 1n);
    const course = await request('/api/v1/courses/' + section.courseId, authenticated(admin));
    assert.equal(course.status, 200);
    assert.equal(object(course.body.data).id, section.courseId);
    const conflict = await request('/api/v1/teacher/courses', authenticated(teacher, 'POST',
      { ...body, displayName: 'Changed request' }, key));
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.code, 'CONFLICT_IDEMPOTENCY_KEY_REUSED');
    const path = '/api/v1/class-sections/' + section.id;
    const renameKey = uuidv7();
    const renameBody = { displayName: 'Synthetic Updated Course', expectedVersion: section.version };
    const updated = await request(path, authenticated(teacher, 'PATCH',
      renameBody, renameKey));
    assert.equal(updated.status, 200, JSON.stringify(updated.body));
    assert.equal(object(updated.body.data).version, 2);
    assert.equal(object(updated.body.data).displayName, renameBody.displayName);
    const renamedReplay = await request(path, authenticated(teacher, 'PATCH', renameBody, renameKey));
    assert.deepEqual(renamedReplay.body.data, updated.body.data);
    const persisted = await prisma.classSection.findUniqueOrThrow({where:{id:String(section.id)}});
    assert.equal(persisted.displayName, renameBody.displayName);
    assert.equal(persisted.courseId, section.courseId);
    assert.equal(persisted.teacherId, section.teacherId);
    assert.equal(persisted.semesterId, section.semesterId);
    assert.equal((await prisma.course.findUniqueOrThrow({where:{id:String(section.courseId)}})).courseName, body.displayName);
    const stale = await request(path, authenticated(teacher, 'PATCH',
      { displayName: 'Stale name', expectedVersion: 1 }, uuidv7()));
    assert.equal(stale.status, 409);
    assert.equal(stale.body.code, 'CONFLICT_VERSION_MISMATCH');
    assert.equal((await request(path, authenticated(admin, 'PATCH',
      { displayName: 'Denied admin edit', expectedVersion: 2 }, uuidv7()))).status, 403);
    assert.equal(await prisma.auditLog.count({ where: { targetId: String(section.id) } }), 1);
    assert.equal(await prisma.outboxEvent.count({ where: { aggregateId: String(section.id) } }), 1);
  });

  it('derives the responsible teacher and replaces excluded dates atomically', async () => {
    const teacherToken = await login(fixture.teacherEmail);
    const before = await prisma.classSection.count();
    const injected = await request(
      '/api/v1/class-sections',
      authenticated(
        teacherToken,
        'POST',
        {
          courseId: fixture.activeCourseId,
          semesterId: fixture.semesterId,
          classCode: 'SYNTH-INJECTED',
          displayName: 'Synthetic Injected Teacher',
          teacherId: fixture.teacherBProfileId,
        },
        uuidv7(),
      ),
    );
    assert.equal(injected.status, 422);
    assert.equal(await prisma.classSection.count(), before);

    const created = await request(
      '/api/v1/class-sections',
      authenticated(
        teacherToken,
        'POST',
        {
          courseId: fixture.activeCourseId,
          semesterId: fixture.semesterId,
          classCode: 'SYNTH-A-NEW',
          displayName: 'Synthetic Teacher A New Section',
        },
        uuidv7(),
      ),
    );
    assert.equal(created.status, 201);
    const section = object(created.body.data);
    assert.equal(section.teacherId, fixture.teacherProfileId);
    const fetched = await request(
      `/api/v1/class-sections/${String(section.id)}`,
      authenticated(teacherToken),
    );
    assert.equal(fetched.status, 200);
    assert.equal(object(fetched.body.data).id, section.id);

    const updated = await request(
      `/api/v1/class-sections/${String(section.id)}`,
      authenticated(
        teacherToken,
        'PATCH',
        {
          checkInWindowMode: 'AVAILABLE',
          checkInStartDate: '2026-08-10',
          checkInEndDate: '2026-08-20',
          dailyStartTime: '08:30',
          dailyEndTime: '10:00',
          submissionDeadlineAt: '2026-08-21T00:00:00.000Z',
          excludedDates: ['2026-08-16', '2026-08-15'],
          expectedVersion: 1,
        },
        uuidv7(),
      ),
    );
    assert.equal(updated.status, 200);
    assert.deepEqual(object(updated.body.data).excludedDates, ['2026-08-15', '2026-08-16']);
    assert.equal(
      await prisma.classSectionExcludedDate.count({
        where: { classSectionId: String(section.id) },
      }),
      2,
    );

    const invalidWindow = await request(
      `/api/v1/class-sections/${String(section.id)}`,
      authenticated(
        teacherToken,
        'PATCH',
        {
          checkInStartDate: '2026-08-20',
          checkInEndDate: '2026-08-10',
          expectedVersion: 2,
        },
        uuidv7(),
      ),
    );
    assert.equal(invalidWindow.status, 422);

    const invalid = await request(
      `/api/v1/class-sections/${String(section.id)}`,
      authenticated(
        teacherToken,
        'PATCH',
        { excludedDates: ['2026-08-21'], expectedVersion: 2 },
        uuidv7(),
      ),
    );
    assert.equal(invalid.status, 422);
    assert.equal(
      await prisma.classSectionExcludedDate.count({
        where: { classSectionId: String(section.id) },
      }),
      2,
    );
    assert.equal(
      (await prisma.classSection.findUniqueOrThrow({ where: { id: String(section.id) } })).version,
      2,
    );
  });

  it('closes a ClassSection idempotently and preserves the historical projection', async () => {
    const teacherToken = await login(fixture.teacherEmail);
    const key = uuidv7();
    const body = { reason: 'Synthetic E2E close', expectedVersion: 1 };
    const first = await request(
      `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/close`,
      authenticated(teacherToken, 'POST', body, key),
    );
    const replay = await request(
      `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/close`,
      authenticated(teacherToken, 'POST', body, key),
    );
    assert.equal(first.status, 200);
    assert.equal(replay.status, 200);
    assert.equal(object(first.body.data).status, 'CLOSED');
    assert.equal(object(replay.body.data).version, 2);
    assert.equal(
      (
        await request(
          `/api/v1/class-sections/${fixture.teacherAActiveSectionId}`,
          authenticated(
            teacherToken,
            'PATCH',
            { displayName: 'Not writable', expectedVersion: 2 },
            uuidv7(),
          ),
        )
      ).body.code,
      'COURSE_CLASS_SECTION_NOT_WRITABLE',
    );
    assert.equal(
      await prisma.auditLog.count({
        where: { targetId: fixture.teacherAActiveSectionId, actionType: 'CLASS_SECTION_CLOSED' },
      }),
      1,
    );
  });

  it('enforces teacher ownership, administrator read-only governance, and organization isolation', async () => {
    const teacherAToken = await login(fixture.teacherEmail);
    const teacherBToken = await login(fixture.teacherBEmail);
    const teacherCToken = await login(fixture.teacherCEmail);
    const adminToken = await login(fixture.adminEmail);
    assert.equal(
      (
        await request(
          `/api/v1/class-sections/${fixture.teacherBActiveSectionId}`,
          authenticated(teacherAToken),
        )
      ).status,
      404,
    );
    const deniedWrite = await request(
      `/api/v1/class-sections/${fixture.teacherBActiveSectionId}`,
      authenticated(
        teacherAToken,
        'PATCH',
        { displayName: 'Cross teacher write', expectedVersion: 1 },
        uuidv7(),
      ),
    );
    assert.equal(deniedWrite.status, 403);
    assert.equal(deniedWrite.body.code, 'PERMISSION_COURSE_SCOPE_DENIED');
    assert.equal(
      (
        await request(
          `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/close`,
          authenticated(
            teacherBToken,
            'POST',
            { reason: 'Cross teacher close', expectedVersion: 1 },
            uuidv7(),
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          '/api/v1/class-sections',
          authenticated(
            adminToken,
            'POST',
            {
              courseId: fixture.activeCourseId,
              semesterId: fixture.semesterId,
              classCode: 'SYNTH-ADMIN-DENIED',
              displayName: 'Synthetic Admin Denied Section',
            },
            uuidv7(),
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/v1/class-sections/${fixture.teacherAActiveSectionId}`,
          authenticated(
            adminToken,
            'PATCH',
            { displayName: 'Admin proxy denied', expectedVersion: 1 },
            uuidv7(),
          ),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/v1/class-sections/${fixture.teacherAActiveSectionId}/close`,
          authenticated(
            adminToken,
            'POST',
            { reason: 'Admin proxy denied', expectedVersion: 1 },
            uuidv7(),
          ),
        )
      ).status,
      403,
    );
    const teacherOwn = await request(
      `/api/v1/teachers/${fixture.teacherProfileId}/class-sections?limit=100`,
      authenticated(teacherAToken),
    );
    assert.equal(teacherOwn.status, 200);
    assert.equal(array(teacherOwn.body.data).length, 2);
    assert.equal(
      (
        await request(
          `/api/v1/teachers/${fixture.teacherBProfileId}/class-sections`,
          authenticated(teacherAToken),
        )
      ).status,
      403,
    );
    assert.equal(
      (
        await request(
          `/api/v1/teachers/${fixture.teacherBProfileId}/class-sections?limit=100`,
          authenticated(adminToken),
        )
      ).status,
      200,
    );
    assert.equal(
      (
        await request(
          `/api/v1/class-sections/${fixture.teacherCSectionId}`,
          authenticated(adminToken),
        )
      ).status,
      404,
    );

    const teacherBList = await request(
      '/api/v1/class-sections?limit=1',
      authenticated(teacherBToken),
    );
    const cursor = object(object(teacherBList.body.meta).pagination).nextCursor;
    assert.equal(typeof cursor, 'string');
    const reused = await request(
      `/api/v1/class-sections?limit=1&cursor=${encodeURIComponent(String(cursor))}`,
      authenticated(teacherAToken),
    );
    assert.equal(reused.status, 422);
    const otherOrganization = await request(
      `/api/v1/class-sections?limit=1&cursor=${encodeURIComponent(String(cursor))}`,
      authenticated(teacherCToken),
    );
    assert.equal(otherOrganization.status, 422);
  });

  it('keeps archived Semester and inactive Course creation failures free of side effects', async () => {
    const teacherToken = await login(fixture.teacherEmail);
    const before = {
      sections: await prisma.classSection.count(),
      audits: await prisma.auditLog.count(),
      outbox: await prisma.outboxEvent.count(),
    };
    const inactive = await request(
      '/api/v1/class-sections',
      authenticated(
        teacherToken,
        'POST',
        {
          courseId: fixture.inactiveCourseId,
          semesterId: fixture.semesterId,
          classCode: 'SYNTH-INACTIVE-FAIL',
          displayName: 'Synthetic Inactive Course Failure',
        },
        uuidv7(),
      ),
    );
    assert.equal(inactive.status, 409);
    const archived = await request(
      '/api/v1/class-sections',
      authenticated(
        teacherToken,
        'POST',
        {
          courseId: fixture.activeCourseId,
          semesterId: fixture.archivedSemesterId,
          classCode: 'SYNTH-ARCHIVED-FAIL',
          displayName: 'Synthetic Archived Semester Failure',
        },
        uuidv7(),
      ),
    );
    assert.equal(archived.status, 409);
    assert.equal(archived.body.code, 'COURSE_SEMESTER_ARCHIVED');
    assert.deepEqual(
      {
        sections: await prisma.classSection.count(),
        audits: await prisma.auditLog.count(),
        outbox: await prisma.outboxEvent.count(),
      },
      before,
    );
  });

  it('returns an empty student projection without ACTIVE Enrollment and rejects writes', async () => {
    const studentToken = await createStudentToken();
    const courseList = await request('/api/v1/courses', authenticated(studentToken));
    const sectionList = await request('/api/v1/class-sections', authenticated(studentToken));
    assert.equal(courseList.status, 200);
    assert.equal(sectionList.status, 200);
    assert.deepEqual(courseList.body.data, []);
    assert.deepEqual(sectionList.body.data, []);
    assert.equal(
      (
        await request(
          '/api/v1/courses',
          authenticated(
            studentToken,
            'POST',
            { courseCode: 'SYNTH-STUDENT', courseName: 'Synthetic Student Course' },
            uuidv7(),
          ),
        )
      ).status,
      403,
    );
    assert.equal((await request('/api/v1/courses')).status, 401);
    const teacherToken = await login(fixture.teacherEmail);
    assert.equal(
      (
        await request(
          `/api/v1/class-sections?teacherId=${fixture.teacherBProfileId}`,
          authenticated(teacherToken),
        )
      ).status,
      422,
    );
  });

  it('rejects unsupported mode values and maintenance mutations without side effects', async () => {
    const teacherToken = await login(fixture.teacherEmail);
    const before = await prisma.classSection.count();
    const body = {
      courseId: fixture.activeCourseId,
      semesterId: fixture.semesterId,
      classCode: 'SYNTH-MODE-DENIED',
      displayName: 'Synthetic Mode Denied Section',
    };
    await assert.rejects(prisma.systemPolicy.updateMany({ data: { systemMode: 'READ_ONLY' } }));
    await prisma.systemPolicy.updateMany({ data: { systemMode: 'MAINTENANCE' } });
    const maintenance = await request(
      '/api/v1/class-sections',
      authenticated(teacherToken, 'POST', body, uuidv7()),
    );
    assert.equal(maintenance.status, 503);
    assert.equal(maintenance.body.code, 'SYSTEM_MAINTENANCE');
    assert.equal(await prisma.classSection.count(), before);
  });
});
