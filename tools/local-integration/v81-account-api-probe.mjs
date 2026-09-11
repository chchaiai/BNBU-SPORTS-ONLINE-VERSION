import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { setTimeout as delay } from 'node:timers/promises';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';
import { createTestPrisma, seedFoundationFixture } from '../../backend/test/helpers/database.ts';
import { TEST_PASSWORD } from '../../backend/test/helpers/test-environment.ts';
import { syntheticPng } from './synthetic-png.mjs';

export async function probeAccounts(databaseUrl, baseUrl, localStorage) {
  const prisma = createTestPrisma(databaseUrl);
  try {
    const fixture = await seedFoundationFixture(prisma, randomUUID().slice(0, 8).toUpperCase());
    await prisma.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind)
      VALUES (${fixture.adminUserId}::uuid,${fixture.organizationId}::uuid,'SUPER')`;
    const request = async (path, token, body, key = randomUUID()) => {
      const response = await fetch(baseUrl + path, { method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json', 'idempotency-key': key,
          ...(token ? { authorization: `Bearer ${token}` } : {}) },
        ...(body ? { body: JSON.stringify(body) } : {}) });
      const value = await response.json();
      assert.ok(response.ok, `${path}: HTTP ${response.status} ${value.code ?? value.error?.code ?? ''} ${JSON.stringify(value.details ?? {})}`);
      return value.data;
    };
    let adminToken, teacherToken, adminSession, teacherSession;
    const otherTeacherTokens = [];
    for (const [role, account] of [['ADMIN', fixture.adminEmail], ['TEACHER', fixture.teacherEmail],
      ['OTHER_TEACHER', fixture.teacherBEmail], ['OTHER_ORGANIZATION', fixture.teacherCEmail]]) {
      const login = await request('/auth/password-login', null, { account, password: TEST_PASSWORD });
      const status = await request('/auth/account-security', login.accessToken);
      assert.equal(status.mustChangePassword, true);
      if (process.env.V81_PASSWORD_RACE === '1' && role === 'ADMIN') {
        const otherSession = await request('/auth/password-login', null, { account, password: TEST_PASSWORD });
        const candidates = ['Synthetic-Race-A-' + randomUUID(), 'Synthetic-Race-B-' + randomUUID()];
        const keys = candidates.map(() => randomUUID());
        const bodies = candidates.map(newPassword => ({ currentPassword: TEST_PASSWORD, newPassword,
          confirmPassword: newPassword, expectedVersion: status.version }));
        const outcomes = await Promise.all(bodies.map((body, index) => fetch(baseUrl + '/auth/own-password', {
          method: 'POST', headers: { authorization: `Bearer ${login.accessToken}`, 'content-type': 'application/json',
            'idempotency-key': keys[index] }, body: JSON.stringify(body) })));
        assert.deepEqual(outcomes.map(response => response.status).sort(), [201, 409]);
        const winner = outcomes.findIndex(response => response.status === 201);
        const success = (await outcomes[winner].json()).data;
        assert.equal(success.version, status.version + 1);
        assert.deepEqual(await request('/auth/own-password', login.accessToken, bodies[winner], keys[winner]), success);
        const renewed = await request('/auth/password-login', null, { account, password: candidates[winner] });
        assert.equal((await request('/auth/account-security', renewed.accessToken)).version, success.version);
        const revoked = await fetch(baseUrl + '/auth/account-security', { headers: { authorization: `Bearer ${otherSession.accessToken}` } });
        assert.equal(revoked.status, 401);
        const currentSession = await request('/auth/account-security', login.accessToken);
        assert.equal(currentSession.mustChangePassword, false);
        const changes = await prisma.$queryRaw`SELECT version FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid
          AND resource_id=${fixture.adminUserId}::uuid AND resource_type='ACCOUNT_SECURITY' AND event_type='OWN_PASSWORD_CHANGED'`;
        assert.deepEqual(changes.map(event => event.version), [success.version]);
        console.log(JSON.stringify({ check: 'OWN_PASSWORD_CONCURRENT_VERSION_REPLAY_SESSION_REVOCATION_SINGLE_AUDIT', result: 'PASS' }));
        return;
      }
      const password = 'Synthetic-Changed-' + randomUUID();
      await request('/auth/own-password', login.accessToken, { currentPassword: TEST_PASSWORD,
        newPassword: password, confirmPassword: password, expectedVersion: status.version });
      const relogin = await request('/auth/password-login', null, { account, password });
      const changed = await request('/auth/account-security', relogin.accessToken);
      assert.equal(changed.mustChangePassword, false);
      if (role === 'ADMIN') { adminToken = relogin.accessToken; adminSession = relogin; }
      else if (role === 'TEACHER') { teacherToken = relogin.accessToken; teacherSession = relogin; }
      else otherTeacherTokens.push({ role, token: relogin.accessToken });
      console.log(JSON.stringify({ check: 'LOGIN_AND_FIRST_PASSWORD_CHANGE', role, result: 'PASS' }));
    }
    if (process.env.V81_SUBADMIN_IDENTITY === '1') {
      const { probeSubadminIdentity } = await import('./v81-subadmin-identity-probe.mjs');
      await probeSubadminIdentity({ prisma, fixture, request, baseUrl, adminToken, teacherToken });
      return;
    }
    if (process.env.V81_DELETION_DEFERRED === '1' || process.env.V81_DELETION_CHALLENGE === '1') {
      const { probeDeletionChallenge } = await import('./v81-deletion-challenge-probe.mjs');
      await probeDeletionChallenge({ prisma, fixture, request, baseUrl, adminToken, teacherToken });
      return;
    }
    if (process.env.V81_RECORD_HISTORY_READ === '1') {
      const { probeRecordHistoryRead } = await import('./v81-record-history-read-probe.mjs');
      await probeRecordHistoryRead({ prisma, fixture, request, baseUrl, teacherToken, otherTeacherTokens });
      return;
    }
    if (process.env.V81_FEEDBACK_HISTORY_READ === '1') {
      const { probeFeedbackHistoryRead } = await import('./v81-feedback-history-read-probe.mjs');
      await probeFeedbackHistoryRead({ prisma, fixture, request, adminToken });
      return;
    }
    if (process.env.V81_APPLICATION_HISTORY_READ === '1') {
      const { probeApplicationHistoryRead } = await import('./v81-application-history-read-probe.mjs');
      await probeApplicationHistoryRead({ prisma, fixture, request, baseUrl, teacherToken, otherTeacherTokens });
      return;
    }
    if (process.env.V81_FEEDBACK_TENANT_ISOLATION === '1') {
      const { probeFeedbackTenantIsolation } = await import('./v81-feedback-tenant-isolation-probe.mjs');
      await probeFeedbackTenantIsolation({ prisma, fixture, request, baseUrl, adminToken });
      return;
    }
    if (process.env.V81_HELP_STUDENT_ISOLATION === '1') {
      const { probeHelpStudentIsolation } = await import('./v81-help-student-isolation-probe.mjs');
      await probeHelpStudentIsolation({ prisma, fixture, request, baseUrl, adminToken });
      return;
    }
    if (process.env.V81_MEDIA_SIGNING_ORIGIN === '1') {
      const { probeMediaSigningOrigin } = await import('./v81-media-signing-origin-probe.mjs');
      await probeMediaSigningOrigin({ databaseUrl, fixture, localStorage });
      return;
    }
    if (process.env.V81_SUBADMIN_PERMISSIONS === '1') {
      const { probeSubadminPermissions } = await import('./v81-subadmin-permissions-probe.mjs');
      await probeSubadminPermissions({ prisma, fixture, request, baseUrl, adminToken, teacherToken });
      return;
    }
    if (process.env.V81_HISTORY_SUBJECTS === '1') {
      const { probeHistorySubjects } = await import('./v81-history-subjects-probe.mjs');
      await probeHistorySubjects({ prisma, fixture });
      if (process.env.V81_HISTORY_REFERENCES === '1') {
        const { probeHistoryReferences } = await import('./v81-history-references-probe.mjs');
        await probeHistoryReferences({ prisma, fixture, request, baseUrl, adminToken, teacherToken, otherTeacherTokens });
      }
      return;
    }

    if (process.env.V81_EVENT_ACTOR === '1') {
      const { probeEventActor } = await import('./v81-event-actor-probe.mjs');
      await probeEventActor({ prisma, fixture, request, adminToken });
      return;
    }
    if (process.env.V81_SESSION_SUBJECTS === '1') {
      const { probeSessionSubjects } = await import('./v81-session-subjects-probe.mjs');
      await probeSessionSubjects({ prisma, fixture });
      return;
    }
    if (process.env.V81_MAKEUP_SESSION === '1') {
      const { probeMakeupSession } = await import('./v81-makeup-session-probe.mjs');
      await probeMakeupSession({ prisma, fixture, request, baseUrl, teacherToken });
      return;
    }
    if (process.env.V81_RULE_TEMPLATES === '1') {
      const { probeRuleTemplates } = await import('./v81-rule-template-probe.mjs');
      await probeRuleTemplates({ prisma, fixture, request, baseUrl, adminToken, teacherToken, otherTeacherTokens });
      return;
    }
    if (process.env.V81_REMINDER_LIVE_WORKER === '1') {
      const { probeReminderLiveWorker } = await import('./v81-reminder-live-worker-probe.mjs');
      await probeReminderLiveWorker({ prisma, fixture, request, adminToken, teacherToken });
      if (process.env.V81_SYSTEM_AUDIT === '1') {
        const { probeSystemAudit } = await import('./v81-system-audit-probe.mjs');
        await probeSystemAudit({ prisma, fixture, request, adminToken, resourceType: 'COURSE_REMINDER', expectedCount: 2 });
      }
      return;
    }
    if (process.env.V81_FINAL_GRADE_HTTP === '1') {
      const { probeFinalGradeHttp } = await import('./v81-final-grade-http-probe.mjs');
      await probeFinalGradeHttp({ prisma, fixture, request, baseUrl, adminToken, teacherToken, otherTeacherTokens });
      return;
    }
    if (process.env.V81_AUDIT_EVENTS === '1') {
      const { probeAuditEvents } = await import('./v81-audit-events-probe.mjs');
      await probeAuditEvents({ prisma, fixture, request, baseUrl, adminToken, teacherToken });
      return;
    }
    if (process.env.V81_RUNTIME_LOG_SOURCE === '1') {
      const { probeRuntimeLogSource } = await import('./v81-runtime-log-source-probe.mjs');
      await probeRuntimeLogSource({ prisma, fixture, baseUrl, teacherToken, otherTeacherTokens, sourceDirectory: localStorage.runtimeLogDirectory });
      if (process.env.V81_RUNTIME_ARCHIVE_HTTP === '1') {
        const { probeRuntimeArchive } = await import('./v81-runtime-archive-probe.mjs');
        await probeRuntimeArchive({ prisma, fixture, request, baseUrl, adminToken, teacherToken, localStorage });
      }
      return;
    }
    if (process.env.V81_MAKEUP_HTTP === '1') {
      const { probeMakeupHttp } = await import('./v81-makeup-http-probe.mjs');
      await probeMakeupHttp({ prisma, fixture, request, baseUrl, teacherToken, adminToken, otherTeacherTokens });
      return;
    }
    if (process.env.V81_MAKEUP_STORAGE === '1') {
      const { probeMakeupStorage } = await import('./v81-makeup-storage-probe.mjs');
      await probeMakeupStorage(prisma, fixture);
      return;
    }
    if (process.env.V81_OCR_INTAKE === '1') {
      const bytes = syntheticPng();
      const upload = async (purpose, access = teacherToken, section = fixture.teacherAActiveSectionId, key = randomUUID(), content = bytes) => {
        const form = new FormData(); form.append('pages', new Blob([content], { type: 'image/png' }), 'synthetic.png');
        const response = await fetch(baseUrl + `/class-sections/${section}/ocr-${purpose}-batches`, {
          method: 'POST', headers: { authorization: `Bearer ${access}`, 'idempotency-key': key }, body: form });
        return { status: response.status, body: await response.json() };
      };
      const key = randomUUID(), accepted = await upload('roster', teacherToken, fixture.teacherAActiveSectionId, key);
      assert.equal(accepted.status, 201, JSON.stringify(accepted.body));
      assert.equal(accepted.body.data.recognitionStatus, 'NOT_STARTED');
      assert.equal(accepted.body.data.pages[0].sha256, createHash('sha256').update(bytes).digest('hex'));
      assert.equal(accepted.body.data.pages[0].storageKey, undefined);
      assert.deepEqual((await upload('roster', teacherToken, fixture.teacherAActiveSectionId, key)).body.data, accepted.body.data);
      const physicalAccepted = await upload('physical');
      assert.equal(physicalAccepted.status, 201);
      assert.equal((await upload('roster', adminToken)).status, 403);
      assert.equal((await upload('roster', otherTeacherTokens[0].token)).status, 404);
      assert.equal((await upload('roster', teacherToken, fixture.teacherAClosedSectionId)).status, 409);
      assert.equal((await upload('roster', teacherToken, fixture.teacherAActiveSectionId, randomUUID(), Buffer.from('invalid'))).status, 422);
      const acceptedId = accepted.body.data.id, acceptedPage = accepted.body.data.pages[0].id;
      const detailPath = `/ocr-batches/${acceptedId}`;
      const sourcePath = `${detailPath}/pages/${acceptedPage}/source`;
      const detail = await request(detailPath, teacherToken);
      assert.equal(detail.pages[0].latestAttempt, null);
      assert.equal(detail.pages[0].storageKey, undefined);
      assert.equal((await request(`${detailPath}/pages/${acceptedPage}/recognition`, teacherToken)).latestAttempt, null);
      const jobPath = `${detailPath}/pages/${acceptedPage}/recognition`;
      const createJob = (path, access = teacherToken, key = randomUUID(), expectedAttempt = 0) => fetch(baseUrl + path, {
        method: 'POST', headers: { authorization: `Bearer ${access}`, 'content-type': 'application/json', 'idempotency-key': key },
        body: JSON.stringify({ expectedAttempt }) });
      if (process.env.V81_OCR_JOBS === '1') {
        const jobKey = randomUUID(), created = await createJob(jobPath, teacherToken, jobKey);
        assert.equal(created.status, 201);
        const job = (await created.json()).data;
        assert.equal(job.status, 'QUEUED'); assert.equal(job.resultAttempt, null);
        assert.deepEqual((await (await createJob(jobPath, teacherToken, jobKey)).json()).data, job);
        assert.deepEqual(await request(`/ocr-jobs/${job.id}`, teacherToken), job);
        for (const [access, expected] of [[adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])]) {
          const denied = await createJob(jobPath, access);
          assert.equal(denied.status, expected); await denied.arrayBuffer();
          const readDenied = await fetch(baseUrl + `/ocr-jobs/${job.id}`, { headers: { authorization: `Bearer ${access}` } });
          assert.equal(readDenied.status, expected); await readDenied.arrayBuffer();
        }
        for (const expectedAttempt of [0, 1]) {
          const conflict = await createJob(jobPath, teacherToken, randomUUID(), expectedAttempt);
          assert.equal(conflict.status, 409); await conflict.arrayBuffer();
        }
        const otherPath = `/ocr-batches/${physicalAccepted.body.data.id}/pages/${physicalAccepted.body.data.pages[0].id}/recognition`;
        const contenders = await Promise.all([createJob(otherPath), createJob(otherPath)]);
        assert.deepEqual(contenders.map(item => item.status).sort(), [201, 409]);
        await Promise.all(contenders.map(item => item.arrayBuffer()));
        const jobs = await prisma.$queryRaw`SELECT status FROM v81_ocr_jobs WHERE organization_id=${fixture.organizationId}::uuid`;
        assert.equal(jobs.length, 2); assert.ok(jobs.every(row => row.status === 'QUEUED'));
        const events = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid AND resource_type='OCR_JOB' AND event_type='QUEUED'`;
        assert.equal(Number(events[0].total), 2);
        console.log(JSON.stringify({ check: 'OCR_JOB_HTTP_QUEUE_REPLAY_CONCURRENT_EXCLUSION_EXPECTED_ATTEMPT_SCOPE_SINGLE_AUDIT', result: 'PASS', workerDisabled: true }));
      } else {
        const unavailable = await createJob(jobPath);
        assert.equal(unavailable.status, 503); await unavailable.arrayBuffer();
        const jobs = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_ocr_jobs WHERE organization_id=${fixture.organizationId}::uuid`;
        assert.equal(Number(jobs[0].total), 0);
        console.log(JSON.stringify({ check: 'OCR_JOB_DISABLED_PROVIDER_503_NO_JOB_CREATED', result: 'PASS' }));
      }
      const original = await fetch(baseUrl + sourcePath, { headers: { authorization: `Bearer ${teacherToken}` } });
      assert.equal(original.status, 200); assert.equal(original.headers.get('cache-control'), 'no-store');
      assert.ok(Buffer.from((await original.json()).data.fileBase64, 'base64').equals(bytes));
      const listPath = `/class-sections/${fixture.teacherAActiveSectionId}/ocr-batches?limit=1`;
      const firstPage = await request(listPath, teacherToken);
      assert.equal(firstPage.items.length, 1); assert.ok(firstPage.nextBeforeId);
      const secondPage = await request(`${listPath}&beforeId=${firstPage.nextBeforeId}`, teacherToken);
      assert.equal(secondPage.items.length, 1); assert.equal(secondPage.nextBeforeId, null);
      assert.notEqual(firstPage.items[0].id, secondPage.items[0].id);
      for (const path of [detailPath, sourcePath, `${detailPath}/pages/${acceptedPage}/recognition`]) {
        for (const [access, expected] of [[adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])]) {
          const denied = await fetch(baseUrl + path, { headers: { authorization: `Bearer ${access}` } });
          assert.equal(denied.status, expected); await denied.arrayBuffer();
        }
      }
      const absentPage = await fetch(baseUrl + `${detailPath}/pages/${randomUUID()}/source`, { headers: { authorization: `Bearer ${teacherToken}` } });
      assert.equal(absentPage.status, 404); await absentPage.arrayBuffer();
      const batches = await prisma.$queryRaw`SELECT id,source_manifest FROM v81_ocr_batches WHERE organization_id=${fixture.organizationId}::uuid`;
      assert.equal(batches.length, 2);
      const require = createRequire(new URL('../../backend/package.json', import.meta.url));
      const { S3Client, GetObjectCommand, PutObjectCommand, ListObjectsV2Command } = require('@aws-sdk/client-s3');
      const objects = new S3Client({ endpoint: localStorage.endpoint, region: 'us-east-1', forcePathStyle: true,
        credentials: { accessKeyId: localStorage.accessKeyId, secretAccessKey: localStorage.secretAccessKey } });
      try {
        for (const batch of batches) for (const page of batch.source_manifest) {
          const object = await objects.send(new GetObjectCommand({ Bucket: localStorage.bucket, Key: page.storageKey }));
          assert.ok(Buffer.from(await object.Body.transformToByteArray()).equals(bytes));
        }
        const listed = await objects.send(new ListObjectsV2Command({ Bucket: localStorage.bucket, Prefix: `v81/ocr/${fixture.organizationId}/` }));
        assert.equal(listed.Contents.length, 2);
        if (process.env.V81_OCR_WORKER === '1') {
          const { V81OcrWorker } = await import('../../backend/dist/modules/v8/v81-ocr.worker.js');
          const { TencentOcrProvider } = await import('../../backend/dist/modules/v8/tencent-ocr-provider.js');
          const configuration = { provider: 'TENCENT_TABLE_V3', region: 'ap-guangzhou', timeoutMs: 1000, workerEnabled: true };
          let providerCalls = 0;
          const provider = new TencentOcrProvider(configuration, { async request(action, body) {
            providerCalls++;
            assert.equal(action, 'RecognizeTableAccurateOCR');
            assert.ok(Buffer.from(body.ImageBase64, 'base64').equals(bytes));
            await delay(20);
            if (providerCalls === 1) throw Object.assign(new Error('Synthetic provider timeout'), { code: 'ETIMEDOUT' });
            const polygon = [{ X: 0, Y: 0 }, { X: 10, Y: 0 }, { X: 10, Y: 10 }, { X: 0, Y: 10 }];
            const cells = [{ Text: '000123', RowTl: 1, RowBr: 2, ColTl: 0, ColBr: 1, Confidence: 95, Polygon: polygon }];
            if (process.env.V81_OCR_DRAFT_API === '1') cells.push(
              { Text: '学号', RowTl: 0, RowBr: 1, ColTl: 0, ColBr: 1, Confidence: 95, Polygon: polygon },
              { Text: '姓名', RowTl: 0, RowBr: 1, ColTl: 1, ColBr: 2, Confidence: 95, Polygon: polygon },
              { Text: 'Synthetic OCR name', RowTl: 1, RowBr: 2, ColTl: 1, ColBr: 2, Confidence: 95, Polygon: polygon });
            return { RequestId: 'synthetic-worker-provider', TableDetections: [{ Cells: cells }] };
          } });
          const storage = { async getPrivateObject(key) {
            return (await objects.send(new GetObjectCommand({ Bucket: localStorage.bucket, Key: key }))).Body;
          } };
          const worker = new V81OcrWorker(prisma, { ocr: configuration }, { now: () => new Date() }, provider, storage);
          const secondWorker = new V81OcrWorker(prisma, { ocr: configuration }, { now: () => new Date() }, provider, storage);
          if (process.env.V81_OCR_GOVERNANCE === '1') {
            const { prepareOcrGovernance } = await import('./v81-ocr-governance-probe.mjs');
            await prepareOcrGovernance({ prisma, fixture, request, baseUrl, adminToken, teacherToken, worker, createJob, jobPath });
          }
          const failed = await worker.processOne(fixture.organizationId);
          assert.equal(failed.status, 'FAILED');
          const failedJob = await request(`/ocr-jobs/${failed.jobId}`, teacherToken);
          assert.equal(failedJob.status, 'FAILED'); assert.equal(failedJob.resultAttempt, 1);
          const failedEvidence = await request(`/ocr-batches/${failedJob.batchId}/pages/${failedJob.pageId}/recognition`, teacherToken);
          assert.equal(failedEvidence.latestAttempt.errorCode, 'OCR_PROVIDER_TIMEOUT');
          assert.equal(failedEvidence.latestAttempt.evidence, null);
          const succeeded = await worker.processOne(fixture.organizationId);
          assert.equal(succeeded.status, 'SUCCEEDED');
          const retried = await createJob(`/ocr-batches/${failedJob.batchId}/pages/${failedJob.pageId}/recognition`, teacherToken, randomUUID(), 1);
          assert.equal(retried.status, 201); const retriedJob = (await retried.json()).data;
          const contenders = await Promise.all([worker.processOne(fixture.organizationId), secondWorker.processOne(fixture.organizationId)]);
          assert.equal(contenders.filter(value => value === null).length, 1);
          assert.equal(contenders.find(value => value !== null).status, 'SUCCEEDED');
          assert.equal((await request(`/ocr-jobs/${retriedJob.id}`, teacherToken)).resultAttempt, 2);
          const recognized = await request(`/ocr-batches/${failedJob.batchId}/pages/${failedJob.pageId}/recognition`, teacherToken);
          assert.equal(recognized.latestAttempt.evidence.requiresTeacherConfirmation, true);
          assert.equal(recognized.latestAttempt.evidence.tables[0].cells[0].text, '000123');
          const attempts = await prisma.$queryRaw`SELECT attempt,outcome FROM v81_ocr_page_attempts WHERE batch_id=${failedJob.batchId}::uuid AND page_id=${failedJob.pageId}::uuid ORDER BY attempt`;
          assert.deepEqual(attempts, [{ attempt: 1, outcome: 'FAILED' }, { attempt: 2, outcome: 'SUCCEEDED' }]);
          assert.equal(providerCalls, 3);
          if (process.env.V81_OCR_GOVERNANCE === '1') {
            const { finishOcrGovernance } = await import('./v81-ocr-governance-probe.mjs');
            await finishOcrGovernance({ prisma, fixture, request, adminToken, createJob, failedJob, storage, configuration, V81OcrWorker, TencentOcrProvider });
          }
          if (process.env.V81_SYSTEM_AUDIT === '1') {
            const { probeSystemAudit } = await import('./v81-system-audit-probe.mjs');
            await probeSystemAudit({ prisma, fixture, request, adminToken, resourceType: 'OCR_JOB', expectedCount: 6, failedCount: 1 });
          }
          if (process.env.V81_OCR_PHYSICAL_HTTP === '1') {
            const { probeOcrPhysicalHttp } = await import('./v81-ocr-physical-http-probe.mjs');
            const member = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8));
            await probeOcrPhysicalHttp({ prisma, fixture, member, baseUrl, request, teacherToken, adminToken, otherTeacherTokens, password: TEST_PASSWORD });
          }
          if (process.env.V81_OCR_PHYSICAL_STORAGE === '1') {
            const { probeOcrPhysicalStorage } = await import('./v81-ocr-physical-storage-probe.mjs');
            const member = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8));
            await probeOcrPhysicalStorage(prisma, fixture, member);
          }
          if (process.env.V81_OCR_DRAFT_API === '1') {
            const { probeOcrDraftApi } = await import('./v81-ocr-draft-api-probe.mjs');
            await probeOcrDraftApi({ baseUrl, request, prisma, fixture, teacherToken, adminToken, otherTeacherTokens, batchId: failedJob.batchId, pageId: failedJob.pageId });
            if (process.env.V81_OCR_ROSTER_HTTP === '1') {
              const { probeOcrRosterHttp } = await import('./v81-ocr-roster-http-probe.mjs');
              await probeOcrRosterHttp({ baseUrl, request, prisma, fixture, teacherToken, adminToken, otherTeacherTokens, batchId: failedJob.batchId });
            }
            if (process.env.V81_OCR_ROSTER_BASIS_STORAGE === '1') {
              const { probeOcrRosterBasisStorage } = await import('./v81-ocr-roster-basis-storage-probe.mjs');
              await probeOcrRosterBasisStorage(prisma, fixture, failedJob.batchId);
            }
          }
          if (process.env.V81_OCR_DRAFT_STORAGE === '1') {
            const selection = [{ pageId: failedJob.pageId, attempt: 2, tableIndex: 0, headerRow: 0, columns: { studentNumber: 0, name: 1 } }];
            const source = { pageId: failedJob.pageId, attempt: 2, tableIndex: 0, sourceRow: 1, evidence: { studentNumber: [0] } };
            const row = { id: randomUUID(), source, values: { studentNumber: '000123', name: 'Synthetic draft name' },
              ocrIssues: [{ field: 'name', code: 'MISSING_CELL' }], reviewedAgainstSource: false };
            const createdAt = new Date();
            const insertDraft = (version, rows = [row], selections = selection, actor = fixture.teacherUserId) => prisma.$executeRaw`
              INSERT INTO v81_ocr_draft_revisions(batch_id,version,selections,draft_rows,actor_id,request_id,created_at)
              VALUES(${failedJob.batchId}::uuid,${version},${JSON.stringify(selections)}::jsonb,${JSON.stringify(rows)}::jsonb,
                ${actor}::uuid,${randomUUID()},${createdAt})`;
            await assert.rejects(insertDraft(1, [{ ...row, reviewedAgainstSource: true }]));
            await assert.rejects(insertDraft(1, [row], [{ ...selection[0], attempt: 1 }]));
            await assert.rejects(insertDraft(1, [row], [], fixture.teacherUserId));
            await assert.rejects(insertDraft(1, [row, row]));
            await assert.rejects(insertDraft(1, Array.from({ length: 501 }, () => ({ ...row, id: randomUUID() }))));
            await assert.rejects(insertDraft(1, [row], selection, fixture.teacherBUserId));
            await insertDraft(1);
            await assert.rejects(insertDraft(3));
            await assert.rejects(insertDraft(2, [{ ...row, source: { ...source, sourceRow: 2 } }]));
            await assert.rejects(insertDraft(2, [{ ...row, ocrIssues: [] }]));
            await insertDraft(2, [{ ...row, values: { studentNumber: '000123', name: 'Teacher checked name' }, reviewedAgainstSource: true }]);
            await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_draft_revisions SET draft_rows='[]'::jsonb WHERE batch_id=${failedJob.batchId}::uuid`);
            await assert.rejects(prisma.$executeRaw`DELETE FROM v81_ocr_draft_revisions WHERE batch_id=${failedJob.batchId}::uuid`);
            const revisions = await prisma.$queryRaw`SELECT version,draft_rows FROM v81_ocr_draft_revisions WHERE batch_id=${failedJob.batchId}::uuid ORDER BY version`;
            assert.deepEqual(revisions.map(item => item.version), [1, 2]);
            assert.equal(revisions[0].draft_rows[0].values.name, 'Synthetic draft name');
            assert.equal(revisions[1].draft_rows[0].values.name, 'Teacher checked name');
            assert.deepEqual(revisions[1].draft_rows[0].source, revisions[0].draft_rows[0].source);
            console.log(JSON.stringify({ check: 'OCR_DRAFT_STORAGE_SOURCE_ATTEMPT_SCOPE_501_LIMIT_NO_AUTO_REVIEW_IMMUTABLE_REVISIONS', result: 'PASS', storageMetadataOnly: true }));
          }
          console.log(JSON.stringify({ check: 'OCR_WORKER_PRIVATE_SOURCE_PROVIDER_TIMEOUT_HISTORY_RETRY_CONCURRENT_SINGLE_CLAIM_HTTP_READBACK', result: 'PASS', providerSimulated: true }));
        }
        const sourceKey = batches.find(batch => batch.id === acceptedId).source_manifest[0].storageKey;
        try {
          await objects.send(new PutObjectCommand({ Bucket: localStorage.bucket, Key: sourceKey, Body: Buffer.from('tampered') }));
          const altered = await fetch(baseUrl + sourcePath, { headers: { authorization: `Bearer ${teacherToken}` } });
          assert.equal(altered.status, 500); assert.equal((await altered.json()).data?.fileBase64, undefined);
        } finally { await objects.send(new PutObjectCommand({ Bucket: localStorage.bucket, Key: sourceKey, Body: bytes, ContentType: 'image/png' })); }
        assert.ok(Buffer.from((await request(sourcePath, teacherToken)).fileBase64, 'base64').equals(bytes));
      } finally { objects.destroy(); }
      const closedAt = new Date();
      await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: { status: 'CLOSED',
        closedAt, closedBy: fixture.teacherUserId, closeReason: 'Synthetic OCR existing source read', updatedAt: closedAt, version: { increment: 1 } } });
      assert.equal((await request(detailPath, teacherToken)).id, acceptedId);
      assert.ok(Buffer.from((await request(sourcePath, teacherToken)).fileBase64, 'base64').equals(bytes));
      console.log(JSON.stringify({ check: 'OCR_READ_LIST_PAGINATION_PRIVATE_SOURCE_HASH_TAMPER_RESTORE_SCOPE_CLOSED_EXISTING', result: 'PASS' }));
      console.log(JSON.stringify({ check: 'OCR_HTTP_PRIVATE_ORIGINAL_MULTIPART_REPLAY_CLEANUP_ROLE_CLOSED_SCOPE', result: 'PASS' }));
      return;
    }
    if (process.env.V81_OCR_STORAGE === '1') {
      const batchId = randomUUID(), pageId = randomUUID(), now = new Date();
      const page = { id: pageId, sha256: 'a'.repeat(64), storageKey: 'synthetic/private/ocr/page.png',
        mimeType: 'image/png', sizeBytes: 123 };
      const insert = (id, pages = [page], total = 123, section = fixture.teacherAActiveSectionId, actor = fixture.teacherUserId) =>
        prisma.$executeRaw`INSERT INTO v81_ocr_batches(id,organization_id,class_section_id,purpose,source_manifest,total_bytes,actor_id,request_id,created_at)
          VALUES(${id}::uuid,${fixture.organizationId}::uuid,${section}::uuid,'ROSTER',${JSON.stringify(pages)}::jsonb,${total},${actor}::uuid,${randomUUID()},${now})`;
      await insert(batchId);
      await assert.rejects(insert(randomUUID(), [page], 124));
      await assert.rejects(insert(randomUUID(), [page, page], 246));
      await assert.rejects(insert(randomUUID(), [{ ...page, sizeBytes: null }]));
      await assert.rejects(insert(randomUUID(), [{ ...page, sha256: null }]));
      await assert.rejects(insert(randomUUID(), [{ ...page, sizeBytes: 104857601 }], 104857601));
      await assert.rejects(insert(randomUUID(), [page], 123, fixture.teacherAClosedSectionId));
      await assert.rejects(insert(randomUUID(), [page], 123, fixture.teacherBActiveSectionId));
      await assert.rejects(insert(randomUUID(), [page], 123, fixture.teacherCSectionId, fixture.teacherCUserId));
      await insert(randomUUID(), [{ ...page, id: randomUUID(), sizeBytes: 104857600 }], 104857600);
      await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_batches SET total_bytes=124 WHERE id=${batchId}::uuid`);
      await assert.rejects(prisma.$executeRaw`DELETE FROM v81_ocr_batches WHERE id=${batchId}::uuid`);
      const evidence = { provider: 'TENCENT_TABLE_V3', requestId: 'synthetic-provider', sourceSha256: page.sha256,
        requiresTeacherConfirmation: true, tables: [{ cells: [] }] };
      const attempt = (version, outcome = 'SUCCEEDED', snapshot = evidence, digest = page.sha256, sourcePage = pageId) =>
        prisma.$executeRaw`INSERT INTO v81_ocr_page_attempts(batch_id,page_id,attempt,source_sha256,provider,outcome,evidence,error_code,request_id,created_at)
          VALUES(${batchId}::uuid,${sourcePage}::uuid,${version},${digest},'TENCENT_TABLE_V3',${outcome},
            ${snapshot === null ? null : JSON.stringify(snapshot)}::jsonb,${outcome === 'FAILED' ? 'OCR_PROVIDER_TIMEOUT' : null},${randomUUID()},${now})`;
      await attempt(1, 'FAILED', null);
      await assert.rejects(attempt(3));
      await assert.rejects(attempt(2, 'SUCCEEDED', evidence, 'b'.repeat(64)));
      await assert.rejects(attempt(1, 'SUCCEEDED', evidence, page.sha256, randomUUID()));
      await assert.rejects(attempt(2, 'SUCCEEDED', { ...evidence, requiresTeacherConfirmation: false }));
      await attempt(2);
      await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_page_attempts SET error_code='REWRITTEN' WHERE batch_id=${batchId}::uuid AND attempt=1`);
      await assert.rejects(prisma.$executeRaw`DELETE FROM v81_ocr_page_attempts WHERE batch_id=${batchId}::uuid`);
      const rows = await prisma.$queryRaw`SELECT attempt,outcome FROM v81_ocr_page_attempts WHERE batch_id=${batchId}::uuid ORDER BY attempt`;
      assert.deepEqual(rows, [{ attempt: 1, outcome: 'FAILED' }, { attempt: 2, outcome: 'SUCCEEDED' }]);
      const jobId = randomUUID(), firstOwner = randomUUID(), secondOwner = randomUUID();
      const enqueue = (id, expected = 2, sourcePage = pageId, actor = fixture.teacherUserId) =>
        prisma.$executeRaw`INSERT INTO v81_ocr_jobs(id,batch_id,organization_id,page_id,actor_id,expected_attempt,request_id,created_at,updated_at)
          VALUES(${id}::uuid,${batchId}::uuid,${fixture.organizationId}::uuid,${sourcePage}::uuid,${actor}::uuid,${expected},${randomUUID()},${now},${now})`;
      await assert.rejects(enqueue(randomUUID(), 1));
      await assert.rejects(enqueue(randomUUID(), 2, randomUUID()));
      await assert.rejects(enqueue(randomUUID(), 2, pageId, fixture.teacherBUserId));
      await enqueue(jobId);
      await assert.rejects(enqueue(randomUUID()));
      const at = milliseconds => new Date(now.getTime() + milliseconds);
      await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_jobs SET status='FAILED',version=2,updated_at=${at(1000)} WHERE id=${jobId}::uuid`);
      const claim = (owner, version, updatedAt, leaseUntil) => prisma.$executeRaw`UPDATE v81_ocr_jobs SET status='RUNNING',
        lease_owner=${owner}::uuid,lease_until=${leaseUntil},version=${version},updated_at=${updatedAt} WHERE id=${jobId}::uuid`;
      await claim(firstOwner, 2, at(1000), at(2000));
      await assert.rejects(claim(secondOwner, 3, at(1500), at(60000)));
      await claim(secondOwner, 3, at(2000), at(60000));
      await attempt(3, 'FAILED', null);
      await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_jobs SET status='FAILED',lease_owner=${firstOwner}::uuid,
        result_attempt=3,version=4,updated_at=${at(3000)} WHERE id=${jobId}::uuid`);
      await assert.rejects(prisma.$executeRaw`UPDATE v81_ocr_jobs SET status='SUCCEEDED',result_attempt=3,
        version=4,updated_at=${at(3000)} WHERE id=${jobId}::uuid`);
      await prisma.$executeRaw`UPDATE v81_ocr_jobs SET status='FAILED',result_attempt=3,version=4,updated_at=${at(3000)} WHERE id=${jobId}::uuid`;
      await assert.rejects(claim(firstOwner, 5, at(61000), at(62000)));
      await assert.rejects(prisma.$executeRaw`DELETE FROM v81_ocr_jobs WHERE id=${jobId}::uuid`);
      await enqueue(randomUUID(), 3);
      const jobRows = await prisma.$queryRaw`SELECT status,version,result_attempt FROM v81_ocr_jobs WHERE id=${jobId}::uuid`;
      assert.deepEqual(jobRows, [{ status: 'FAILED', version: 4, result_attempt: 3 }]);
      console.log(JSON.stringify({ check: 'OCR_JOB_DURABLE_QUEUE_UNIQUE_ACTIVE_EXPECTED_ATTEMPT_EXPIRED_LEASE_FENCING_IMMUTABLE_TERMINAL', result: 'PASS', syntheticLeaseTimes: true }));
      console.log(JSON.stringify({ check: 'OCR_STORAGE_SOURCE_SCOPE_100MIB_METADATA_LIMIT_IMMUTABLE_ATTEMPTS_SOURCE_BINDING', result: 'PASS', storageMetadataOnly: true }));
      return;
    }
    if (process.env.V81_ADMIN_DIRECTORY === '1') {
      const member = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
      const path = '/admin/course-directory';
      const result = await request(path, adminToken);
      const sections = await prisma.classSection.findMany({ where: { organizationId: fixture.organizationId,
        semesterId: fixture.semesterId, status: { in: ['ACTIVE', 'UPCOMING'] } } });
      assert.deepEqual(result.rows.map(row => row.id).sort(), sections.map(row => row.id).sort());
      assert.equal(result.summary.courses, sections.length);
      assert.equal(result.summary.teachers, new Set(sections.map(row => row.teacherId)).size);
      assert.equal(result.semester.id, fixture.semesterId);
      assert.ok(Number.isFinite(Date.parse(result.generatedAt)));
      const current = result.rows.find(row => row.id === fixture.teacherAActiveSectionId);
      assert.equal(current.courseName, sections.find(row => row.id === current.id).displayName);
      assert.equal(current.currentMembers.students, 1);
      assert.equal(current.currentMembers.totalRecords, 0);
      assert.equal(current.removedMembers.students, 0);
      assert.equal(current.completedStudents, null); assert.equal(current.completionRate, null);
      assert.equal(current.courseTargetSeconds, null);
      assert.equal(JSON.stringify(result).includes(member.studentId), false);
      assert.equal(JSON.stringify(result).includes(member.enrollmentId), false);
      for (const token of [teacherToken, ...otherTeacherTokens.map(item => item.token)]) {
        const denied = await fetch(baseUrl + path, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(denied.status, 403); await denied.arrayBuffer();
      }
      try {
        for (const permissions of [[], ['COURSE_VIEW'], ['SEMESTER_MANAGE']]) {
          await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb
            WHERE user_id=${fixture.adminUserId}::uuid`;
          const response = await fetch(baseUrl + path, { headers: { authorization: `Bearer ${adminToken}` } });
          assert.equal(response.status, permissions.includes('COURSE_VIEW') ? 200 : 403);
          await response.arrayBuffer();
        }
      } finally {
        await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      }
      const nativeFetch = globalThis.fetch, previousWindow = globalThis.window;
      const storage = new Map([['bnbu-portal-tokens-v1', JSON.stringify({ ...adminSession, role: 'ADMIN', userId: fixture.adminUserId })]]);
      globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
      const calls = [];
      globalThis.fetch = (url, options) => {
        calls.push(String(url));
        return nativeFetch(String(url).replace('/api/v1', baseUrl), options);
      };
      try {
        const { loadCourseDirectory } = await import('../../BNBU-Sports-Web-new/portal-teacher-admin/app/admin-course-directory-api.ts');
        const directory = await loadCourseDirectory();
        assert.deepEqual(calls, ['/api/v1/admin/course-directory']);
        assert.deepEqual(directory.summary, result.summary);
        const row = directory.rows.find(item => item.id === current.id);
        assert.equal(row.activeStudents, current.currentMembers.students);
        assert.equal(row.creditedSeconds, current.currentMembers.creditedSeconds);
        assert.equal(row.semesterName, result.semester.displayName);
      } finally { globalThis.fetch = nativeFetch; globalThis.window = previousWindow; }
      console.log(JSON.stringify({ check: 'ADMIN_DIRECTORY_CURRENT_SCOPE_MEMBERS_NO_STUDENT_IDENTIFIERS_PERMISSION_REVOCATION_PORTAL_HTTP', result: 'PASS' }));
      return;
    }
    if (process.env.V81_ROSTER_XLSX_UPLOAD === '1') {
      const require = createRequire(new URL('../../backend/package.json', import.meta.url));
      const { utils, write } = require('xlsx');
      const book = utils.book_new();
      utils.book_append_sheet(book, utils.aoa_to_sheet([['学号', '姓名'], ['000123', 'Synthetic Student']]), '名单');
      const bytes = write(book, { type: 'buffer', bookType: 'xlsx', compression: true });
      const key = randomUUID();
      const upload = async () => {
        const form = new FormData();
        form.append('source', 'FILE'); form.append('fileFormat', 'XLSX'); form.append('sheetName', '名单');
        form.append('fieldMappingSnapshot', JSON.stringify({ studentNumber: '学号', fullName: '姓名' }));
        form.append('file', new Blob([bytes], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'synthetic.xlsx');
        const response = await fetch(baseUrl + `/class-sections/${fixture.teacherAActiveSectionId}/roster-imports`, {
          method: 'POST', headers: { authorization: `Bearer ${teacherToken}`, 'idempotency-key': key }, body: form });
        const body = await response.json();
        assert.equal(response.status, 201, `XLSX upload: ${response.status} ${body.code ?? body.error?.code ?? ''}`);
        return body.data;
      };
      const imported = await upload();
      assert.equal(imported.status, 'VALIDATED');
      assert.deepEqual(await upload(), imported);
      const stored = await prisma.officialRosterImport.findUniqueOrThrow({ where: { id: imported.id } });
      assert.equal(stored.sourceFormat, 'XLSX'); assert.equal(stored.sourceSheet, '名单');
      assert.equal(stored.fileChecksumSha256, createHash('sha256').update(bytes).digest('hex'));
      assert.equal(await prisma.officialRosterImport.count({ where: { classSectionId: fixture.teacherAActiveSectionId } }), 1);
      const entries = await prisma.officialRosterEntry.findMany({ where: { rosterImportId: imported.id } });
      assert.equal(entries.length, 1); assert.equal(entries[0].normalizedStudentNumber, '000123');
      const { S3Client, GetObjectCommand, PutObjectCommand } = require('@aws-sdk/client-s3');
      assert.equal(localStorage.endpoint, 'http://media-minio:9000');
      const objects = new S3Client({ endpoint: localStorage.endpoint, region: 'us-east-1', forcePathStyle: true,
        credentials: { accessKeyId: localStorage.accessKeyId, secretAccessKey: localStorage.secretAccessKey } });
      try {
        const original = await objects.send(new GetObjectCommand({ Bucket: localStorage.bucket, Key: stored.sourceFileStorageKey }));
        assert.ok(Buffer.from(await original.Body.transformToByteArray()).equals(bytes));
        const sourcePath = `/roster-imports/${imported.id}/source`;
        const returned = await request(sourcePath, teacherToken);
        assert.ok(Buffer.from(returned.fileBase64, 'base64').equals(bytes));
        assert.equal(returned.fileFormat, 'XLSX'); assert.equal(returned.sheetName, '名单');
        assert.equal(returned.fileSizeBytes, bytes.length);
        assert.equal(returned.sourceSha256, stored.fileChecksumSha256);
        assert.equal(Object.hasOwn(returned, 'sourceFileStorageKey'), false);
        for (const [accessToken, expected] of [[adminToken, 403], ...otherTeacherTokens.map(value => [value.token, 404])]) {
          const denied = await fetch(baseUrl + sourcePath, { headers: { authorization: `Bearer ${accessToken}` } });
          assert.equal(denied.status, expected); await denied.arrayBuffer();
        }
        try {
          await objects.send(new PutObjectCommand({ Bucket: localStorage.bucket, Key: stored.sourceFileStorageKey,
            Body: Buffer.from('Synthetic tampered roster object') }));
          const altered = await fetch(baseUrl + sourcePath, { headers: { authorization: `Bearer ${teacherToken}` } });
          assert.equal(altered.status, 500);
          const failure = await altered.json();
          assert.equal(Object.hasOwn(failure.data ?? {}, 'fileBase64'), false);
        } finally {
          await objects.send(new PutObjectCommand({ Bucket: localStorage.bucket, Key: stored.sourceFileStorageKey, Body: bytes,
            ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        }
        const restored = await fetch(baseUrl + sourcePath, { headers: { authorization: `Bearer ${teacherToken}` } });
        assert.equal(restored.status, 200); assert.equal(restored.headers.get('cache-control'), 'no-store');
        assert.ok(Buffer.from((await restored.json()).data.fileBase64, 'base64').equals(bytes));
        console.log(JSON.stringify({ check: 'ROSTER_SOURCE_TEACHER_PRIVATE_READ_DIGEST_TAMPER_DENIED_RESTORE_NO_STORE', result: 'PASS' }));
      } finally { objects.destroy(); }
      const confirmed = await request(`/roster-imports/${imported.id}/confirmation`, teacherToken, { expectedVersion: imported.version });
      assert.equal(confirmed.rosterImportId, imported.id);
      console.log(JSON.stringify({ check: 'ROSTER_XLSX_MULTIPART_MINIO_ORIGINAL_POSTGRES_FORMAT_SHEET_REPLAY_CONFIRMATION', result: 'PASS' }));
      const negativeUpload = async ({ accessToken = teacherToken, sheetName = '名单', format = 'XLSX', content = bytes,
        requestKey = randomUUID() } = {}) => {
        const form = new FormData();
        form.append('source', 'FILE'); form.append('fileFormat', format);
        if (sheetName !== null) form.append('sheetName', sheetName);
        form.append('fieldMappingSnapshot', JSON.stringify({ studentNumber: '学号', fullName: '姓名' }));
        form.append('file', new Blob([content], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }), 'negative.xlsx');
        return fetch(baseUrl + `/class-sections/${fixture.teacherAActiveSectionId}/roster-imports`, {
          method: 'POST', headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': requestKey }, body: form });
      };
      for (const [accessToken, expected] of [[adminToken, 403], ...otherTeacherTokens.map(value => [value.token, 404])]) {
        const response = await negativeUpload({ accessToken });
        assert.equal(response.status, expected); await response.arrayBuffer();
      }
      for (const input of [{ sheetName: null }, { format: 'CSV' }]) {
        const response = await negativeUpload(input); assert.equal(response.status, 422); await response.arrayBuffer();
      }
      assert.equal(await prisma.officialRosterImport.count({ where: { classSectionId: fixture.teacherAActiveSectionId } }), 1);
      const makeWorkbook = rows => {
        const value = utils.book_new();
        utils.book_append_sheet(value, utils.aoa_to_sheet([['学号', '姓名'], ...rows]), '名单');
        return write(value, { type: 'buffer', bookType: 'xlsx', compression: true });
      };
      for (const input of [{ content: makeWorkbook([['000124', 'Synthetic missing sheet']]), sheetName: '不存在' },
        { content: makeWorkbook(Array.from({ length: 501 }, (_, index) => [String(index).padStart(6, '0'), 'Synthetic limit'])) }]) {
        const requestKey = randomUUID();
        const response = await negativeUpload({ ...input, requestKey });
        assert.equal(response.status, 422); await response.arrayBuffer();
        const repeat = await negativeUpload({ ...input, requestKey });
        assert.equal(repeat.status, 422); await repeat.arrayBuffer();
        const rejected = await prisma.officialRosterImport.findMany({ where: { classSectionId: fixture.teacherAActiveSectionId,
          fileChecksumSha256: createHash('sha256').update(input.content).digest('hex') } });
        assert.equal(rejected.length, 1); assert.equal(rejected[0].status, 'FAILED');
        assert.equal(rejected[0].isCurrent, false);
        assert.equal(await prisma.officialRosterEntry.count({ where: { rosterImportId: rejected[0].id } }), 0);
      }
      const current = await prisma.officialRosterImport.findMany({ where: { classSectionId: fixture.teacherAActiveSectionId, isCurrent: true } });
      assert.deepEqual(current.map(value => value.id), [imported.id]);
      const snapshots = await prisma.$queryRaw`SELECT id FROM v81_confirmed_rosters WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid`;
      assert.equal(snapshots.length, 1);
      console.log(JSON.stringify({ check: 'ROSTER_XLSX_SCOPE_METADATA_MISSING_SHEET_501_ROWS_FAILURE_REPLAY_CURRENT_SNAPSHOT_PRESERVED', result: 'PASS' }));
      return;
    }
    if (process.env.V81_ROSTER_SOURCE_SCHEMA === '1') {
      let sourceVersion = 0;
      const createSource = (extra = {}) => {
        const now = new Date();
        return prisma.officialRosterImport.create({ data: { id: randomUUID(), organizationId: fixture.organizationId,
          classSectionId: fixture.teacherAActiveSectionId, versionNumber: ++sourceVersion, source: 'FILE',
          fileName: 'synthetic.csv', sourceFileStorageKey: 'synthetic/source', fileChecksumSha256: 'e'.repeat(64),
          fieldMappingSnapshot: { studentNumber: '学号', fullName: '姓名' }, importedBy: fixture.teacherUserId,
          importedAt: now, createdAt: now, ...extra } });
      };
      const legacy = await createSource();
      assert.equal(legacy.sourceFormat, null);
      assert.equal(legacy.sourceSheet, null);
      const xlsx = await createSource({ fileName: 'synthetic.xlsx', sourceFormat: 'XLSX', sourceSheet: '名单' });
      assert.equal(xlsx.sourceFormat, 'XLSX');
      assert.equal(xlsx.sourceSheet, '名单');
      for (const extra of [{ fileName: 'synthetic.xlsx', sourceSheet: '名单' },
        { fileName: 'synthetic.xlsx', sourceFormat: 'XLSX' },
        { sourceFormat: 'CSV', sourceSheet: '名单' },
        { fileName: 'synthetic.xlsx', sourceFormat: 'XLSX', sourceSheet: ' ' }])
        await assert.rejects(createSource(extra));
      await assert.rejects(prisma.officialRosterImport.update({ where: { id: xlsx.id },
        data: { status: 'VALIDATING', sourceSheet: 'Changed', version: { increment: 1 } } }),
        error => String(error).includes('Roster source format and sheet are immutable'));
      await assert.rejects(prisma.officialRosterImport.update({ where: { id: legacy.id },
        data: { status: 'VALIDATING', sourceFormat: 'CSV', version: { increment: 1 } } }),
        error => String(error).includes('Roster source format and sheet are immutable'));
      const advanced = await prisma.officialRosterImport.update({ where: { id: xlsx.id },
        data: { status: 'VALIDATING', version: { increment: 1 } } });
      assert.equal(advanced.version, 2);
      assert.equal(advanced.sourceSheet, '名单');
      assert.equal((await prisma.officialRosterImport.findUniqueOrThrow({ where: { id: xlsx.id } })).sourceSheet, '名单');
      assert.equal(await prisma.officialRosterImport.count({ where: { classSectionId: fixture.teacherAActiveSectionId } }), 2);
      console.log(JSON.stringify({ check: 'ROSTER_SOURCE_FORMAT_LEGACY_CSV_XLSX_SHAPE_AND_IMMUTABILITY', result: 'PASS' }));
      return;
    }
    if (process.env.V81_ROSTER_CSV_ROW_LIMIT === '1') {
      const uploadRows = async count => {
        const csv = 'student_number,full_name\n' + Array.from({ length: count }, (_, index) =>
          `${String(index).padStart(6, '0')},Synthetic Student ${index}`).join('\n');
        const form = new FormData();
        form.append('source', 'FILE'); form.append('fileFormat', 'CSV');
        form.append('fieldMappingSnapshot', JSON.stringify({ studentNumber: 'student_number', fullName: 'full_name' }));
        form.append('file', new Blob([csv], { type: 'text/csv' }), `synthetic-${count}.csv`);
        const response = await fetch(baseUrl + `/class-sections/${fixture.teacherAActiveSectionId}/roster-imports`, {
          method: 'POST', headers: { authorization: `Bearer ${teacherToken}`, 'idempotency-key': randomUUID() }, body: form });
        return { status: response.status, body: await response.json() };
      };
      const allowed = await uploadRows(500);
      assert.equal(allowed.status, 201);
      const original = await prisma.officialRosterImport.findUniqueOrThrow({ where: { id: allowed.body.data.id } });
      assert.equal(original.totalRowCount, 500);
      assert.equal(original.status, 'VALIDATED');
      const overflow = await uploadRows(501);
      const current = await prisma.officialRosterImport.findFirstOrThrow({ where: { classSectionId: fixture.teacherAActiveSectionId, isCurrent: true } });
      console.log(JSON.stringify({ check: 'CSV_500_PERSONNEL_ROW_LIMIT_REAL_HTTP', boundary500: allowed.status,
        overflow501: overflow.status, currentRowCount: current.totalRowCount, currentPreserved: current.id === original.id,
        result: overflow.status === 422 && current.id === original.id ? 'PASS' : 'FAIL' }));
      assert.equal(overflow.status, 422);
      assert.equal(current.id, original.id);
      return;
    }
    if (process.env.V81_ROSTER_CLOSED_INTAKE === '1') {
      const upload = async (number, key = randomUUID()) => {
        const form = new FormData();
        form.append('source', 'FILE');
        form.append('fileFormat', 'CSV');
        form.append('fieldMappingSnapshot', JSON.stringify({ studentNumber: 'student_number', fullName: 'full_name',
          gender: null, gradeYear: null, collegeName: null, majorName: null, administrativeClassName: null }));
        form.append('file', new Blob([`student_number,full_name\n${number},Synthetic Student\n`], { type: 'text/csv' }), 'synthetic-roster.csv');
        const response = await fetch(baseUrl + `/class-sections/${fixture.teacherAActiveSectionId}/roster-imports`, {
          method: 'POST', headers: { authorization: `Bearer ${teacherToken}`, 'idempotency-key': key }, body: form });
        return { status: response.status, body: await response.json() };
      };
      const originalKey = randomUUID();
      const open = await upload('000123', originalKey);
      assert.equal(open.status, 201, `Open upload: ${open.status} ${open.body.error?.code ?? open.body.code ?? ''}`);
      assert.equal(open.body.data.status, 'VALIDATED');
      const closedAt = new Date();
      await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: { status: 'CLOSED',
        closedAt, closedBy: fixture.teacherUserId, closeReason: 'Synthetic roster intake boundary', updatedAt: closedAt,
        version: { increment: 1 } } });
      const before = await prisma.officialRosterImport.count({ where: { classSectionId: fixture.teacherAActiveSectionId } });
      const replay = await upload('000123', originalKey);
      assert.equal(replay.status, 201);
      assert.deepEqual(replay.body.data, open.body.data);
      const closed = await upload('000124');
      const after = await prisma.officialRosterImport.count({ where: { classSectionId: fixture.teacherAActiveSectionId } });
      console.log(JSON.stringify({ check: 'ROSTER_NEW_UPLOAD_AFTER_COURSE_CLOSE', httpStatus: closed.status,
        beforeImports: before, afterImports: after, expectedHttpStatus: 409, expectedAfterImports: before, preCloseReplay: replay.status,
        result: closed.status === 409 && before === after ? 'PASS' : 'FAIL' }));
      assert.equal(closed.status, 409);
      assert.equal(after, before);
      return;
    }
    if (process.env.V81_ROSTER_CLIENT === '1') {
      const nativeFetch = globalThis.fetch, previousWindow = globalThis.window;
      const storage = new Map([['bnbu-portal-tokens-v1', JSON.stringify({ ...teacherSession, role: 'TEACHER', userId: fixture.teacherUserId })]]);
      globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
      const confirmationKeys = [], uploads = [];
      let loseResponse = true;
      globalThis.fetch = async (url, options) => {
        const response = await nativeFetch(new URL(url, baseUrl), options);
        if (options?.body instanceof FormData) uploads.push(response.status);
        if (String(url).endsWith('/confirmation') && options?.method === 'POST') {
          confirmationKeys.push(new Headers(options.headers).get('Idempotency-Key'));
          if (loseResponse && response.ok) { loseResponse = false; await response.arrayBuffer(); throw new TypeError('Synthetic lost roster confirmation response'); }
        }
        return response;
      };
      try {
        const { parseRosterFile } = await import('../../BNBU-Sports-Web-new/portal-teacher-admin/app/roster-import.ts');
        const { rosterApiService } = await import('../../BNBU-Sports-Web-new/portal-teacher-admin/app/roster-reconciliation-api-service.ts');
        const parsed = await parseRosterFile(new File(['student_number,full_name\n000123,Synthetic Student\n'], 'synthetic-roster.csv', { type: 'text/csv' }));
        const input = { course: { id: fixture.teacherAActiveSectionId, code: 'SYNTHETIC', name: 'Synthetic course', teachingClassCode: '01' },
          parsed, mapping: { ...parsed.suggestedMapping, studentNumber: 'student_number', fullName: 'full_name' } };
        await assert.rejects(rosterApiService.importOfficialRoster(input));
        const recovered = await rosterApiService.importOfficialRoster(input);
        assert.equal(uploads.length, 1);
        assert.equal(confirmationKeys.length, 2);
        assert.ok(confirmationKeys[0]);
        assert.equal(confirmationKeys[0], confirmationKeys[1]);
        assert.equal(recovered.currentRoster.students[0].studentNumber, '000123');
        const imports = await prisma.officialRosterImport.findMany({ where: { classSectionId: fixture.teacherAActiveSectionId } });
        assert.equal(imports.length, 1);
        assert.equal(imports[0].status, 'VALIDATED');
        assert.ok(imports[0].sourceSha256);
        const snapshots = await prisma.$queryRaw`SELECT source_rows FROM v81_confirmed_rosters WHERE roster_import_id=${imports[0].id}::uuid`;
        assert.equal(snapshots.length, 1);
        assert.equal(snapshots[0].source_rows[0].studentNumber, '000123');
        console.log(JSON.stringify({ check: 'PORTAL_ROSTER_REAL_UPLOAD_CONFIRMATION_LOST_RESPONSE_REPLAY_SINGLE_SOURCE_SINGLE_SNAPSHOT', result: 'PASS' }));
      } finally { globalThis.fetch = nativeFetch; globalThis.window = previousWindow; }
      return;
    }
    if (process.env.V81_ROSTER_REGISTRATION === '1') {
      if (process.env.V81_SETTLED_SEMESTER_SWITCH === '1') {
        const [database] = await prisma.$queryRaw`SELECT current_database() AS name`;
        assert.equal(database.name, 'v81_runtime_test');
        const unused = await prisma.classSection.findMany({ where: { organizationId: fixture.organizationId,
          semesterId: fixture.semesterId, id: { not: fixture.teacherAActiveSectionId } }, select: { id: true } });
        assert.equal(await prisma.enrollment.count({ where: { classSectionId: { in: unused.map(row => row.id) } } }), 0);
        // Prepare a one-course current semester before creating any business facts.
        await prisma.classSection.updateMany({ where: { id: { in: unused.map(row => row.id) } },
          data: { semesterId: fixture.archivedSemesterId } });
      }
      const student = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
      const outside = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
      await prisma.studentProfile.update({ where: { id: student.studentId }, data: { gender: 'MALE' } });
      const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { id: student.studentId } });
      const now = new Date(), importId = randomUUID();
      await prisma.officialRosterImport.create({ data: { id: importId, organizationId: fixture.organizationId,
        classSectionId: fixture.teacherAActiveSectionId, versionNumber: 1, source: 'FILE', fileName: 'synthetic-preview.csv',
        sourceFileStorageKey: 'synthetic/registration-preview.csv', fileChecksumSha256: 'a'.repeat(64),
        fieldMappingSnapshot: { studentNumber: 'student_number', fullName: 'full_name' }, status: 'RECEIVED',
        importedBy: fixture.teacherUserId, importedAt: now, createdAt: now, isCurrent: false } });
      await prisma.officialRosterImport.update({ where: { id: importId }, data: { status: 'VALIDATING', version: { increment: 1 } } });
      await prisma.officialRosterEntry.create({ data: { id: randomUUID(), organizationId: fixture.organizationId,
        rosterImportId: importId, classSectionId: fixture.teacherAActiveSectionId, sourceRowNumber: 2,
        normalizedStudentNumber: profile.studentNumber, rawStudentNumberSafe: profile.studentNumber, fullName: profile.fullName,
        rowValidationStatus: 'VALID', rowErrorCodes: [], rawRowSnapshotSafe: {}, createdAt: now } });
      await prisma.officialRosterImport.update({ where: { id: importId }, data: { status: 'VALIDATED', totalRowCount: 1,
        validRowCount: 1, isCurrent: true, version: { increment: 1 } } });
      const path = `/roster-imports/${importId}/registration-preview`;
      await prisma.user.update({ where: { id: student.userId }, data: { emailVerifiedAt: null } });
      const pending = await request(path, teacherToken);
      assert.equal(pending.rows[0].status, 'PENDING_REGISTRATION');
      assert.equal(pending.registrationComplete, false);
      assert.equal(pending.denominator, 1);
      assert.equal(pending.extras.length, 1);
      assert.equal(pending.extras[0].studentId, outside.studentId);
      await prisma.user.update({ where: { id: student.userId }, data: { emailVerifiedAt: now } });
      const verified = await request(path, teacherToken);
      assert.equal(verified.rows[0].status, 'MATCHED');
      assert.equal(verified.registrationComplete, true);
      assert.equal(verified.matchedCount, 1);
      assert.equal(verified.rosterImportId, importId);
      for (const [token, expected] of [[adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])]) {
        const response = await fetch(baseUrl + path, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(response.status, expected);
      }
      assert.equal(await prisma.enrollment.count({ where: { classSectionId: fixture.teacherAActiveSectionId } }), 2);
      assert.equal(await prisma.officialRosterEntry.count({ where: { rosterImportId: importId } }), 1);
      console.log(JSON.stringify({ check: 'ROSTER_REGISTRATION_DATABASE_EMAIL_VERIFICATION_EXTRAS_TEACHER_SCOPE_READONLY', result: 'PASS' }));
      const confirmationPath = `/roster-imports/${importId}/confirmation`, confirmationKey = randomUUID();
      const confirmationBody = { expectedVersion: verified.sourceVersion };
      await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: {
        dailyStartTime: new Date('1970-01-01T00:00:00Z'), dailyEndTime: new Date('1970-01-01T23:59:59Z') } });
      if(process.env.V81_SETTLEMENT_HTTP==='1') {
        const {seedHistoricalSettlementRules}=await import('./v81-settlement-http-probe.mjs');
        await seedHistoricalSettlementRules({prisma,fixture});
      } else {
      const rosterTemplate = await request('/rule-templates',adminToken,{displayName:'Synthetic roster settlement template',expectedVersion:0});
      await request(`/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`, teacherToken, {
        minimumMinutes: 30, weeklyLimit: 3, courseTarget: 600, generalTarget: 600,
        regularDeadline: '2027-01-23T15:59:59Z', closingDeadline: '2027-01-30T15:59:59Z',
        settlementPlannedAt: '2027-01-30T16:00:00Z', publish: true, expectedVersion: 0, templateId:rosterTemplate.id });
      }
      const settlementPath = `/class-sections/${fixture.teacherAActiveSectionId}/settlement-check`;
      const beforeConfirmation = await request(settlementPath, teacherToken);
      const adminRosterPath = `/admin/class-sections/${fixture.teacherAActiveSectionId}/roster-summary`;
      const unavailableSummary = await request(adminRosterPath, adminToken);
      assert.equal(unavailableSummary.available, false);
      assert.equal(unavailableSummary.matchedCount, null);
      assert.equal(unavailableSummary.denominator, null);
      assert.equal(beforeConfirmation.checks.find(check => check.code === 'CONFIRMED_OFFICIAL_ROSTER').status, 'BLOCKED');
      assert.equal(beforeConfirmation.ready, false);
      const closedAt = new Date();
      await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: { status: 'CLOSED',
        isEnrollmentOpen: false, closedAt, closedBy: fixture.teacherUserId, closeReason: 'Synthetic close after roster intake', updatedAt: closedAt,
        version: { increment: 1 } } });
      for (const [token, body, expected] of [[adminToken, confirmationBody, 403],
        [otherTeacherTokens[0].token, confirmationBody, 404], [teacherToken, { expectedVersion: 1 }, 409]]) {
        const response = await fetch(baseUrl + confirmationPath, { method: 'POST', headers: { authorization: `Bearer ${token}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(body) });
        assert.equal(response.status, expected);
      }
      const confirmed = await request(confirmationPath, teacherToken, confirmationBody, confirmationKey);
      assert.equal(confirmed.version, 1);
      assert.equal(confirmed.sourceVersion, verified.sourceVersion);
      assert.equal(confirmed.sourceSha256, 'a'.repeat(64));
      assert.equal(confirmed.sourceRows.length, 1);
      assert.equal(confirmed.sourceRows[0].studentNumber, profile.studentNumber);
      assert.equal(confirmed.sourceRows[0].sourceRowNumber, 2);
      assert.deepEqual(await request(confirmationPath, teacherToken, confirmationBody, confirmationKey), confirmed);
      assert.deepEqual(await request(confirmationPath, teacherToken), confirmed);
      await assert.rejects(prisma.$executeRaw`UPDATE v81_confirmed_rosters SET version=version+1 WHERE id=${confirmed.id}::uuid`);
      await assert.rejects(prisma.$executeRaw`DELETE FROM v81_confirmed_rosters WHERE id=${confirmed.id}::uuid`);
      assert.deepEqual(await request(confirmationPath, teacherToken), confirmed);
      const confirmations = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_confirmed_rosters WHERE roster_import_id=${importId}::uuid`;
      assert.equal(Number(confirmations[0].total), 1);
      const afterConfirmation = await request(settlementPath, teacherToken);
      assert.equal(afterConfirmation.checks.find(check => check.code === 'CONFIRMED_OFFICIAL_ROSTER').status, 'CLEAR');
      assert.equal(afterConfirmation.checks.find(check => check.code === 'CONFIRMED_OFFICIAL_ROSTER').count, 0);
      assert.equal(afterConfirmation.ready, false);
      assert.equal(afterConfirmation.checks.find(check => check.code === 'CONFIRMED_COMPOSITE_ROSTER').status, 'BLOCKED');
      const compositePath = `/class-sections/${fixture.teacherAActiveSectionId}/composite-roster`;
      const composite = await request(compositePath, teacherToken);
      assert.equal(composite.confirmedRosterId, confirmed.id);
      assert.equal(composite.ruleVersion, 1);
      assert.equal(composite.isSettlementSnapshot, false);
      assert.equal(composite.registrationComplete, true);
      assert.equal(composite.rows[0].progress.targetReached, false);
      assert.equal(composite.rows[0].progress.remainingSeconds, 72000);
      assert.equal(composite.rows[0].physical.status, 'NOT_RECORDED');
      assert.equal(composite.extras.length, 1);
      const summary = await request(adminRosterPath, adminToken);
      assert.equal(summary.available, true);
      assert.equal(summary.denominator, 1); assert.equal(summary.matchedCount, 1);
      assert.equal(summary.pendingRegistrationCount, 0); assert.equal(summary.identityConflictCount, 0);
      assert.equal(summary.extraCount, 1); assert.equal(summary.registrationComplete, true);
      assert.equal(summary.rosterVersion, confirmed.version);
      assert.deepEqual(Object.keys(summary).sort(), ['classSectionId', 'generatedAt', 'available', 'rosterVersion',
        'denominator', 'denominatorConfirmed', 'matchedCount', 'pendingRegistrationCount', 'identityConflictCount',
        'extraCount', 'registrationComplete'].sort());
      const teacherSummary = await fetch(baseUrl + adminRosterPath, { headers: { authorization: `Bearer ${teacherToken}` } });
      assert.equal(teacherSummary.status, 403); await teacherSummary.arrayBuffer();
      const foreignSummary = await fetch(baseUrl + `/admin/class-sections/${fixture.teacherCSectionId}/roster-summary`,
        { headers: { authorization: `Bearer ${adminToken}` } });
      assert.equal(foreignSummary.status, 404); await foreignSummary.arrayBuffer();
      try {
        for (const permissions of [[], ['COURSE_VIEW'], ['SEMESTER_MANAGE']]) {
          await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb
            WHERE user_id=${fixture.adminUserId}::uuid`;
          const response = await fetch(baseUrl + adminRosterPath, { headers: { authorization: `Bearer ${adminToken}` } });
          assert.equal(response.status, permissions.includes('COURSE_VIEW') ? 200 : 403);
          await response.arrayBuffer();
        }
      } finally {
        await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      }
      console.log(JSON.stringify({ check: 'ADMIN_ROSTER_AGGREGATE_UNAVAILABLE_COUNTS_NO_PERSONAL_FIELDS_COURSE_VIEW_REVOCATION_SCOPE', result: 'PASS' }));
      const rawPhysical = await request(`/enrollments/${student.enrollmentId}/physical-results`, teacherToken,
        { runType: profile.gender === 'FEMALE' ? '800m' : '1000m', elapsedSeconds: 270, testedOn: '2026-09-07', expectedVersion: 0 });
      const withPhysical = await request(compositePath, teacherToken);
      assert.equal(withPhysical.rows[0].physical.status, 'RECORDED');
      assert.equal(withPhysical.rows[0].physical.result.elapsedSeconds, 270);
      assert.equal(withPhysical.rows[0].physical.result.version, rawPhysical.version);
      if(process.env.V81_SETTLEMENT_HTTP==='1') {
        const {probeSettlementHttp}=await import('./v81-settlement-http-probe.mjs');
        await probeSettlementHttp({prisma,fixture,request,baseUrl,teacherToken,adminToken,otherTeacherTokens,outside});
        return;
      }
      if(process.env.V81_SETTLEMENT_FACTS==='1') {
        const {probeSettlementFacts}=await import('./v81-settlement-facts-probe.mjs');
        await probeSettlementFacts({prisma,fixture,student,outside});
      }
      assert.equal(withPhysical.rows[0].progress.targetReached, false);
      for (const [token, expected] of [[adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])]) {
        const response = await fetch(baseUrl + compositePath, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(response.status, expected);
      }
      console.log(JSON.stringify({ check: 'COMPOSITE_ROSTER_CONFIRMED_SOURCE_REGISTRATION_PHYSICAL_PROGRESS_SEPARATE_TEACHER_SCOPE', result: 'PASS' }));
      assert.equal(await prisma.enrollment.count({ where: { classSectionId: fixture.teacherAActiveSectionId } }), 2);
      console.log(JSON.stringify({ check: 'ROSTER_TEACHER_CONFIRMATION_SOURCE_VERSION_ROWS_REPLAY_IMMUTABLE_NO_MEMBERSHIP_CHANGE', result: 'PASS' }));
      const originalImport = await prisma.officialRosterImport.findUniqueOrThrow({ where: { id: importId } });
      const { failureDetailsSafe: omittedFailureDetails, ...replacementSource } = originalImport;
      const originalEntry = await prisma.officialRosterEntry.findFirstOrThrow({ where: { rosterImportId: importId } });
      const replacementId = randomUUID(), replacementTime = new Date();
      await prisma.officialRosterImport.create({ data: { ...replacementSource, id: replacementId, versionNumber: 2, version: 1,
        status: 'RECEIVED', totalRowCount: 0, validRowCount: 0, isCurrent: false, fileChecksumSha256: 'b'.repeat(64),
        importedAt: replacementTime, createdAt: replacementTime } });
      await prisma.officialRosterImport.update({ where: { id: replacementId }, data: { status: 'VALIDATING', version: { increment: 1 } } });
      await prisma.officialRosterEntry.create({ data: { ...originalEntry, id: randomUUID(), rosterImportId: replacementId, createdAt: replacementTime } });
      await prisma.$transaction(async tx => {
        await tx.officialRosterImport.update({ where: { id: importId }, data: { isCurrent: false, supersededAt: replacementTime, version: { increment: 1 } } });
        await tx.officialRosterImport.update({ where: { id: replacementId }, data: { status: 'VALIDATED', totalRowCount: 1,
          validRowCount: 1, isCurrent: true, version: { increment: 1 } } });
      });
      const replacedCheck = await request(settlementPath, teacherToken);
      assert.equal(replacedCheck.checks.find(check => check.code === 'CONFIRMED_OFFICIAL_ROSTER').status, 'BLOCKED');
      assert.deepEqual(await request(confirmationPath, teacherToken), confirmed);
      const lateSource = await fetch(baseUrl + `/roster-imports/${replacementId}/confirmation`, { method: 'POST',
        headers: { authorization: `Bearer ${teacherToken}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ expectedVersion: 3 }) });
      assert.equal(lateSource.status, 409);
      const replacementSnapshots = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_confirmed_rosters WHERE roster_import_id=${replacementId}::uuid`;
      assert.equal(Number(replacementSnapshots[0].total), 0);
      console.log(JSON.stringify({ check: 'ROSTER_SETTLEMENT_FOLLOWS_CURRENT_SOURCE_AND_REJECTS_POST_CLOSE_INTAKE', result: 'PASS' }));
      return;
    }
    if (process.env.V81_SEMESTER === '1') {
      const countedStudent = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
      const firstEnrollment = await prisma.enrollment.findUniqueOrThrow({ where: { id: countedStudent.enrollmentId } });
      await prisma.enrollment.create({ data: { ...firstEnrollment, id: randomUUID(), classSectionId: fixture.teacherBActiveSectionId,
        status: 'REMOVED', endedAt: firstEnrollment.joinedAt, endReason: 'Synthetic ended enrollment for summary validation' } });
      const body = { academicYear: '2030-2031', termCode: 'FIRST', displayName: 'Synthetic upcoming semester',
        startDate: '2030-09-01', endDate: '2031-01-31' };
      const path = '/admin/semesters', key = randomUUID();
      const created = await request(path, adminToken, body, key);
      assert.equal(created.status, 'UPCOMING');
      assert.equal(created.isCurrent, false);
      assert.equal(created.version, 1);
      assert.deepEqual(await request(path, adminToken, body, key), created);
      const reject = async (route, token, input, status) => {
        const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${token}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(input) });
        assert.equal(response.status, status);
      };
      await reject(path, adminToken, body, 409);
      await reject(path, teacherToken, { ...body, termCode: 'SECOND' }, 403);
      for (const invalid of [{ academicYear: '2030-2032' }, { startDate: '2030-02-30' }, { startDate: '0000-01-01' },
        { endDate: '2029-01-01' }, { displayName: ' ' }, { status: 'CURRENT' }])
        await reject(path, adminToken, { ...body, ...invalid }, 422);
      const updated = await request(path + '/' + created.id, adminToken, { ...body,
        displayName: 'Updated upcoming semester', expectedVersion: 1 });
      assert.equal(updated.version, 2);
      assert.equal(updated.displayName, 'Updated upcoming semester');
      await reject(path + '/' + created.id, adminToken, { ...body, expectedVersion: 1 }, 409);
      await reject(path + '/' + fixture.semesterId, adminToken, { ...body, expectedVersion: 1 }, 409);
      await reject(path + '/' + randomUUID(), adminToken, { ...body, expectedVersion: 1 }, 404);
      const events = await prisma.$queryRaw`SELECT version,facts FROM v81_events WHERE resource_type='SEMESTER'
        AND resource_id=${created.id}::uuid ORDER BY version`;
      assert.deepEqual(events.map(event => event.version), [1, 2]);
      assert.equal(events[1].facts.before.displayName, body.displayName);
      assert.equal(events[1].facts.after.displayName, updated.displayName);
      assert.equal(await prisma.classSection.count({ where: { semesterId: created.id } }), 0);
      assert.equal(await prisma.enrollment.count({ where: { semesterId: created.id } }), 0);
      const changes = await Promise.all(['Concurrent A', 'Concurrent B'].map(displayName => fetch(baseUrl + path + '/' + created.id, {
        method: 'POST', headers: { authorization: `Bearer ${adminToken}`, 'content-type': 'application/json',
          'idempotency-key': randomUUID() }, body: JSON.stringify({ ...body, displayName, expectedVersion: 2 }) })));
      assert.deepEqual(changes.map(response => response.status).sort(), [201, 409]);
      assert.equal((await prisma.semester.findUniqueOrThrow({ where: { id: created.id } })).version, 3);
      const revisions = await prisma.$queryRaw`SELECT version FROM v81_events WHERE resource_type='SEMESTER'
        AND resource_id=${created.id}::uuid ORDER BY version`;
      assert.deepEqual(revisions.map(event => event.version), [1, 2, 3]);
      const semesters = [];
      let cursor = null;
      do {
        const page = await request(path + '?limit=1' + (cursor ? '&after=' + cursor : ''), adminToken);
        assert.ok(page.items.length <= 1);
        semesters.push(...page.items);
        cursor = page.nextCursor;
      } while (cursor);
      assert.equal(new Set(semesters.map(row => row.id)).size, semesters.length);
      assert.equal(semesters.length, await prisma.semester.count({ where: { organizationId: fixture.organizationId } }));
      assert.ok(semesters.every(row => row.organizationId === fixture.organizationId));
      assert.equal(semesters.find(row => row.id === created.id).version, 3);
      assert.equal(semesters.find(row => row.id === fixture.semesterId).isCurrent, true);
      for (const semester of semesters) {
        assert.equal(semester.courseCount, await prisma.classSection.count({ where: { semesterId: semester.id } }));
        const students = await prisma.enrollment.findMany({ where: { semesterId: semester.id }, select: { studentId: true }, distinct: ['studentId'] });
        assert.equal(semester.studentCount, students.length);
      }
      assert.equal(semesters.find(row => row.id === created.id).courseCount, 0);
      assert.equal(semesters.find(row => row.id === created.id).studentCount, 0);
      assert.equal(semesters.find(row => row.id === fixture.semesterId).studentCount, 1);
      assert.equal(await prisma.enrollment.count({ where: { semesterId: fixture.semesterId } }), 2);
      for (const [token, query, expected] of [[teacherToken, '', 403], [adminToken, '?limit=0', 422],
        [adminToken, '?limit=101', 422], [adminToken, '?after=invalid', 422]]) {
        const response = await fetch(baseUrl + path + query, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(response.status, expected);
      }
      console.log(JSON.stringify({ check: 'SEMESTER_CREATE_EDIT_REPLAY_VALIDATION_CURRENT_READONLY_VERSION_HISTORY', result: 'PASS' }));
      await reject(path + '/' + fixture.archivedSemesterId, adminToken, { ...body, expectedVersion: 1 }, 409);
      await reject(path + '/' + fixture.isolationSemesterId, adminToken, { ...body, expectedVersion: 1 }, 404);
      const archivedBefore = await prisma.semester.findUniqueOrThrow({ where: { id: fixture.archivedSemesterId } });
      try {
        for (const permissions of [[], ['SEMESTER_MANAGE'], ['COURSE_VIEW']]) {
          await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb
            WHERE user_id=${fixture.adminUserId}::uuid`;
          const allowed = permissions.includes('SEMESTER_MANAGE');
          const listResponse = await fetch(baseUrl + path, { headers: { authorization: `Bearer ${adminToken}` } });
          assert.equal(listResponse.status, allowed ? 200 : 403);
          if (allowed) {
            const saved = await request(path + '/' + created.id, adminToken, { ...body, displayName: 'Authorized subadmin edit', expectedVersion: 3 });
            assert.equal(saved.version, 4);
          } else {
            await reject(path, adminToken, { ...body, termCode: 'SECOND' }, 403);
            await reject(path + '/' + created.id, adminToken, { ...body, expectedVersion: 4 }, 403);
          }
        }
      } finally {
        await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      }
      assert.deepEqual(await prisma.semester.findUniqueOrThrow({ where: { id: fixture.archivedSemesterId } }), archivedBefore);
      assert.equal((await prisma.semester.findUniqueOrThrow({ where: { id: created.id } })).version, 4);
      assert.equal(await prisma.semester.count({ where: { organizationId: fixture.organizationId, academicYear: body.academicYear, termCode: 'SECOND' } }), 0);
      console.log(JSON.stringify({ check: 'SEMESTER_ARCHIVED_CROSS_ORGANIZATION_SUBADMIN_GRANT_REVOKE_NO_UNAUTHORIZED_WRITES', result: 'PASS' }));
      if (process.env.V81_SEMESTER_SWITCH_CHECK === '1') {
        const { probeSemesterSwitchCheck } = await import('./v81-semester-switch-check-probe.mjs');
        await probeSemesterSwitchCheck({ prisma, fixture, request, baseUrl, adminToken, teacherToken, targetId: created.id });
      }
      if (process.env.V81_SEMESTER_SWITCH === '1') {
        const { probeSemesterSwitch } = await import('./v81-semester-switch-probe.mjs');
        await probeSemesterSwitch({ prisma, fixture, request, baseUrl, adminToken, teacherToken, targetId: created.id });
      }
      return;
    }
    if (process.env.V81_TEACHER_IMPORT === '1') {
      const previewPath = '/admin/teacher-imports/preview';
      const suffix = randomUUID();
      const csv = `employee_id,name,email,college\n001,Teacher A,teacher-a-${suffix}@custom.example,Sports\n002,Teacher B,teacher-b-${suffix}@another.example,`;
      const before = await prisma.teacherProfile.count({ where: { organizationId: fixture.organizationId } });
      const preview = await request(previewPath, adminToken, { csv });
      assert.equal(preview.canCreate, true);
      assert.equal(typeof preview.previewToken, 'string');
      assert.equal(preview.rows[0].employeeId, '001');
      assert.equal(preview.rows[1].college, null);
      assert.ok(!JSON.stringify(preview).toLowerCase().includes('password'));
      assert.deepEqual(await request(previewPath, adminToken, { csv }), preview);
      const occupied = await prisma.teacherProfile.findFirstOrThrow({ where: { userId: (await prisma.user.findFirstOrThrow({ where: { primaryEmailNormalized: fixture.teacherEmail } })).id } });
      const invalid = await request(previewPath, adminToken, { csv: `employee_id,name,email\n${occupied.employeeNumber},A,${fixture.teacherEmail}\n9,B,duplicate@example.org\n10,C,DUPLICATE@example.org` });
      assert.equal(invalid.canCreate, false);
      assert.equal(invalid.previewToken, null);
      assert.ok(invalid.rows[0].errors.includes('EMPLOYEE_ID_EXISTS'));
      assert.ok(invalid.rows[0].errors.includes('EMAIL_EXISTS'));
      assert.ok(invalid.rows.slice(1).every(row => row.errors.includes('DUPLICATE_EMAIL')));
      for (const [access, body, status] of [[teacherToken, { csv }, 403], [adminToken, { csv: 'employee_id,name,email,initial_password\n1,A,a@example.org,synthetic' }, 422]]) {
        const response = await fetch(baseUrl + previewPath, { method: 'POST', headers: { authorization: `Bearer ${access}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(body) });
        assert.equal(response.status, status);
      }
      assert.equal(await prisma.teacherProfile.count({ where: { organizationId: fixture.organizationId } }), before);
      console.log(JSON.stringify({ check: 'TEACHER_IMPORT_DATABASE_PREVIEW_CUSTOM_EMAIL_CONFLICTS_NO_CREATION_NO_PASSWORD', result: 'PASS' }));
      const confirmPath = '/admin/teacher-imports/confirm';
      const initialPassword = 'Synthetic-Initial-' + randomUUID();
      const body = { csv, previewToken: preview.previewToken, initialPassword };
      const overlappingCsv = `employee_id,name,email\n003,Teacher C,teacher-c-${suffix}@custom.example\n001,Teacher A,teacher-a-${suffix}@custom.example`;
      const overlappingPreview = await request(previewPath, adminToken, { csv: overlappingCsv });
      assert.equal(overlappingPreview.canCreate, true);
      for (const [access, input, status] of [[teacherToken, body, 403],
        [adminToken, { ...body, csv: csv + '\n003,C,c@example.org,' }, 422],
        [adminToken, { ...body, initialPassword: 'weak' }, 422]]) {
        const response = await fetch(baseUrl + confirmPath, { method: 'POST', headers: { authorization: `Bearer ${access}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(input) });
        assert.equal(response.status, status);
      }
      const key = randomUUID();
      const created = await request(confirmPath, adminToken, body, key);
      assert.equal(created.createdCount, 2);
      const listed = await request('/admin/teacher-accounts', adminToken);
      for (const account of created.accounts) {
        const profile = listed.items.find(item => item.id === account.teacherProfileId);
        assert.ok(profile);
        assert.equal(profile.employeeNumber, account.employeeId);
        assert.equal(profile.organizationId, fixture.organizationId);
        assert.equal(profile.userId, account.userId);
      }
      const deniedList = await fetch(baseUrl + '/admin/teacher-accounts', { headers: { authorization: `Bearer ${teacherToken}` } });
      assert.equal(deniedList.status, 403);
      assert.ok(!JSON.stringify(created).toLowerCase().includes('password'));
      assert.deepEqual(await request(confirmPath, adminToken, body, key), created);
      assert.equal(await prisma.teacherProfile.count({ where: { organizationId: fixture.organizationId } }), before + 2);
      const conflict = await fetch(baseUrl + confirmPath, { method: 'POST', headers: { authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(body) });
      assert.equal(conflict.status, 409);
      const overlapping = await fetch(baseUrl + confirmPath, { method: 'POST', headers: { authorization: `Bearer ${adminToken}`,
        'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ csv: overlappingCsv,
          previewToken: overlappingPreview.previewToken, initialPassword }) });
      assert.equal(overlapping.status, 409);
      assert.equal(await prisma.teacherProfile.count({ where: { organizationId: fixture.organizationId, employeeNumber: '003' } }), 0);
      for (const account of created.accounts) {
        const stored = await prisma.user.findUniqueOrThrow({ where: { id: account.userId } });
        assert.ok(stored.passwordHash.startsWith('$argon2id$'));
        assert.notEqual(stored.passwordHash, initialPassword);
        const login = await request('/auth/password-login', null, { account: account.email, password: initialPassword });
        const security = await request('/auth/account-security', login.accessToken);
        assert.equal(security.mustChangePassword, true);
        const gate = await fetch(baseUrl + `/teachers/${account.teacherProfileId}/class-sections`, { headers: { authorization: `Bearer ${login.accessToken}` } });
        assert.equal(gate.status, 403);
        assert.equal((await gate.json()).code, 'PERMISSION_RESOURCE_SCOPE_DENIED');
        await request('/auth/own-password', login.accessToken, { currentPassword: initialPassword, newPassword: 'x',
          confirmPassword: 'x', expectedVersion: security.version });
        const changed = await request('/auth/password-login', null, { account: account.email, password: 'x' });
        assert.equal((await request('/auth/account-security', changed.accessToken)).mustChangePassword, false);
        const allowed = await fetch(baseUrl + `/teachers/${account.teacherProfileId}/class-sections`, { headers: { authorization: `Bearer ${changed.accessToken}` } });
        assert.equal(allowed.status, 200);
      }
      const events = await prisma.$queryRaw`SELECT facts FROM v81_events WHERE resource_type='TEACHER_IMPORT' AND resource_id=${created.batchId}::uuid`;
      assert.equal(events.length, 1);
      assert.equal(events[0].facts.count, 2);
      assert.ok(!JSON.stringify(events).includes(initialPassword));
      console.log(JSON.stringify({ check: 'TEACHER_IMPORT_ATOMIC_CREATION_REPLAY_CONFLICT_HASH_FIRST_LOGIN_GATE_PERSONAL_PASSWORD', result: 'PASS' }));
      const nativeFetch = globalThis.fetch, previousWindow = globalThis.window;
      const storage = new Map([['bnbu-portal-tokens-v1', JSON.stringify({ ...adminSession, role: 'ADMIN', userId: fixture.adminUserId })]]);
      globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
      const confirmationKeys = [], listPaths = [];
      let loseResponse = true;
      globalThis.fetch = async (url, options) => {
        const response = await nativeFetch(new URL(url, baseUrl), options);
        if (String(url).includes('/admin/teacher-accounts')) listPaths.push(String(url));
        if (String(url).includes('/admin/teacher-imports/confirm')) {
          confirmationKeys.push(new Headers(options.headers).get('Idempotency-Key'));
          if (loseResponse && response.ok) { loseResponse = false; await response.arrayBuffer(); throw new TypeError('Synthetic lost teacher creation response'); }
        }
        return response;
      };
      try {
        const adapter = await import('../../BNBU-Sports-Web-new/portal-teacher-admin/app/teacher-import-api.ts');
        const manyCsv = 'employee_id,name,email\n' + Array.from({ length: 101 }, (_, index) =>
          `PORTAL${index},Portal teacher ${index},portal-${index}-${suffix}@custom.example`).join('\n');
        const checked = await adapter.previewTeacherAccounts(manyCsv);
        assert.equal(checked.canCreate, true);
        const intentKey = randomUUID();
        await assert.rejects(adapter.confirmTeacherAccounts(manyCsv, checked.previewToken, initialPassword, intentKey));
        const recovered = await adapter.confirmTeacherAccounts(manyCsv, checked.previewToken, initialPassword, intentKey);
        assert.equal(recovered.createdCount, 101);
        assert.deepEqual(confirmationKeys, [intentKey, intentKey]);
        const profiles = await adapter.listTeacherAccounts();
        assert.equal(profiles.length, before + 103);
        assert.equal(new Set(profiles.map(profile => profile.id)).size, profiles.length);
        assert.equal(listPaths.length, 2);
        assert.ok(listPaths[1].includes('?after='));
        assert.ok(recovered.accounts.every(account => profiles.some(profile => profile.id === account.teacherProfileId)));
        assert.ok(!JSON.stringify([...storage.values()]).includes(initialPassword));
        const imported = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_events WHERE resource_type='TEACHER_IMPORT'
          AND resource_id=${recovered.batchId}::uuid`;
        assert.equal(Number(imported[0].total), 1);
        console.log(JSON.stringify({ check: 'PORTAL_TEACHER_IMPORT_REAL_HTTP_LOST_RESPONSE_REPLAY_101_ACCOUNTS_TWO_PAGES', result: 'PASS' }));
      } finally { globalThis.fetch = nativeFetch; globalThis.window = previousWindow; }
      return;
    }
    const path = '/admin/review-services/manual-mode/' + fixture.teacherAActiveSectionId;
    const initial = await request(path, adminToken);
    await request('/admin/review-services/manual-mode', adminToken, {
      classSectionId: fixture.teacherAActiveSectionId, enabled: true,
      reason: 'Synthetic local manual review validation', expectedVersion: initial.version });
    const enabled = await request(path, adminToken);
    assert.equal(enabled.enabled, true);
    console.log(JSON.stringify({ check: 'SUPER_ENABLE_MANUAL_MODE', result: 'PASS' }));
    const manualTemplate = await request('/rule-templates',adminToken,{displayName:'Synthetic manual mainline template',expectedVersion:0});
    const student = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
    const otherStudent = process.env.V81_FEEDBACK_CASE === '1'
      ? await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase()) : null;
    await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: {
      dailyStartTime: new Date('1970-01-01T00:00:00Z'), dailyEndTime: new Date('1970-01-01T23:59:59Z'),
    } });
    await request(`/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`, teacherToken, {
      minimumMinutes: 30, weeklyLimit: 3, courseTarget: 600, generalTarget: 600,
      regularDeadline: '2027-01-23T15:59:59Z', closingDeadline: '2027-01-30T15:59:59Z',
      settlementPlannedAt: '2027-01-30T16:00:00Z', publish: true, expectedVersion: 0, templateId:manualTemplate.id,
    });
    const require = createRequire(new URL('../../backend/package.json', import.meta.url));
    const sessionId = require('uuid').v7();
    const now = new Date();
    // Elapsed exercise is a server-side fixture; upload and validation below use real HTTP/storage.
    await prisma.exerciseSession.create({ data: {
      id: sessionId, organizationId: fixture.organizationId, studentId: student.studentId,
      enrollmentId: student.enrollmentId, classSectionId: fixture.teacherAActiveSectionId,
      semesterId: fixture.semesterId, startedByAuthSessionId: student.authSessionId,
      status: 'COMPLETED', startedAt: new Date(now.getTime() - 3600000),
      businessDate: new Date(now.toISOString().slice(0, 10)), completedAt: now,
      endReason: 'USER_COMPLETED', actualDurationSeconds: 3600n, pausedDurationSeconds: 0n,
      createdAt: now, updatedAt: now,
    } });
    const organization = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
    const challenge = await request('/auth/student-sign-in-codes', null, {
      organizationCode: organization.organizationCode, account: student.email, channel: 'EMAIL', locale: 'en' });
    let code;
    for (let attempt = 0; attempt < 30 && !code; attempt++) {
      const messages = await (await fetch('http://mailpit:8025/api/v1/messages?limit=50')).json();
      const message = messages.messages?.find(item => JSON.stringify(item.To ?? []).toLowerCase().includes(student.email));
      if (message) {
        const detail = await (await fetch(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`)).json();
        code = String(detail.Text ?? '').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];
      }
      if (!code) await delay(500);
    }
    assert.ok(code, 'Student sign-in email not received');
    const studentLogin = await request('/auth/student-sign-in-codes/verify', null, {
      challengeId: challenge.challengeId, code, deviceId: randomUUID() });
    const token = studentLogin.accessToken;
    console.log(JSON.stringify({ check: 'STUDENT_SMTP_CODE_LOGIN', result: 'PASS' }));
    const ownRosterPath = `/enrollments/${student.enrollmentId}/roster-status`;
    const absentRoster = await request(ownRosterPath, token);
    assert.equal(absentRoster.available, false);
    assert.equal(absentRoster.status, null);
    assert.equal(absentRoster.registrationComplete, false);
    if (process.env.V81_EMAIL_SWAP === '1') {
      const profile = await request('/me', token);
      const targetEmail = `swap-${randomUUID().slice(0, 8)}@${student.email.split('@')[1]}`;
      const beforeMessages = await (await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
      const priorIds = new Set(beforeMessages.messages.map(message => message.ID));
      const emailChallenge = await request('/me/email-verification-challenges', token,
        { email: targetEmail, locale: 'en', expectedVersion: profile.user.version });
      assert.equal(emailChallenge.mode, 'REBIND');
      const codes = new Map();
      for (let attempt = 0; attempt < 30 && codes.size < 2; attempt++) {
        const messages = await (await fetch('http://mailpit:8025/api/v1/messages?limit=100')).json();
        for (const message of messages.messages.filter(item => !priorIds.has(item.ID))) {
          const recipient = [student.email, targetEmail].find(email => JSON.stringify(message.To).toLowerCase().includes(email));
          if (!recipient) continue;
          const content = await (await fetch(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`)).json();
          const deliveredCode = String(content.Text).match(/code is\s*(\d{6})/u)?.[1];
          if (deliveredCode) codes.set(recipient, deliveredCode);
        }
        if (codes.size < 2) await delay(500);
      }
      assert.equal(codes.size, 2, 'Both current and new email proofs must arrive in local Mailpit');
      const verifyPath = `/me/email-verification-challenges/${emailChallenge.challengeId}/verify`;
      const body = { currentEmailCode: codes.get(student.email), newEmailCode: codes.get(targetEmail) };
      const keys = [randomUUID(), randomUUID()];
      const results = await Promise.all(keys.map(key => fetch(baseUrl + verifyPath, { method: 'POST', headers: {
        authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) })));
      assert.deepEqual(results.map(response => response.status).sort(), [200, 401]);
      const winner = results.findIndex(response => response.status === 200);
      const verified = (await results[winner].json()).data;
      const expectedMasked = targetEmail.slice(0, 1) + '***@' + targetEmail.split('@')[1];
      assert.equal(verified.user.primaryEmailMasked, expectedMasked);
      assert.equal(verified.user.emailVerified, true);
      assert.equal(verified.user.version, profile.user.version + 1);
      assert.deepEqual(await request(verifyPath, token, body, keys[winner]), verified);
      assert.equal((await request('/me', token)).user.primaryEmailMasked, expectedMasked);
      const storedUser = await prisma.user.findUniqueOrThrow({ where: { id: profile.user.id } });
      assert.equal(storedUser.primaryEmail, targetEmail);
      assert.equal(storedUser.version, profile.user.version + 1);
      const persisted = await prisma.emailVerificationChallenge.findUniqueOrThrow({ where: { id: emailChallenge.challengeId } });
      assert.equal(persisted.status, 'CONSUMED');
      console.log(JSON.stringify({ check: 'STUDENT_EMAIL_REBIND_DUAL_SMTP_PROOF_CONCURRENT_CONSUMPTION_REPLAY', result: 'PASS' }));
      return;
    }
    if (process.env.V81_PHYSICAL_IMPORT === '1') {
      const settlementPath = `/class-sections/${fixture.teacherAActiveSectionId}/settlement-check`;
      const initialSettlement = await request(settlementPath, teacherToken);
      assert.deepEqual(initialSettlement.checks.find(item => item.code === 'PHYSICAL_IMPORT_PENDING'),
        { code: 'PHYSICAL_IMPORT_PENDING', status: 'CLEAR', count: 0 });
      const member = await prisma.studentProfile.update({ where: { id: student.studentId }, data: { gender: 'MALE' } });
      const cell = value => '"' + value.replaceAll('"', '""') + '"';
      const csv = `学号,姓名,项目,用时,测试日期\n${cell(member.studentNumber)},${cell(member.fullName)},1000m,4:30,2026-09-07\n999,Unknown,1000m,4.30,2026-09-07\n999,Unknown,1000m,270,2026-02-30`;
      const createPath = `/class-sections/${fixture.teacherAActiveSectionId}/physical-imports`;
      const key = randomUUID();
      const draft = await request(createPath, teacherToken, { csv }, key);
      assert.equal(draft.pendingCount, 3);
      assert.equal(draft.rows.length, 3);
      assert.equal(draft.sourceSha256, createHash('sha256').update(csv).digest('hex'));
      assert.deepEqual(draft.rows[0].issues, []);
      assert.equal(draft.rows[0].enrollmentId, student.enrollmentId);
      assert.equal(draft.rows[0].elapsedSeconds, 270);
      assert.equal(draft.rows[0].confirmed, false);
      assert.ok(draft.rows[1].issues.includes('AMBIGUOUS_OR_INVALID_TIME'));
      assert.ok(draft.rows[1].issues.includes('DUPLICATE_STUDENT_ROW'));
      assert.ok(draft.rows[2].issues.includes('INVALID_TEST_DATE'));
      assert.deepEqual(await request(createPath, teacherToken, { csv }, key), draft);
      assert.deepEqual(await request(`/physical-imports/${draft.id}`, teacherToken), draft);
      const results = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_physical_result_revisions WHERE enrollment_id=${student.enrollmentId}::uuid`;
      assert.equal(Number(results[0].total), 0);
      for (const [access, expected] of [[token, 403], [adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])]) {
        const response = await fetch(baseUrl + `/physical-imports/${draft.id}`, { headers: { authorization: `Bearer ${access}` } });
        assert.equal(response.status, expected);
      }
      const invalid = await fetch(baseUrl + createPath, { method: 'POST', headers: { authorization: `Bearer ${teacherToken}`,
        'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ csv: '学号,姓名\n001,A' }) });
      assert.equal(invalid.status, 422);
      const batches = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_physical_import_batches WHERE organization_id=${fixture.organizationId}::uuid`;
      assert.equal(Number(batches[0].total), 1);
      console.log(JSON.stringify({ check: 'PHYSICAL_CSV_IMPORT_REAL_HTTP_DRAFT_ISSUES_REPLAY_SCOPE_NO_OFFICIAL_RESULTS', result: 'PASS' }));
      const revisionPath = `/physical-imports/${draft.id}/revisions`;
      const revision = { ...draft.rows[1].source, rowNumber: 2, expectedVersion: 1, elapsed: '4:30', studentNumber: '998' };
      const revisionKey = randomUUID();
      const revised = await request(revisionPath, teacherToken, revision, revisionKey);
      assert.equal(revised.rows[1].version, 2);
      assert.equal(revised.rows[1].elapsedSeconds, 270);
      assert.equal(revised.rows[1].confirmed, false);
      assert.deepEqual(revised.rows[1].original, draft.rows[1].original);
      assert.ok(!revised.rows[1].issues.includes('AMBIGUOUS_OR_INVALID_TIME'));
      assert.ok(!revised.rows[2].issues.includes('DUPLICATE_STUDENT_ROW'));
      assert.deepEqual(await request(revisionPath, teacherToken, revision, revisionKey), revised);
      for (const [access, body, status] of [[teacherToken, revision, 409], [teacherToken, { ...revision, rowNumber: 4 }, 404],
        [token, revision, 403], [adminToken, revision, 403], ...otherTeacherTokens.map(item => [item.token, revision, 404])]) {
        const response = await fetch(baseUrl + revisionPath, { method: 'POST', headers: { authorization: `Bearer ${access}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(body) });
        assert.equal(response.status, status);
      }
      const versions = await prisma.$queryRaw`SELECT version,content FROM v81_physical_import_row_revisions
        WHERE batch_id=${draft.id}::uuid AND row_number=2 ORDER BY version`;
      assert.deepEqual(versions.map(row => row.version), [1, 2]);
      assert.equal(versions[0].content.elapsed, '4.30');
      assert.equal(versions[1].content.elapsed, '4:30');
      assert.deepEqual(await request(`/physical-imports/${draft.id}`, teacherToken), revised);
      assert.equal(Number((await prisma.$queryRaw`SELECT count(*) AS total FROM v81_physical_result_revisions WHERE enrollment_id=${student.enrollmentId}::uuid`)[0].total), 0);
      console.log(JSON.stringify({ check: 'PHYSICAL_IMPORT_ROW_REVISION_REPLAY_STALE_SCOPE_ORIGINAL_PRESERVED', result: 'PASS' }));
      const confirmationPath = `/physical-imports/${draft.id}/confirm`;
      const selected = { rowNumber: 1, expectedVersion: 1, expectedResultVersion: 0 };
      const failConfirm = async (selections, status, access = teacherToken) => {
        const response = await fetch(baseUrl + confirmationPath, { method: 'POST', headers: { authorization: `Bearer ${access}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ selections }) });
        assert.equal(response.status, status);
      };
      await failConfirm([selected, { rowNumber: 2, expectedVersion: 2, expectedResultVersion: 0 }], 422);
      const afterRollback = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_physical_result_revisions WHERE enrollment_id=${student.enrollmentId}::uuid`;
      assert.equal(Number(afterRollback[0].total), 0);
      assert.equal(await prisma.notification.count({ where: { recipientUserId: member.userId, notificationType: 'RAW_ENDURANCE_RESULT' } }), 0);
      assert.equal(Number((await prisma.$queryRaw`SELECT count(*) AS total FROM v81_physical_import_confirmations WHERE batch_id=${draft.id}::uuid`)[0].total), 0);
      await failConfirm([selected, selected], 422);
      await failConfirm([], 422);
      await failConfirm([{ ...selected, expectedResultVersion: 9 }], 409);
      for (const [access, status] of [[token, 403], [adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])])
        await failConfirm([selected], status, access);
      const confirmKey = randomUUID();
      const accepted = await request(confirmationPath, teacherToken, { selections: [selected] }, confirmKey);
      assert.equal(accepted.pendingCount, 2);
      assert.equal(accepted.rows[0].confirmed, true);
      assert.equal(accepted.rows[0].resultVersion, 1);
      assert.equal(accepted.rows[1].confirmed, false);
      assert.deepEqual(await request(confirmationPath, teacherToken, { selections: [selected] }, confirmKey), accepted);
      await failConfirm([selected], 409);
      const official = await request(`/student/enrollments/${student.enrollmentId}/physical-result`, token);
      assert.deepEqual(official, { status: 'RECORDED', result: { version: 1, runType: '1000m', elapsedSeconds: 270, testedOn: '2026-09-07' } });
      assert.equal(await prisma.notification.count({ where: { recipientUserId: member.userId, notificationType: 'RAW_ENDURANCE_RESULT' } }), 1);
      const editConfirmed = await fetch(baseUrl + revisionPath, { method: 'POST', headers: { authorization: `Bearer ${teacherToken}`,
        'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ ...draft.rows[0].source, rowNumber: 1, expectedVersion: 1, elapsed: '250' }) });
      assert.equal(editConfirmed.status, 409);
      assert.deepEqual(await request(`/physical-imports/${draft.id}`, teacherToken), accepted);
      console.log(JSON.stringify({ check: 'PHYSICAL_IMPORT_SELECTED_CONFIRM_ATOMIC_ROLLBACK_NOTIFICATION_REPLAY_SCOPE_READBACK', result: 'PASS' }));
      const listed = await request(createPath, teacherToken);
      assert.deepEqual(listed, { items: [{ id: draft.id, createdAt: draft.createdAt, rowCount: 3, confirmedCount: 1, pendingCount: 2 }], nextBeforeId: null });
      const secondDraft = await request(createPath, teacherToken, { csv });
      const firstPage = await request(createPath + '?limit=1', teacherToken);
      assert.equal(firstPage.items.length, 1);
      assert.equal(firstPage.items[0].id, secondDraft.id);
      assert.equal(firstPage.items[0].pendingCount, 3);
      assert.equal(firstPage.nextBeforeId, secondDraft.id);
      const secondPage = await request(createPath + '?limit=1&beforeId=' + firstPage.nextBeforeId, teacherToken);
      assert.deepEqual(secondPage, listed);
      assert.deepEqual(await request(createPath + '?beforeId=' + draft.id, teacherToken), { items: [], nextBeforeId: null });
      for (const [suffix, access, status] of [['?limit=0', teacherToken, 422], ['?beforeId=bad', teacherToken, 422],
        ['', token, 403], ['', adminToken, 403], ...otherTeacherTokens.map(item => ['', item.token, 404])]) {
        const response = await fetch(baseUrl + createPath + suffix, { headers: { authorization: `Bearer ${access}` } });
        assert.equal(response.status, status);
      }
      console.log(JSON.stringify({ check: 'PHYSICAL_IMPORT_LIST_PENDING_COUNTS_CURSOR_AND_SCOPE', result: 'PASS' }));
      const sourcePath = `/physical-imports/${draft.id}/source`;
      assert.deepEqual(await request(sourcePath, teacherToken), { csv, sourceSha256: draft.sourceSha256 });
      for (const [access, status] of [[token, 403], [adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])]) {
        const response = await fetch(baseUrl + sourcePath, { headers: { authorization: `Bearer ${access}` } });
        assert.equal(response.status, status);
      }
      console.log(JSON.stringify({ check: 'PHYSICAL_IMPORT_PRIVATE_SOURCE_EXACT_CONTENT_AFTER_REVISION_AND_SCOPE', result: 'PASS' }));
      const rowHistoryPath = `/physical-imports/${draft.id}/revisions`;
      const newest = await request(rowHistoryPath + '?rowNumber=2&limit=1', teacherToken);
      assert.equal(newest.items.length, 1);
      assert.equal(newest.items[0].version, 2);
      assert.equal(newest.items[0].source.elapsed, '4:30');
      assert.equal(newest.nextBeforeVersion, 2);
      const oldest = await request(rowHistoryPath + '?rowNumber=2&limit=1&beforeVersion=2', teacherToken);
      assert.equal(oldest.items[0].version, 1);
      assert.deepEqual(oldest.items[0].source, draft.rows[1].original);
      assert.equal(oldest.nextBeforeVersion, null);
      assert.deepEqual(await request(rowHistoryPath + '?rowNumber=2&beforeVersion=1', teacherToken), { items: [], nextBeforeVersion: null });
      for (const [suffix, access, status] of [['', teacherToken, 422], ['?rowNumber=0', teacherToken, 422],
        ['?rowNumber=4', teacherToken, 404], ['?rowNumber=2', token, 403], ['?rowNumber=2', adminToken, 403],
        ...otherTeacherTokens.map(item => ['?rowNumber=2', item.token, 404])]) {
        const response = await fetch(baseUrl + rowHistoryPath + suffix, { headers: { authorization: `Bearer ${access}` } });
        assert.equal(response.status, status);
      }
      console.log(JSON.stringify({ check: 'PHYSICAL_IMPORT_ROW_HISTORY_PAGINATION_ORIGINAL_AND_SCOPE', result: 'PASS' }));
      const { utils, write } = await import('../../backend/node_modules/xlsx/xlsx.mjs');
      const book = utils.book_new();
      utils.book_append_sheet(book, utils.aoa_to_sheet([['学号', '姓名', '项目', '用时', '测试日期'],
        [member.studentNumber, member.fullName, '1000m', '4:20', '2026-09-07']]), '体测');
      const originalXlsx = write(book, { type: 'buffer', bookType: 'xlsx' });
      const xlsxBody = { sheetName: '体测', fileBase64: originalXlsx.toString('base64') };
      const xlsxKey = randomUUID();
      const xlsxDraft = await request(createPath + '/xlsx', teacherToken, xlsxBody, xlsxKey);
      assert.deepEqual(xlsxDraft.rows[0].issues, []);
      assert.equal(xlsxDraft.rows[0].elapsedSeconds, 260);
      assert.deepEqual(await request(createPath + '/xlsx', teacherToken, xlsxBody, xlsxKey), xlsxDraft);
      const savedSource = await request(`/physical-imports/${xlsxDraft.id}/source`, teacherToken);
      assert.equal(savedSource.fileBase64, xlsxBody.fileBase64);
      assert.equal(savedSource.sheetName, '体测');
      assert.equal(savedSource.sourceSha256, createHash('sha256').update(originalXlsx).digest('hex'));
      const xlsxAccepted = await request(`/physical-imports/${xlsxDraft.id}/confirm`, teacherToken,
        { selections: [{ rowNumber: 1, expectedVersion: 1, expectedResultVersion: 1 }] });
      assert.equal(xlsxAccepted.pendingCount, 0);
      assert.equal((await request(`/student/enrollments/${student.enrollmentId}/physical-result`, token)).result.elapsedSeconds, 260);
      for (const body of [{ ...xlsxBody, sheetName: 'missing' }, { ...xlsxBody, fileBase64: 'bad!' }]) {
        const response = await fetch(baseUrl + createPath + '/xlsx', { method: 'POST', headers: { authorization: `Bearer ${teacherToken}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(body) });
        assert.equal(response.status, 422);
      }
      console.log(JSON.stringify({ check: 'XLSX_REAL_HTTP_UPLOAD_DRAFT_ORIGINAL_REPLAY_CONFIRM_STUDENT_READBACK', result: 'PASS' }));
      const beforeRejected = Number((await prisma.$queryRaw`SELECT count(*) AS total FROM v81_physical_import_batches
        WHERE organization_id=${fixture.organizationId}::uuid`)[0].total);
      for (const [access, status] of [[token, 403], [adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])]) {
        const response = await fetch(baseUrl + createPath + '/xlsx', { method: 'POST', headers: { authorization: `Bearer ${access}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(xlsxBody) });
        assert.equal(response.status, status);
      }
      assert.equal(Number((await prisma.$queryRaw`SELECT count(*) AS total FROM v81_physical_import_batches
        WHERE organization_id=${fixture.organizationId}::uuid`)[0].total), beforeRejected);
      const require = createRequire(new URL('../../backend/package.json', import.meta.url));
      const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
      assert.equal(localStorage.endpoint, 'http://media-minio:9000', 'Fault injection is restricted to local MinIO');
      const objects = new S3Client({ endpoint: localStorage.endpoint, region: 'us-east-1', forcePathStyle: true,
        credentials: { accessKeyId: localStorage.accessKeyId, secretAccessKey: localStorage.secretAccessKey } });
      const objectKey = `v81/physical-imports/${fixture.organizationId}/${xlsxDraft.id}/${xlsxDraft.sourceSha256}.xlsx`;
      try {
        await objects.send(new PutObjectCommand({ Bucket: localStorage.bucket, Key: objectKey, Body: Buffer.from('synthetic tampering fixture') }));
        const rejectedSource = await fetch(baseUrl + `/physical-imports/${xlsxDraft.id}/source`, { headers: { authorization: `Bearer ${teacherToken}` } });
        assert.equal(rejectedSource.status, 500);
        const rejectedBody = await rejectedSource.json();
        assert.equal(rejectedBody.code ?? rejectedBody.error?.code, 'SYSTEM_DATA_INTEGRITY_ERROR');
      } finally {
        await objects.send(new PutObjectCommand({ Bucket: localStorage.bucket, Key: objectKey, Body: originalXlsx,
          ContentType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' }));
        objects.destroy();
      }
      assert.deepEqual(await request(`/physical-imports/${xlsxDraft.id}/source`, teacherToken), savedSource);
      assert.equal((await request(`/student/enrollments/${student.enrollmentId}/physical-result`, token)).result.elapsedSeconds, 260);
      console.log(JSON.stringify({ check: 'XLSX_UPLOAD_SCOPE_NO_BATCH_WRITE_SOURCE_TAMPER_DENIED_RESTORED', result: 'PASS' }));
      const pendingSettlement = await request(settlementPath, teacherToken);
      assert.equal(pendingSettlement.ready, false);
      assert.deepEqual(pendingSettlement.checks.find(item => item.code === 'PHYSICAL_IMPORT_PENDING'),
        { code: 'PHYSICAL_IMPORT_PENDING', status: 'BLOCKED', count: 5 });
      console.log(JSON.stringify({ check: 'UNCONFIRMED_PHYSICAL_IMPORT_ROWS_BLOCK_SETTLEMENT_AFTER_PARTIAL_CONFIRM', result: 'PASS' }));
      const concurrentRevision = (rowNumber, elapsed) => fetch(baseUrl + `/physical-imports/${secondDraft.id}/revisions`, {
        method: 'POST', headers: { authorization: `Bearer ${teacherToken}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ ...secondDraft.rows[rowNumber - 1].source, rowNumber, expectedVersion: 1, elapsed }),
      });
      const separateRows = await Promise.all([concurrentRevision(1, '271'), concurrentRevision(2, '272')]);
      assert.deepEqual(separateRows.map(response => response.status), [201, 201]);
      const sameRow = await Promise.all([concurrentRevision(3, '273'), concurrentRevision(3, '274')]);
      assert.deepEqual(sameRow.map(response => response.status).sort(), [201, 409]);
      const concurrentDraft = await request(`/physical-imports/${secondDraft.id}`, teacherToken);
      assert.deepEqual(concurrentDraft.rows.map(row => row.version), [2, 2, 2]);
      assert.equal(concurrentDraft.rows[0].elapsedSeconds, 271);
      assert.equal(concurrentDraft.rows[1].elapsedSeconds, 272);
      assert.ok([273, 274].includes(concurrentDraft.rows[2].elapsedSeconds));
      assert.deepEqual(concurrentDraft.rows.map(row => row.original), secondDraft.rows.map(row => row.original));
      const revisionEvents = await prisma.$queryRaw`SELECT version,event_type,facts FROM v81_events
        WHERE organization_id=${fixture.organizationId}::uuid AND resource_type='PHYSICAL_IMPORT' AND resource_id=${secondDraft.id}::uuid ORDER BY version`;
      assert.deepEqual(revisionEvents.map(event => event.version), [1, 2, 3, 4]);
      assert.deepEqual(revisionEvents.slice(1).map(event => event.facts.rowNumber).sort(), [1, 2, 3]);
      assert.ok(revisionEvents.slice(1).every(event => event.facts.rowVersion === 2));
      assert.equal(concurrentDraft.pendingCount, 3);
      console.log(JSON.stringify({ check: 'PHYSICAL_IMPORT_CONCURRENT_DIFFERENT_ROWS_AND_SAME_ROW_AUDIT_SEQUENCE', result: 'PASS' }));
      return;
    }
    if (process.env.V81_PHYSICAL_STORAGE === '1') {
      const studentPath = `/student/enrollments/${student.enrollmentId}/physical-result`;
      const historyPath = `/enrollments/${student.enrollmentId}/physical-results`;
      assert.deepEqual(await request(studentPath, token), { status: 'NOT_RECORDED', result: null });
      const append = (version, actorId, elapsedSeconds) => prisma.$executeRaw`INSERT INTO v81_physical_result_revisions
        (enrollment_id,organization_id,version,run_type,elapsed_seconds,tested_on,actor_id,request_id,created_at)
        VALUES(${student.enrollmentId}::uuid,${fixture.organizationId}::uuid,${version},'1000m',${elapsedSeconds},
          '2026-09-07'::date,${actorId}::uuid,${randomUUID()},${new Date()})`;
      const owner = await prisma.teacherProfile.findUniqueOrThrow({ where: { id: fixture.teacherProfileId } });
      await append(1, owner.userId, 260);
      await assert.rejects(append(2, fixture.adminUserId, 250));
      await assert.rejects(append(3, owner.userId, 250));
      await assert.rejects(append(2, owner.userId, -1));
      await assert.rejects(prisma.$executeRaw`UPDATE v81_physical_result_revisions SET elapsed_seconds=200 WHERE enrollment_id=${student.enrollmentId}::uuid`);
      await assert.rejects(prisma.$executeRaw`DELETE FROM v81_physical_result_revisions WHERE enrollment_id=${student.enrollmentId}::uuid`);
      await append(2, owner.userId, 250);
      const rows = await prisma.$queryRaw`SELECT version,elapsed_seconds FROM v81_physical_result_revisions WHERE enrollment_id=${student.enrollmentId}::uuid ORDER BY version`;
      assert.deepEqual(rows.map(row => [row.version, Number(row.elapsed_seconds)]), [[1, 260], [2, 250]]);
      const current = await request(studentPath, token);
      assert.deepEqual(current, { status: 'RECORDED', result: { version: 2, runType: '1000m', elapsedSeconds: 250, testedOn: '2026-09-07' } });
      const firstPage = await request(historyPath + '?limit=1', teacherToken);
      assert.equal(firstPage.items[0].elapsedSeconds, 250);
      assert.equal(firstPage.nextBeforeVersion, 2);
      const secondPage = await request(historyPath + '?limit=1&beforeVersion=2', teacherToken);
      assert.equal(secondPage.items[0].elapsedSeconds, 260);
      assert.equal(secondPage.nextBeforeVersion, null);
      for (const [path, access, expected] of [[historyPath, token, 403], [historyPath, adminToken, 403],
        [historyPath, otherTeacherTokens[0].token, 404], [historyPath, otherTeacherTokens[1].token, 404],
        [studentPath, teacherToken, 403], [studentPath, adminToken, 403]]) {
        const response = await fetch(baseUrl + path, { headers: { authorization: `Bearer ${access}` } });
        assert.equal(response.status, expected);
      }
      console.log(JSON.stringify({ check: 'PHYSICAL_RESULT_STUDENT_RAW_PROJECTION_TEACHER_HISTORY_AND_SCOPE', result: 'PASS' }));
      await prisma.studentProfile.update({ where: { id: student.studentId }, data: { gender: 'MALE' } });
      const confirmedInput = { runType: '1000m', elapsedSeconds: 245, testedOn: '2026-09-07', expectedVersion: 2 };
      const confirmedKey = randomUUID();
      const confirmed = await request(historyPath, teacherToken, confirmedInput, confirmedKey);
      assert.equal(confirmed.version, 3);
      assert.deepEqual(await request(historyPath, teacherToken, confirmedInput, confirmedKey), confirmed);
      assert.equal((await request(studentPath, token)).result.elapsedSeconds, 245);
      for (const [input, access, expected] of [
        [{ ...confirmedInput, expectedVersion: 3, runType: '800m' }, teacherToken, 422],
        [{ ...confirmedInput, expectedVersion: 3, testedOn: '2026-02-30' }, teacherToken, 422],
        [{ ...confirmedInput, expectedVersion: 3, elapsedSeconds: 4.30 }, teacherToken, 422],
        [confirmedInput, teacherToken, 409], [confirmedInput, adminToken, 403], [confirmedInput, token, 403],
        [confirmedInput, otherTeacherTokens[0].token, 404],
      ]) {
        const response = await fetch(baseUrl + historyPath, { method: 'POST', headers: { authorization: `Bearer ${access}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(input) });
        assert.equal(response.status, expected);
      }
      const finalHistory = await request(historyPath, teacherToken);
      assert.deepEqual(finalHistory.items.map(row => [row.version, row.elapsedSeconds]), [[3, 245], [2, 250], [1, 260]]);
      console.log(JSON.stringify({ check: 'PHYSICAL_TEACHER_CONFIRM_REAL_HTTP_REPLAY_AND_RAW_HISTORY', result: 'PASS' }));
      const importId = randomUUID(), sourceRows = [{ studentNumber: '001', elapsed: '245' }, { studentNumber: '002', elapsed: '4.30' }];
      await prisma.$executeRaw`INSERT INTO v81_physical_import_batches(id,organization_id,class_section_id,actor_id,source_sha256,source_rows,request_id,created_at)
        VALUES(${importId}::uuid,${fixture.organizationId}::uuid,${fixture.teacherAActiveSectionId}::uuid,${owner.userId}::uuid,
          ${createHash('sha256').update(JSON.stringify(sourceRows)).digest('hex')},${JSON.stringify(sourceRows)}::jsonb,${randomUUID()},${new Date()})`;
      const draftRow = (rowNumber, version) => prisma.$executeRaw`INSERT INTO v81_physical_import_row_revisions(batch_id,row_number,version,content,actor_id,request_id,created_at)
        VALUES(${importId}::uuid,${rowNumber},${version},${JSON.stringify(sourceRows[rowNumber - 1] ?? {})}::jsonb,${owner.userId}::uuid,${randomUUID()},${new Date()})`;
      await draftRow(1, 1);
      await draftRow(2, 1);
      await draftRow(1, 2);
      await assert.rejects(draftRow(3, 1));
      await assert.rejects(draftRow(2, 3));
      const confirmRow = rowVersion => prisma.$executeRaw`INSERT INTO v81_physical_import_confirmations(batch_id,row_number,row_version,enrollment_id,result_version,created_at)
        VALUES(${importId}::uuid,1,${rowVersion},${student.enrollmentId}::uuid,3,${new Date()})`;
      await assert.rejects(confirmRow(1));
      await confirmRow(2);
      await assert.rejects(draftRow(1, 3));
      await assert.rejects(prisma.$executeRaw`DELETE FROM v81_physical_import_confirmations WHERE batch_id=${importId}::uuid`);
      const pending = await prisma.$queryRaw`SELECT DISTINCT r.row_number FROM v81_physical_import_row_revisions r
        WHERE r.batch_id=${importId}::uuid AND NOT EXISTS(SELECT 1 FROM v81_physical_import_confirmations c WHERE c.batch_id=r.batch_id AND c.row_number=r.row_number)`;
      assert.deepEqual(pending.map(row => row.row_number), [2]);
      console.log(JSON.stringify({ check: 'PHYSICAL_IMPORT_IMMUTABLE_DRAFT_AND_PARTIAL_CONFIRMATION_STORAGE', result: 'PASS' }));
      const rawNotices = (await request('/notifications?limit=100', token)).filter(item => item.notificationType === 'RAW_ENDURANCE_RESULT');
      assert.equal(rawNotices.length, 1);
      assert.equal(rawNotices[0].targetId, student.enrollmentId);
      assert.equal(rawNotices[0].body, '1000m · 245 秒 · 2026-09-07');
      assert.equal(await prisma.notification.count({ where: { recipientUserId: student.userId, notificationType: 'RAW_ENDURANCE_RESULT' } }), 1);
      console.log(JSON.stringify({ check: 'PHYSICAL_RAW_RESULT_NOTIFICATION_TRANSACTION_AND_REPLAY', result: 'PASS' }));
      const verifyStudentPhysicalView = async (expectedStatus, expectedRosterAvailable = false) => {
        const originalFetch = globalThis.fetch, originalStorage = globalThis.localStorage;
        const values = new Map([['bnbu.student.web.apiTokens', JSON.stringify(studentLogin)]]);
        globalThis.localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value), removeItem: key => values.delete(key) };
        globalThis.fetch = (url, input) => originalFetch(new URL(url, baseUrl), input);
        try {
          const api = await import('../../BNBU-Sports-Web-new/frontend/student/js/api.js');
          const roster = await api.getOwnRosterStatus(student.enrollmentId);
          assert.equal(roster.available, expectedRosterAvailable);
          assert.equal(roster.status, expectedRosterAvailable ? 'MATCHED' : null);
          assert.equal(roster.registrationComplete, expectedRosterAvailable);
          console.log(JSON.stringify({ check: 'STUDENT_ROSTER_WEB_CLIENT_REAL_HTTP', result: 'PASS',
            available: roster.available, status: roster.status }));
          const { renderEnduranceScoring } = await import('../../BNBU-Sports-Web-new/frontend/student/js/screens/services.js');
          const data = await api.getOwnPhysicalResult(student.enrollmentId);
          const grades = api.mapPhysicalResult(data);
          assert.equal(grades.enduranceRunStatus, expectedStatus);
          assert.equal(grades.enduranceRunScore, null);
          const html = renderEnduranceScoring({ state: { workspace: { student: { gender: 'male', gradeLevel: 'freshman' }, grades } } });
          if (expectedStatus === 'recorded') {
            assert.equal(grades.enduranceRunTimeSeconds, 245);
            assert.ok(html.includes('4′05″'));
            assert.ok(html.includes('2026-09-07'));
          } else {
            assert.equal(grades.enduranceRunTimeSeconds, null);
            assert.ok(html.includes('免测'));
            assert.ok(!html.includes('4′05″'));
          }
        } finally { globalThis.fetch = originalFetch; globalThis.localStorage = originalStorage; }
      };
      await verifyStudentPhysicalView('recorded');
      const adminPhysicalPath = `/admin/class-sections/${fixture.teacherAActiveSectionId}/physical-summary`;
      const unavailablePhysical = await request(adminPhysicalPath, adminToken);
      assert.equal(unavailablePhysical.available, false);
      assert.equal(unavailablePhysical.recordedCount, null);
      assert.equal(unavailablePhysical.sourceRowCount, null);
      const physicalRosterStudent = await prisma.studentProfile.findUniqueOrThrow({ where: { id: student.studentId } });
      const physicalRosterId = randomUUID(), physicalRosterNow = new Date();
      await prisma.officialRosterImport.create({ data: { id: physicalRosterId, organizationId: fixture.organizationId,
        classSectionId: fixture.teacherAActiveSectionId, versionNumber: 1, source: 'FILE', fileName: 'synthetic-physical-report.csv',
        sourceFileStorageKey: 'synthetic/physical-report.csv', fileChecksumSha256: 'd'.repeat(64),
        fieldMappingSnapshot: { studentNumber: 'student_number', fullName: 'full_name' }, importedBy: fixture.teacherUserId,
        importedAt: physicalRosterNow, createdAt: physicalRosterNow } });
      await prisma.officialRosterImport.update({ where: { id: physicalRosterId }, data: { status: 'VALIDATING', version: { increment: 1 } } });
      await prisma.officialRosterEntry.create({ data: { id: randomUUID(), organizationId: fixture.organizationId,
        rosterImportId: physicalRosterId, classSectionId: fixture.teacherAActiveSectionId, sourceRowNumber: 2,
        normalizedStudentNumber: physicalRosterStudent.studentNumber, rawStudentNumberSafe: physicalRosterStudent.studentNumber,
        fullName: physicalRosterStudent.fullName, rowValidationStatus: 'VALID', rowErrorCodes: [], rawRowSnapshotSafe: {}, createdAt: physicalRosterNow } });
      await prisma.officialRosterImport.update({ where: { id: physicalRosterId }, data: { status: 'VALIDATED', totalRowCount: 1,
        validRowCount: 1, isCurrent: true, version: { increment: 1 } } });
      await request(`/roster-imports/${physicalRosterId}/confirmation`, teacherToken, { expectedVersion: 3 });
      const physicalReportPath = `/class-sections/${fixture.teacherAActiveSectionId}/composite-roster`;
      const recordedReport = await request(physicalReportPath, teacherToken);
      assert.equal(recordedReport.rows[0].physical.status, 'RECORDED');
      assert.equal(recordedReport.rows[0].physical.result.elapsedSeconds, 245);
      const recordedSummary = await request(adminPhysicalPath, adminToken);
      assert.equal(recordedSummary.available, true);
      assert.equal(recordedSummary.sourceRowCount, 1);
      assert.equal(recordedSummary.recordedCount, 1);
      assert.equal(recordedSummary.exemptCount, 0);
      assert.equal(recordedSummary.notRecordedCount, 0);
      assert.equal(recordedSummary.unresolvedRegistrationCount, 0);
      assert.equal(recordedSummary.rosterVersion, recordedReport.rosterVersion);
      assert.deepEqual(Object.keys(recordedSummary).sort(), ['classSectionId', 'generatedAt', 'available', 'rosterVersion',
        'sourceRowCount', 'recordedCount', 'exemptCount', 'notRecordedCount', 'unresolvedRegistrationCount'].sort());
      for (const access of [teacherToken, token]) {
        const denied = await fetch(baseUrl + adminPhysicalPath, { headers: { authorization: `Bearer ${access}` } });
        assert.equal(denied.status, 403); await denied.arrayBuffer();
      }
      const foreignPhysical = await fetch(baseUrl + `/admin/class-sections/${fixture.teacherCSectionId}/physical-summary`,
        { headers: { authorization: `Bearer ${adminToken}` } });
      assert.equal(foreignPhysical.status, 404); await foreignPhysical.arrayBuffer();
      const physicalUser = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
      try {
        await prisma.user.update({ where: { id: student.userId }, data: { emailVerifiedAt: null } });
        const unresolved = await request(adminPhysicalPath, adminToken);
        assert.equal(unresolved.unresolvedRegistrationCount, 1);
        assert.equal(unresolved.recordedCount, 0); assert.equal(unresolved.notRecordedCount, 0);
        for (const permissions of [[], ['COURSE_VIEW'], ['SEMESTER_MANAGE']]) {
          await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb
            WHERE user_id=${fixture.adminUserId}::uuid`;
          const response = await fetch(baseUrl + adminPhysicalPath, { headers: { authorization: `Bearer ${adminToken}` } });
          assert.equal(response.status, permissions.includes('COURSE_VIEW') ? 200 : 403);
          await response.arrayBuffer();
        }
      } finally {
        await prisma.user.update({ where: { id: student.userId }, data: { emailVerifiedAt: physicalUser.emailVerifiedAt } });
        await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb WHERE user_id=${fixture.adminUserId}::uuid`;
      }
      const proofBytes = syntheticPng();
      const proofDigest = createHash('sha256').update(proofBytes).digest('hex');
      const proof = await request('/media-uploads', token, { enrollmentId: student.enrollmentId,
        businessPurpose: 'EXEMPTION_APPLICATION', mediaType: 'IMAGE', mimeType: 'image/png', fileSizeBytes: proofBytes.length,
        captureSource: 'FILE_PICKER', declaredContentSha256: proofDigest });
      const put = await fetch(proof.uploadUrl, { method: 'PUT', headers: proof.requiredHeaders, body: proofBytes });
      assert.ok(put.ok);
      await request(`/media-uploads/${proof.uploadSessionId}/confirm`, token, { etag: put.headers.get('etag').replaceAll('"', '') });
      let checkedProof;
      for (let attempt = 0; attempt < 40; attempt++) {
        checkedProof = await request(`/media/${proof.mediaId}`, token);
        if (checkedProof.uploadStatus === 'AVAILABLE') break;
        await delay(500);
      }
      assert.equal(checkedProof.uploadStatus, 'AVAILABLE');
      const exemption = await request('/exemption-applications', token, { enrollmentId: student.enrollmentId,
        applicationType: 'PHYSICAL_TEST', applicationSubtype: 'RUN_1000M', organizationName: null,
        reason: 'Synthetic medical exemption evidence', mediaIds: [proof.mediaId] });
      const submitted = await request(`/exemption-applications/${exemption.id}/submit`, token, { expectedVersion: exemption.version });
      const approvalInput = { decision: 'APPROVE', publicComment: 'Synthetic exemption confirmed', expectedVersion: submitted.version };
      const approvalKey = randomUUID();
      const approved = await request(`/exemption-applications/${exemption.id}/review`, teacherToken, approvalInput, approvalKey);
      assert.equal(approved.status, 'APPROVED');
      assert.deepEqual(await request(`/exemption-applications/${exemption.id}/review`, teacherToken, approvalInput, approvalKey), approved);
      assert.deepEqual(await request(studentPath, token), { status: 'EXEMPT', result: null });
      await verifyStudentPhysicalView('exempt', true);
      const exemptReport = await request(physicalReportPath, teacherToken);
      assert.deepEqual(exemptReport.rows[0].physical, { status: 'EXEMPT', result: null });
      const exemptSummary = await request(adminPhysicalPath, adminToken);
      assert.equal(exemptSummary.exemptCount, 1); assert.equal(exemptSummary.recordedCount, 0);
      assert.equal(exemptSummary.notRecordedCount, 0); assert.equal(exemptSummary.unresolvedRegistrationCount, 0);
      console.log(JSON.stringify({ check: 'ADMIN_PHYSICAL_SUMMARY_UNAVAILABLE_RECORDED_UNRESOLVED_EXEMPT_SCOPE_NO_RAW_FIELDS', result: 'PASS' }));
      assert.deepEqual(exemptReport.rows[0].progress, recordedReport.rows[0].progress);
      assert.equal(exemptReport.confirmedRosterId, recordedReport.confirmedRosterId);
      assert.equal(exemptReport.denominator, recordedReport.denominator);
      const physicalExport = await request(`${physicalReportPath}/export`, teacherToken);
      const physicalXlsx = createRequire(new URL('../../backend/package.json', import.meta.url))('xlsx');
      const physicalWorkbook = physicalXlsx.read(Buffer.from(physicalExport.fileBase64, 'base64'), { type: 'buffer' });
      const physicalRows = physicalXlsx.utils.sheet_to_json(physicalWorkbook.Sheets['名单内'], { header: 1, defval: null });
      assert.equal(physicalRows[1][3], '已免测');
      assert.deepEqual(physicalRows[1].slice(4, 8), [null, null, null, null]);
      console.log(JSON.stringify({ check: 'COMPOSITE_ROSTER_EXEMPTION_OVERRIDES_RAW_EXPORT_BLANK_RESULT_PRESERVES_PROGRESS_AND_SOURCE', result: 'PASS' }));
      console.log(JSON.stringify({ check: 'STUDENT_PHYSICAL_WEB_API_AND_EXISTING_RENDERER_RECORDED_AND_EXEMPT', result: 'PASS' }));
      const blocked = await fetch(baseUrl + historyPath, { method: 'POST', headers: { authorization: `Bearer ${teacherToken}`,
        'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify({ ...confirmedInput, expectedVersion: 3 }) });
      assert.equal(blocked.status, 409);
      assert.deepEqual(await request(historyPath, teacherToken), finalHistory);
      assert.equal(await prisma.notification.count({ where: { recipientUserId: student.userId, notificationType: 'RAW_ENDURANCE_RESULT' } }), 1);
      console.log(JSON.stringify({ check: 'PHYSICAL_EXEMPTION_REAL_UPLOAD_APPROVAL_BLOCKS_RAW_WRITE_PRESERVES_HISTORY', result: 'PASS' }));
      console.log(JSON.stringify({ check: 'PHYSICAL_RESULT_RESPONSIBLE_TEACHER_AND_IMMUTABLE_RAW_HISTORY', result: 'PASS' }));
      return;
    }
    if (process.env.V81_ENDURANCE_API === '1') {
      const base = '/admin/endurance-tables';
      const tables = await request(base, adminToken);
      assert.equal(tables.length, 4);
      assert.equal(tables.reduce((sum, table) => sum + table.bands.length, 0), 404);
      assert.deepEqual(await request(base, adminToken), tables);
      const count = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_endurance_tables WHERE organization_id=${fixture.organizationId}::uuid`;
      assert.equal(Number(count[0].total), 0);
      const table = tables[0], first = table.bands[0];
      const tableKey = { gender: table.gender, gradeGroup: table.gradeGroup, runType: table.runType };
      const { id, ...band } = first;
      const update = { ...tableKey, ...band, note: ' Synthetic note ', expectedVersion: 0 };
      const replayKey = randomUUID();
      let current = await request(`${base}/rules/${id}`, adminToken, update, replayKey);
      assert.equal(current.version, 1);
      assert.equal(current.bands[0].note, 'Synthetic note');
      assert.deepEqual(await request(`${base}/rules/${id}`, adminToken, update, replayKey), current);
      const addition = { ...tableKey, minSeconds: 601, maxSeconds: 603, score: 0, tier: 'fail', note: '', expectedVersion: 1 };
      current = await request(`${base}/rules`, adminToken, addition);
      assert.equal(current.bands.length, 102);
      const added = current.bands.at(-1);
      current = await request(`${base}/rules/${added.id}/delete`, adminToken, { ...tableKey, expectedVersion: 2 });
      assert.equal(current.bands.length, 101);
      assert.equal(current.version, 3);
      for (const [route, body, access, expected] of [
        [`${base}/rules/${table.bands[50].id}/delete`, { ...tableKey, expectedVersion: 3 }, adminToken, 422],
        [`${base}/rules/${id}`, { ...update, expectedVersion: 3, score: 100, tier: 'fail' }, adminToken, 422],
        [`${base}/rules/${id}`, update, adminToken, 409],
        [`${base}/rules`, { ...addition, expectedVersion: 3 }, teacherToken, 403],
        [`${base}/rules`, { ...addition, expectedVersion: 3 }, token, 403],
      ]) {
        const response = await fetch(baseUrl + route, { method: 'POST', headers: { authorization: `Bearer ${access}`,
          'content-type': 'application/json', 'idempotency-key': randomUUID() }, body: JSON.stringify(body) });
        assert.equal(response.status, expected);
      }
      const reread = await request(base, adminToken);
      assert.deepEqual(reread.find(item => item.id === table.id), current);
      const revisions = await prisma.$queryRaw`SELECT version FROM v81_endurance_table_revisions WHERE table_id=${table.id}::uuid ORDER BY version`;
      assert.deepEqual(revisions.map(row => row.version), [1, 2, 3]);
      const write = (body) => fetch(baseUrl + `${base}/rules/${id}`, { method: 'POST', headers: {
        authorization: `Bearer ${adminToken}`, 'content-type': 'application/json', 'idempotency-key': randomUUID(),
      }, body: JSON.stringify(body) });
      const competing = await Promise.all(['Concurrent A', 'Concurrent B'].map(note => write({ ...update, note, expectedVersion: 3 })));
      assert.deepEqual(competing.map(response => response.status).sort(), [201, 409]);
      current = (await request(base, adminToken)).find(item => item.id === table.id);
      assert.equal(current.version, 4);
      assert.ok(['Concurrent A', 'Concurrent B'].includes(current.bands[0].note));
      try {
        for (const [permissions, status] of [[[], 403], [['HELP_CENTER'], 403], [['GLOBAL_RULES'], 200], [[], 403]]) {
          await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb
            WHERE user_id=${fixture.adminUserId}::uuid`;
          const readResponse = await fetch(baseUrl + base, { headers: { authorization: `Bearer ${adminToken}` } });
          assert.equal(readResponse.status, status);
          const written = await write({ ...update, expectedVersion: current.version, note: 'Authorized rules admin' });
          assert.equal(written.status, status === 200 ? 201 : 403);
          if (written.ok) current = (await written.json()).data;
        }
      } finally {
        await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb
          WHERE user_id=${fixture.adminUserId}::uuid`;
      }
      assert.equal(current.version, 5);
      const finalTables = await request(base, adminToken);
      assert.deepEqual(finalTables.find(item => item.id === table.id), current);
      assert.deepEqual(finalTables.filter(item => item.id !== table.id), tables.filter(item => item.id !== table.id));
      const finalRevisions = await prisma.$queryRaw`SELECT version FROM v81_endurance_table_revisions WHERE table_id=${table.id}::uuid ORDER BY version`;
      assert.deepEqual(finalRevisions.map(row => row.version), [1, 2, 3, 4, 5]);
      console.log(JSON.stringify({ check: 'ENDURANCE_CONCURRENT_VERSION_AND_SUBADMIN_PERMISSION_REVOCATION', result: 'PASS' }));
      const originalFetch = globalThis.fetch, originalWindow = globalThis.window;
      const storage = new Map([['bnbu-portal-tokens-v1', JSON.stringify({ ...adminSession, role: 'ADMIN', userId: fixture.adminUserId })]]);
      globalThis.window = { localStorage: { getItem: key => storage.get(key) ?? null,
        setItem: (key, value) => storage.set(key, value), removeItem: key => storage.delete(key) } };
      let discardResponse = true;
      const sentKeys = [];
      globalThis.fetch = async (url, options) => {
        const response = await originalFetch(new URL(url, baseUrl), options);
        if (options?.method === 'POST' && String(url).includes('/admin/endurance-tables/')) {
          sentKeys.push(new Headers(options.headers).get('Idempotency-Key'));
          if (discardResponse && response.ok) { discardResponse = false; await response.arrayBuffer(); throw new TypeError('Synthetic lost response'); }
        }
        return response;
      };
      try {
        const adapter = await import('../../BNBU-Sports-Web-new/portal-teacher-admin/app/endurance-api.ts');
        const realRules = await adapter.loadRealEnduranceRules();
        assert.equal(realRules.length, 404);
        const state = { enduranceRules: realRules };
        const row = realRules.find(rule => rule.id === id);
        const input = { ...row, note: 'Portal response loss retry' };
        await assert.rejects(adapter.writeRealEnduranceRule(state, input));
        const result = await adapter.writeRealEnduranceRule(state, input);
        assert.equal(result.value.tableVersion, 6);
        assert.equal(result.value.note, input.note);
        assert.equal(sentKeys.length, 2);
        assert.equal(sentKeys[0], sentKeys[1]);
        const reloaded = await adapter.loadRealEnduranceRules();
        assert.deepEqual(reloaded.find(rule => rule.id === id), result.value);
        await assert.rejects(adapter.writeRealEnduranceRule({ enduranceRules: reloaded }, { ...input, note: 'Stale open editor' }),
          error => error.status === 409);
        assert.equal((await adapter.loadRealEnduranceRules()).find(rule => rule.id === id).note, input.note);
      } finally { globalThis.fetch = originalFetch; globalThis.window = originalWindow; }
      const afterRetry = await prisma.$queryRaw`SELECT count(*) AS total FROM v81_endurance_table_revisions WHERE table_id=${table.id}::uuid`;
      assert.equal(Number(afterRetry[0].total), 6);
      console.log(JSON.stringify({ check: 'ENDURANCE_PORTAL_REAL_HTTP_AND_RESPONSE_LOSS_IDEMPOTENT_RETRY', result: 'PASS' }));
      console.log(JSON.stringify({ check: 'ENDURANCE_ADMIN_REAL_HTTP_CREATE_UPDATE_DELETE_REPLAY_AND_VALIDATION', result: 'PASS' }));
      return;
    }
    if (process.env.V81_ENDURANCE_STORAGE === '1') {
      const { probeEnduranceStorage } = await import('./v81-endurance-storage-probe.mjs');
      await probeEnduranceStorage(prisma, fixture);
      return;
    }
    if (process.env.V81_HELP_CASE === '1') {
      const base = '/admin/help-articles';
      const draft = { titleZh: ' 测试帮助 ', titleEn: ' Synthetic help ', bodyZh: '', bodyEn: '',
        keywords: [], category: 'checkin', status: 'draft', sortWeight: -1.25, expectedVersion: 0 };
      let article = await request(base, adminToken, draft);
      assert.equal(article.titleZh, '测试帮助');
      assert.equal(article.sortWeight, -1.25);
      assert.equal(article.version, 1);
      assert.equal('expectedVersion' in article, false);
      assert.deepEqual(await request(`${base}/${article.id}`, adminToken), article);
      const studentBase = '/student/help-articles';
      assert.deepEqual(await request(studentBase, token), []);
      const expectHidden = async () => {
        assert.deepEqual(await request(studentBase, token), []);
        const response = await fetch(baseUrl + studentBase + '/' + article.id, { headers: { authorization: `Bearer ${token}` } });
        assert.equal(response.status, 404);
      };
      await expectHidden();
      const reject = async (input, expectedStatus, accessToken = adminToken) => {
        const response = await fetch(baseUrl + base + '/' + article.id, { method: 'POST', headers: {
          'content-type': 'application/json', authorization: `Bearer ${accessToken}`, 'idempotency-key': randomUUID(),
        }, body: JSON.stringify(input) });
        assert.equal(response.status, expectedStatus);
        assert.deepEqual(await request(`${base}/${article.id}`, adminToken), article);
      };
      await reject({ ...draft, status: 'published', expectedVersion: 1 }, 422);
      await reject({ ...draft, status: 'archived', expectedVersion: 1 }, 422);
      const content = { ...draft, bodyZh: ' 测试正文 ', bodyEn: ' Synthetic body ', keywords: [' camera，相机 ', 'camera'], status: 'published' };
      let firstPublishedAt;
      for (const status of ['published', 'archived', 'published']) {
        const input = { ...content, status, expectedVersion: article.version };
        const key = randomUUID();
        article = await request(`${base}/${article.id}`, adminToken, input, key);
        assert.deepEqual(await request(`${base}/${article.id}`, adminToken, input, key), article);
        assert.deepEqual(article.keywords, ['camera', '相机']);
        assert.deepEqual(await request(`${base}/${article.id}`, adminToken), article);
        if (status === 'archived') await expectHidden();
        else {
          const english = await request(`${studentBase}/${article.id}?locale=en`, token);
          const chinese = await request(`${studentBase}/${article.id}?locale=zh-CN`, token);
          assert.equal(english.title, 'Synthetic help');
          assert.equal(english.bodyMarkdown, 'Synthetic body');
          assert.equal(chinese.title, '测试帮助');
          assert.equal(chinese.bodyMarkdown, '测试正文');
          assert.deepEqual(Object.keys(english).sort(), ['id', 'category', 'locale', 'title', 'bodyMarkdown', 'publishedAt', 'version'].sort());
          firstPublishedAt ??= english.publishedAt;
          assert.equal(english.publishedAt, firstPublishedAt);
          assert.deepEqual(await request(studentBase + '?locale=en', token), [english]);
        }
      }
      await reject({ ...draft, expectedVersion: article.version }, 422);
      await reject({ ...content, expectedVersion: 1 }, 409);
      await reject({ ...content, expectedVersion: article.version }, 403, teacherToken);
      await reject({ ...content, expectedVersion: article.version }, 403, token);
      const revisions = await prisma.$queryRaw`SELECT version,status FROM v81_help_article_revisions
        WHERE article_id=${article.id}::uuid ORDER BY version`;
      assert.deepEqual(revisions.map(row => row.status), ['draft', 'published', 'archived', 'published']);
      assert.equal(revisions.length, article.version);
      for (let index = 0; index < 6; index++) await request(base, adminToken, { ...draft,
        titleZh: `条目${index}`, titleEn: `Article ${index}`, sortWeight: index, category: 'login' });
      const firstPage = await request(base, adminToken);
      const secondPage = await request(base + '?page=2', adminToken);
      assert.equal(firstPage.total, 7);
      assert.equal(firstPage.items.length, 5);
      assert.equal(secondPage.items.length, 2);
      assert.deepEqual(firstPage.items.map(item => item.sortWeight), [5, 4, 3, 2, 1]);
      assert.deepEqual(secondPage.items.map(item => item.sortWeight), [0, -1.25]);
      assert.deepEqual(firstPage.summary, { draft: 6, published: 1, archived: 0 });
      for (const search of ['CAMERA', '相机', '测试帮助', 'Synthetic help']) {
        const filtered = await request(base + '?search=' + encodeURIComponent(search) + '&status=published&category=checkin', adminToken);
        assert.equal(filtered.total, 1);
        assert.equal(filtered.items[0].id, article.id);
        assert.deepEqual(filtered.summary, firstPage.summary);
      }
      assert.equal((await request(base + '?search=%25', adminToken)).total, 0);
      assert.equal((await request(base + '?category=login&status=published', adminToken)).total, 0);
      for (const suffix of ['?page=0', '?page=1.5', '?status=OPEN', '?category=unknown']) {
        const response = await fetch(baseUrl + base + suffix, { headers: { authorization: `Bearer ${adminToken}` } });
        assert.equal(response.status, 422);
      }
      console.log(JSON.stringify({ check: 'HELP_LIST_FILTER_PAGINATION_AND_STUDENT_PUBLICATION_VISIBILITY', result: 'PASS' }));
      const nativeFetch = globalThis.fetch, previousStorage = globalThis.localStorage;
      const stored = new Map([['bnbu.student.web.apiTokens', JSON.stringify(studentLogin)]]);
      globalThis.localStorage = { getItem: key => stored.get(key) ?? null,
        setItem: (key, value) => stored.set(key, value), removeItem: key => stored.delete(key) };
      globalThis.fetch = (url, input) => nativeFetch(new URL(url, baseUrl), input);
      try {
        const client = await import('../../BNBU-Sports-Web-new/frontend/student/js/api.js');
        const projected = await client.listHelpArticles();
        assert.equal(projected.length, 1);
        assert.equal(projected[0].id, article.id);
        assert.equal(projected[0].title, '测试帮助');
      } finally { globalThis.fetch = nativeFetch; globalThis.localStorage = previousStorage; }
      console.log(JSON.stringify({ check: 'STUDENT_HELP_WEB_API_CLIENT_REAL_HTTP', result: 'PASS' }));
      try {
        for (const [permissions, expected] of [[[], 403], [['STUDENT_FEEDBACK'], 403], [['HELP_CENTER'], 200], [[], 403]]) {
          await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb
            WHERE user_id=${fixture.adminUserId}::uuid`;
          for (const route of [base, `${base}/${article.id}`]) {
            const response = await fetch(baseUrl + route, { headers: { authorization: `Bearer ${adminToken}` } });
            assert.equal(response.status, expected);
          }
          const response = await fetch(baseUrl + base + '/' + article.id, { method: 'POST', headers: {
            authorization: `Bearer ${adminToken}`, 'content-type': 'application/json', 'idempotency-key': randomUUID(),
          }, body: JSON.stringify({ ...content, expectedVersion: article.version }) });
          assert.equal(response.status, expected === 200 ? 201 : 403);
          if (response.ok) article = (await response.json()).data;
        }
      } finally {
        await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb
          WHERE user_id=${fixture.adminUserId}::uuid`;
      }
      assert.equal(article.version, 5);
      assert.equal((await request(`${base}/${article.id}`, adminToken)).version, 5);
      const outsider = await seedFoundationFixture(prisma, randomUUID().slice(0, 8).toUpperCase());
      await prisma.$executeRaw`INSERT INTO v81_admin_access(user_id,organization_id,kind)
        VALUES (${outsider.adminUserId}::uuid,${outsider.organizationId}::uuid,'SUPER')`;
      let outsiderLogin = await request('/auth/password-login', null, { account: outsider.adminEmail, password: TEST_PASSWORD });
      const outsiderSecurity = await request('/auth/account-security', outsiderLogin.accessToken);
      const outsiderPassword = 'Synthetic-Changed-' + randomUUID();
      await request('/auth/own-password', outsiderLogin.accessToken, { currentPassword: TEST_PASSWORD,
        newPassword: outsiderPassword, confirmPassword: outsiderPassword, expectedVersion: outsiderSecurity.version });
      outsiderLogin = await request('/auth/password-login', null, { account: outsider.adminEmail, password: outsiderPassword });
      const outsiderList = await request(base, outsiderLogin.accessToken);
      assert.equal(outsiderList.total, 0);
      assert.deepEqual(outsiderList.summary, { draft: 0, published: 0, archived: 0 });
      for (const method of ['GET', 'POST']) {
        const response = await fetch(baseUrl + base + '/' + article.id, { method, headers: {
          authorization: `Bearer ${outsiderLogin.accessToken}`, 'content-type': 'application/json', 'idempotency-key': randomUUID(),
        }, ...(method === 'POST' ? { body: JSON.stringify({ ...content, expectedVersion: article.version }) } : {}) });
        assert.equal(response.status, 404);
      }
      assert.equal((await request(`${base}/${article.id}`, adminToken)).version, 5);
      console.log(JSON.stringify({ check: 'HELP_SUBADMIN_GRANT_REVOKE_AND_CROSS_ORGANIZATION_ADMIN_ISOLATION', result: 'PASS' }));
      console.log(JSON.stringify({ check: 'HELP_DRAFT_PUBLISH_ARCHIVE_REPUBLISH_REPLAY_AND_ACCESS', result: 'PASS', revisions: revisions.length }));
      if(process.env.V81_HELP_PORTAL==='1') {
        const {probeHelpPortal}=await import('./v81-help-portal-probe.mjs');
        await probeHelpPortal({request,baseUrl,adminToken});
      }
      return;
    }
    if (process.env.V81_FEEDBACK_CASE === '1') {
      const feedback = await request('/feedback', token, { category: 'BUG', content: 'Synthetic feedback lifecycle' });
      assert.equal(feedback.status, 'OPEN');
      let current = feedback;
      for (const status of ['IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED', 'IN_PROGRESS']) {
        const input = { status, publicReply: `Synthetic public reply: ${status}`, expectedVersion: current.version };
        const key = randomUUID();
        current = await request(`/admin/feedback/${feedback.id}/handling`, adminToken, input, key);
        assert.deepEqual(await request(`/admin/feedback/${feedback.id}/handling`, adminToken, input, key), current);
      }
      const detail = await request(`/admin/feedback/${feedback.id}`, adminToken);
      assert.equal(detail.history.length, 5);
      const studentHistory = await request(`/student/feedback/${feedback.id}/history`, token);
      assert.equal(studentHistory.items.length, 5);
      assert.deepEqual(studentHistory.items.map(item => item.publicReply), detail.history.map(item => item.publicReply));
      assert.ok(studentHistory.items.every(item => !Object.hasOwn(item, 'actorUserId') && !Object.hasOwn(item, 'actorName')));
      const otherFeedback = await prisma.feedback.create({ data: { id: require('uuid').v7(),
        organizationId: fixture.organizationId, createdByUserId: otherStudent.userId, category: 'OTHER',
        content: 'Other student private feedback fixture', status: 'OPEN', createdAt: new Date(), updatedAt: new Date() } });
      for (const otherId of [otherFeedback.id, require('uuid').v7()]) {
        const inaccessible = await fetch(baseUrl + `/student/feedback/${otherId}/history`, {
          headers: { authorization: `Bearer ${token}` },
        });
        assert.equal(inaccessible.status, 404);
      }
      for (const wrongRole of [teacherToken, adminToken]) {
        const inaccessible = await fetch(baseUrl + `/student/feedback/${feedback.id}/history`, {
          headers: { authorization: `Bearer ${wrongRole}` },
        });
        assert.equal(inaccessible.status, 403);
      }
      console.log(JSON.stringify({ check: 'FEEDBACK_STUDENT_HISTORY_OWNER_AND_ROLE_ISOLATION', result: 'PASS' }));
      const notificationPage = await request('/notifications?limit=100', token);
      const feedbackNotifications = notificationPage.filter(item => item.targetId === feedback.id);
      assert.equal(feedbackNotifications.length, 5);
      assert.ok(feedbackNotifications.every(item => item.notificationType === 'FEEDBACK_UPDATED'));
      const readKey = randomUUID();
      const markedRead = await request(`/notifications/${feedbackNotifications[0].id}/read`, token, {}, readKey);
      assert.ok(markedRead.readAt);
      assert.deepEqual(await request(`/notifications/${feedbackNotifications[0].id}/read`, token, {}, readKey), markedRead);
      const unread = await request('/notifications?limit=100&unreadOnly=true', token);
      assert.equal(unread.filter(item => item.targetId === feedback.id).length, 4);
      assert.equal((await request(`/feedback/${feedback.id}`, token)).version, current.version);
      console.log(JSON.stringify({ check: 'FEEDBACK_NOTIFICATION_READ_REPLAY_BUSINESS_UNCHANGED', result: 'PASS' }));
      assert.equal(await prisma.notification.count({ where: { targetId: feedback.id, notificationType: 'FEEDBACK_UPDATED',
        recipientUserId: student.userId } }), 5);
      assert.equal(detail.requester.email, student.email);
      assert.ok(detail.requester.name && detail.requester.studentNumber);
      assert.ok(detail.history.every(event => event.actorUserId === fixture.adminUserId && event.actorName));
      assert.deepEqual(detail.history.map(event => event.nextStatus), ['IN_PROGRESS', 'WAITING_TECH', 'RESOLVED', 'CLOSED', 'IN_PROGRESS']);
      const own = await request(`/feedback/${feedback.id}`, token);
      assert.equal(own.publicReply, current.publicReply);
      assert.equal(own.status, 'IN_PROGRESS');
      const denied = await fetch(baseUrl + `/admin/feedback/${feedback.id}`, { headers: { authorization: `Bearer ${teacherToken}` } });
      assert.equal(denied.status, 403);
      for (let index = 0; index < 6; index++) {
        await request('/feedback', token, { category: 'SUGGESTION', content: `Synthetic pagination item ${index}` });
      }
      const firstPage = await request('/admin/feedback?page=1', adminToken);
      const secondPage = await request('/admin/feedback?page=2', adminToken);
      assert.equal(firstPage.items.length, 6);
      assert.equal(secondPage.items.length, 2);
      assert.equal(firstPage.total, 8);
      assert.equal(new Set([...firstPage.items, ...secondPage.items].map(item => item.id)).size, 8);
      assert.equal(firstPage.summary.pending, 8);
      assert.equal(firstPage.items[0].requester.email, student.email);
      const filtered = await request('/admin/feedback?category=BUG&status=IN_PROGRESS', adminToken);
      assert.deepEqual(filtered.items.map(item => item.id), [feedback.id]);
      const byId = await request(`/admin/feedback?search=${feedback.id}`, adminToken);
      assert.equal(byId.total, 1);
      const byEmail = await request(`/admin/feedback?search=${encodeURIComponent(student.email)}`, adminToken);
      assert.equal(byEmail.total, 7);
      const noResult = await request('/admin/feedback?search=------------------------------------', adminToken);
      assert.equal(noResult.total, 0);
      assert.equal(noResult.summary.total, 8);
      console.log(JSON.stringify({ check: 'FEEDBACK_LIST_PAGINATION_FILTER_SEARCH_SUMMARY', result: 'PASS' }));
      const handlingUrl = baseUrl + `/admin/feedback/${feedback.id}/handling`;
      const postHandling = (body) => fetch(handlingUrl, { method: 'POST', headers: {
        authorization: `Bearer ${adminToken}`, 'content-type': 'application/json', 'idempotency-key': randomUUID(),
      }, body: JSON.stringify(body) });
      const concurrent = await Promise.all(['First response', 'Second response'].map(publicReply =>
        postHandling({ status: 'RESOLVED', publicReply, expectedVersion: current.version })));
      assert.deepEqual(concurrent.map(response => response.status).sort(), [201, 409]);
      const afterConcurrent = await request(`/admin/feedback/${feedback.id}`, adminToken);
      assert.equal(afterConcurrent.version, current.version + 1);
      assert.equal(afterConcurrent.history.length, 6);
      for (const invalid of [
        { status: 'OPEN', publicReply: 'Cannot reset to initial state' },
        { status: 'CLOSED', publicReply: '   ' },
        { status: 'CLOSED', publicReply: 'Has forbidden note', internalNote: 'forbidden' },
      ]) {
        assert.equal((await postHandling({ ...invalid, expectedVersion: afterConcurrent.version })).status, 422);
      }
      assert.equal((await request(`/admin/feedback/${feedback.id}`, adminToken)).history.length, 6);
      console.log(JSON.stringify({ check: 'FEEDBACK_CONCURRENT_VERSION_AND_INVALID_INPUT', result: 'PASS' }));
      await assert.rejects(prisma.feedback.update({ where: { id: feedback.id }, data: { content: 'Tampered original' } }));
      await assert.rejects(prisma.feedbackEvent.update({ where: { id: afterConcurrent.history[0].id }, data: { publicReply: 'Tampered history' } }));
      await assert.rejects(prisma.$transaction(async tx => {
        await tx.feedback.update({ where: { id: feedback.id }, data: { status: 'CLOSED', publicReply: 'No matching history',
          version: { increment: 1 }, updatedAt: new Date() } });
      }));
      const protectedDetail = await request(`/admin/feedback/${feedback.id}`, adminToken);
      assert.equal(protectedDetail.content, 'Synthetic feedback lifecycle');
      assert.deepEqual(protectedDetail.history, afterConcurrent.history);
      assert.equal(protectedDetail.version, afterConcurrent.version);
      console.log(JSON.stringify({ check: 'FEEDBACK_DATABASE_IMMUTABILITY_AND_REQUIRED_HISTORY', result: 'PASS' }));
      // Permission combinations are fixture changes; requests keep the same authenticated token.
      let permissionVersion = protectedDetail.version;
      try {
        for (const [permissions, expected] of [[[], 403], [['USER_ACCOUNTS'], 403], [['STUDENT_FEEDBACK'], 200], [[], 403]]) {
          await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUB',permissions=${JSON.stringify(permissions)}::jsonb
            WHERE user_id=${fixture.adminUserId}::uuid`;
          for (const path of ['/admin/feedback', `/admin/feedback/${feedback.id}`]) {
            const response = await fetch(baseUrl + path, { headers: { authorization: `Bearer ${adminToken}` } });
            assert.equal(response.status, expected);
          }
          if (expected === 403) {
            assert.equal((await postHandling({ status: 'CLOSED', publicReply: 'Denied write', expectedVersion: permissionVersion })).status, 403);
          } else {
            const permitted = await postHandling({ status: 'IN_PROGRESS', publicReply: 'Authorized subadmin follow-up', expectedVersion: permissionVersion });
            assert.equal(permitted.status, 201);
            permissionVersion = (await permitted.json()).data.version;
            assert.equal(permissionVersion, protectedDetail.version + 1);
          }
        }
      } finally {
        await prisma.$executeRaw`UPDATE v81_admin_access SET kind='SUPER',permissions='[]'::jsonb
          WHERE user_id=${fixture.adminUserId}::uuid`;
      }
      const afterPermissions = await request(`/admin/feedback/${feedback.id}`, adminToken);
      assert.equal(afterPermissions.version, permissionVersion);
      assert.equal(afterPermissions.history.length, protectedDetail.history.length + 1);
      assert.equal((await request(`/feedback/${feedback.id}`, token)).publicReply, 'Authorized subadmin follow-up');
      console.log(JSON.stringify({ check: 'FEEDBACK_SUBADMIN_PERMISSION_GRANT_REVOKE_SAME_TOKEN', result: 'PASS' }));
      console.log(JSON.stringify({ check: 'FEEDBACK_CREATE_HANDLE_REOPEN_HISTORY_REPLAY_STUDENT_READBACK', result: 'PASS' }));
      return;
    }
    if (process.env.V81_LIVE_TIMER === '1') {
      const started = await request('/exercise-sessions', token, {
        enrollmentId: student.enrollmentId, clientObservedAt: '2020-01-01T00:00:00Z',
      });
      assert.equal(started.status, 'IN_PROGRESS');
      await delay(1200);
      const paused = await request(`/exercise-sessions/${started.id}/pause`, token, {
        expectedVersion: started.version, clientObservedAt: '2030-01-01T00:00:00Z',
      });
      assert.equal(paused.status, 'PAUSED');
      assert.ok(paused.actualDurationSeconds >= 1 && paused.actualDurationSeconds < 30);
      await delay(1200);
      const pausedRead = await request(`/exercise-sessions/${started.id}`, token);
      assert.equal(pausedRead.actualDurationSeconds, paused.actualDurationSeconds);
      assert.ok(pausedRead.pausedDurationSeconds >= 1);
      const resumed = await request(`/exercise-sessions/${started.id}/resume`, token, {
        expectedVersion: paused.version, clientObservedAt: new Date().toISOString(),
      });
      assert.equal(resumed.status, 'IN_PROGRESS');
      await delay(1200);
      const finishBody = { expectedVersion: resumed.version, clientObservedAt: new Date().toISOString() };
      const finishKey = randomUUID();
      const finished = await request(`/exercise-sessions/${started.id}/finish`, token, finishBody, finishKey);
      assert.equal(finished.status, 'COMPLETED');
      assert.ok(finished.actualDurationSeconds >= paused.actualDurationSeconds + 1 && finished.actualDurationSeconds < 30);
      assert.deepEqual(await request(`/exercise-sessions/${started.id}/finish`, token, finishBody, finishKey), finished);
      const stored = await prisma.exerciseSession.findUniqueOrThrow({ where: { id: started.id } });
      assert.equal(Number(stored.actualDurationSeconds), finished.actualDurationSeconds);
      assert.equal(await request(`/exercise-sessions/active?enrollmentId=${student.enrollmentId}`, token), null);
      const syncEvent = { eventId: randomUUID(), eventType: 'STATE_SYNC', observedAt: new Date().toISOString() };
      const synced = await request(`/exercise-sessions/${started.id}/reconcile`, token, {
        expectedVersion: finished.version, clientEvents: [syncEvent],
      });
      assert.equal(synced.status, 'COMPLETED');
      assert.equal(synced.actualDurationSeconds, finished.actualDurationSeconds);
      const repeatedSync = await request(`/exercise-sessions/${started.id}/reconcile`, token, {
        expectedVersion: synced.version, clientEvents: [syncEvent],
      });
      assert.equal(repeatedSync.version, synced.version);
      assert.equal(await prisma.exerciseSessionEvent.count({ where: {
        exerciseSessionId: started.id, clientEventId: syncEvent.eventId,
      } }), 1);
      for (const event of [
        { eventId: randomUUID(), eventType: 'STATE_SYNC', observedAt: '2099-01-01T00:00:00Z' },
        { eventId: randomUUID(), eventType: 'ADD_DURATION', observedAt: new Date().toISOString() },
      ]) {
        const rejected = await fetch(baseUrl + `/exercise-sessions/${started.id}/reconcile`, {
          method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
          body: JSON.stringify({ expectedVersion: synced.version, clientEvents: [event] }),
        });
        assert.equal(rejected.status, 409);
      }
      const afterSync = await request(`/exercise-sessions/${started.id}`, token);
      assert.equal(afterSync.actualDurationSeconds, finished.actualDurationSeconds);
      assert.equal(afterSync.status, 'COMPLETED');
      console.log(JSON.stringify({ check: 'STATE_SYNC_DEDUPLICATION_FUTURE_AND_DURATION_FORGERY_DENIED', result: 'PASS' }));
      console.log(JSON.stringify({ check: 'REAL_TIMER_START_PAUSE_RESUME_FINISH_REPLAY', result: 'PASS',
        actualDurationSeconds: finished.actualDurationSeconds, pausedDurationSeconds: finished.pausedDurationSeconds,
        clientClockSpoofIgnored: true }));
      return;
    }
    const bytes = syntheticPng();
    const digest = createHash('sha256').update(bytes).digest('hex');
    const pickerRejected = await fetch(`${baseUrl}/media-uploads`, {
      method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
      body: JSON.stringify({ sessionId, businessPurpose: 'EXERCISE_RECORD', mediaType: 'IMAGE',
        mimeType: 'image/png', fileSizeBytes: bytes.length, captureSource: 'FILE_PICKER', declaredContentSha256: digest }),
    });
    assert.equal(pickerRejected.status, 422);
    console.log(JSON.stringify({ check: 'EXERCISE_FILE_PICKER_REJECTED_CAMERA_ONLY', result: 'PASS' }));
    const upload = await request('/media-uploads', token, { sessionId, businessPurpose: 'EXERCISE_RECORD',
      mediaType: 'IMAGE', mimeType: 'image/png', fileSizeBytes: bytes.length,
      captureSource: process.env.V81_UPLOAD_CAPTURE_SOURCE ?? 'IN_APP_CAMERA', declaredContentSha256: digest });
    const put = await fetch(upload.uploadUrl, { method: upload.uploadMethod, headers: upload.requiredHeaders, body: bytes });
    assert.ok(put.ok, `Object upload HTTP ${put.status}`);
    const etag = put.headers.get('etag')?.replaceAll('"', '');
    assert.ok(etag);
    const confirmed = await request(`/media-uploads/${upload.uploadSessionId}/confirm`, token, { etag });
    await request(`/media/${upload.mediaId}/bind`, token, { sessionId, expectedVersion: confirmed.version });
    let media;
    for (let attempt = 0; attempt < 40; attempt++) {
      media = await request(`/media/${upload.mediaId}`, token);
      if (media.uploadStatus === 'AVAILABLE') break;
      if (media.uploadStatus === 'REJECTED') throw new Error('Uploaded image rejected');
      await delay(500);
    }
    assert.equal(media.uploadStatus, 'AVAILABLE');
    assert.equal(media.verifiedContentSha256, digest);
    assert.equal(media.verifiedFileSizeBytes, bytes.length);
    console.log(JSON.stringify({ check: 'STUDENT_UPLOAD_CONFIRM_BIND_VERIFY', result: 'PASS', elapsedSessionFixture: true,
      captureSource: process.env.V81_UPLOAD_CAPTURE_SOURCE ?? 'IN_APP_CAMERA', syntheticImage: true }));
    const draft = await request('/exercise-records', token, { sessionId, creditType: 'GENERAL',
      sportType: 'RUNNING', description: 'Synthetic completed running session', clientRequestId: randomUUID() });
    const submitted = await request(`/exercise-records/${draft.id}/submit`, token, {
      mediaIds: [upload.mediaId], expectedVersion: draft.version });
    assert.equal(submitted.workflowStage, 'PENDING_TEACHER');
    assert.equal(submitted.creditedDurationSeconds, 0);
    const reviewPath = `/exercise-records/${draft.id}/v81-reviews`;
    const reviewInput = { action: 'VALID', expectedVersion: submitted.workflowVersion };
    for (const other of otherTeacherTokens) {
      for (const [path, body] of [[`/exercise-records/${draft.id}/workflow`, null], [reviewPath, reviewInput]]) {
        const denied = await fetch(baseUrl + path, { method: body ? 'POST' : 'GET', headers: {
          'content-type': 'application/json', authorization: `Bearer ${other.token}`,
          'idempotency-key': randomUUID(),
        }, ...(body ? { body: JSON.stringify(body) } : {}) });
        assert.equal(denied.status, 404, `${other.role} scoped resource must be concealed`);
      }
    }
    const forbidden = await fetch(baseUrl + reviewPath, { method: 'POST', headers: {
      'content-type': 'application/json', authorization: `Bearer ${token}`, 'idempotency-key': randomUUID(),
    }, body: JSON.stringify(reviewInput) });
    assert.equal(forbidden.status, 403);
    const beforeReview = await request(`/exercise-records/${draft.id}`, token);
    assert.equal(beforeReview.workflowStage, 'PENDING_TEACHER');
    if (process.env.V81_SUPPLEMENT_CASE === '1') {
      const returned = await request(reviewPath, teacherToken, { action: 'RETURN_FOR_SUPPLEMENT',
        reasonCode: 'UNCLEAR_EVIDENCE', supplementHours: 24, expectedVersion: submitted.workflowVersion });
      assert.equal(returned.stage, 'AWAITING_SUPPLEMENT');
      const todos = await request('/student/proof-todos', token);
      assert.ok(todos.items.some(item => item.recordId === draft.id));
      const clock = await request(`/exercise-records/${draft.id}/workflow`, token);
      assert.equal(clock.supplementUsed, true);
      assert.ok(clock.supplement.remainingMs > 0 && clock.supplement.remainingMs <= 86400000);
      if (process.env.V81_EXPIRY_CASE === '1') {
        // Isolated synthetic fixture moves the granted window into the past; worker/API remain real.
        await prisma.$executeRaw`UPDATE v81_record_workflows SET supplement_started_at=${new Date(Date.now() - 25 * 3600000)}
          WHERE record_id=${draft.id}::uuid`;
        let expired;
        for (let attempt = 0; attempt < 30; attempt++) {
          expired = await request(`/exercise-records/${draft.id}`, token);
          if (expired.workflowStage === 'INVALID') break;
          await delay(500);
        }
        assert.equal(expired.workflowStage, 'INVALID');
        assert.equal(expired.currentReview.reasonCode, 'SUPPLEMENT_DEADLINE_MISSED');
        assert.equal(expired.creditedDurationSeconds, 0);
        const remainingTodos = await request('/student/proof-todos', token);
        assert.ok(!remainingTodos.items.some(item => item.recordId === draft.id));
        const late = await fetch(baseUrl + `/exercise-records/${draft.id}/supplements`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`,
            'idempotency-key': randomUUID() }, body: JSON.stringify({ mediaIds: [upload.mediaId], expectedVersion: expired.workflowVersion }) });
        assert.equal(late.status, 409);
        await delay(5500);
        const expiryEvents = await prisma.$queryRaw`SELECT count(*)::int AS count FROM v81_events
          WHERE resource_id=${draft.id}::uuid AND event_type='SUPPLEMENT_EXPIRED'`;
        assert.equal(expiryEvents[0].count, 1);
        console.log(JSON.stringify({ check: 'SUPPLEMENT_EXPIRY_WORKER_ZERO_CREDIT_LATE_DENIED_ONCE', result: 'PASS', syntheticPastDeadline: true }));
        return;
      }
      if (process.env.V81_MAINTENANCE_CASE === '1') {
        const policy = await prisma.systemPolicy.findUniqueOrThrow({ where: { organizationId: fixture.organizationId } });
        const maintenance = await request('/system-mode/changes', adminToken, { mode: 'MAINTENANCE',
          expectedVersion: policy.version, reason: 'Synthetic maintenance test', titleZh: '测试维护',
          titleEn: 'Synthetic maintenance', bodyZh: '本地补证暂停测试', bodyEn: 'Local supplement pause test',
          estimatedRecoveryAt: new Date(Date.now() + 60000).toISOString() });
        const pausedA = await request('/student/proof-todos', token);
        const todoA = pausedA.items.find(item => item.recordId === draft.id);
        assert.equal(todoA.paused, true);
        await delay(1200);
        const pausedB = await request('/student/proof-todos', token);
        const todoB = pausedB.items.find(item => item.recordId === draft.id);
        assert.equal(todoB.remainingSeconds, todoA.remainingSeconds);
        const blocked = await fetch(baseUrl + `/exercise-records/${draft.id}/supplements`, {
          method: 'POST', headers: { 'content-type': 'application/json', authorization: `Bearer ${token}`,
            'idempotency-key': randomUUID() }, body: JSON.stringify({ mediaIds: [upload.mediaId], expectedVersion: returned.version }) });
        assert.equal(blocked.status, 503);
        await request('/system-mode/changes', adminToken, { mode: 'NORMAL', expectedVersion: maintenance.policyVersion,
          reason: 'Synthetic maintenance completed' });
        const resumed = await request(`/exercise-records/${draft.id}/workflow`, token);
        assert.equal(resumed.supplement.paused, false);
        assert.ok(Date.parse(resumed.supplement.deadline) - Date.parse(clock.supplement.deadline) >= 1200);
        console.log(JSON.stringify({ check: 'MAINTENANCE_SUPPLEMENT_FREEZE_WRITE_DENIED_RESUME', result: 'PASS' }));
      }
      const supplementIds = [upload.mediaId];
      if (process.env.V81_SUPPLEMENT_NEW_MEDIA === '1') {
        const nextUpload = await request('/media-uploads', token, { sessionId, businessPurpose: 'EXERCISE_RECORD',
          mediaType: 'IMAGE', mimeType: 'image/png', fileSizeBytes: bytes.length,
          captureSource: 'IN_APP_CAMERA', declaredContentSha256: digest });
        const nextPut = await fetch(nextUpload.uploadUrl, { method: 'PUT', headers: nextUpload.requiredHeaders, body: bytes });
        assert.ok(nextPut.ok);
        const nextConfirmed = await request(`/media-uploads/${nextUpload.uploadSessionId}/confirm`, token,
          { etag: nextPut.headers.get('etag').replaceAll('"', '') });
        await request(`/media/${nextUpload.mediaId}/bind`, token, { sessionId, expectedVersion: nextConfirmed.version });
        let nextMedia;
        for (let attempt = 0; attempt < 40; attempt++) {
          nextMedia = await request(`/media/${nextUpload.mediaId}`, token);
          if (nextMedia.uploadStatus === 'AVAILABLE') break;
          await delay(500);
        }
        assert.equal(nextMedia.uploadStatus, 'AVAILABLE');
        assert.equal(nextMedia.verifiedContentSha256, digest);
        supplementIds.push(nextUpload.mediaId);
      }
      const supplemented = await request(`/exercise-records/${draft.id}/supplements`, token, {
        mediaIds: supplementIds, expectedVersion: returned.version });
      assert.equal(supplemented.materialVersion, 2);
      assert.equal(supplemented.stage, 'PENDING_TEACHER');
      const secondReturn = await fetch(baseUrl + reviewPath, { method: 'POST', headers: {
        'content-type': 'application/json', authorization: `Bearer ${teacherToken}`,
        'idempotency-key': randomUUID(),
      }, body: JSON.stringify({ action: 'RETURN_FOR_SUPPLEMENT', reasonCode: 'UNCLEAR_EVIDENCE',
        supplementHours: 24, expectedVersion: supplemented.version }) });
      assert.equal(secondReturn.status, 422);
      const versions = await request(`/exercise-records/${draft.id}/workflow`, token);
      assert.equal(versions.materialVersion, 2);
      assert.equal(versions.materials.length, 1 + supplementIds.length);
      assert.deepEqual(versions.materials.filter(item => item.materialVersion === 1).map(item => item.mediaId), [upload.mediaId]);
      assert.deepEqual(versions.materials.filter(item => item.materialVersion === 2).map(item => item.mediaId), supplementIds);
      reviewInput.expectedVersion = supplemented.version;
      console.log(JSON.stringify({ check: 'RETURN_SUPPLEMENT_REUSE_ORIGINAL_SECOND_RETURN_DENIED', result: 'PASS' }));
    }
    const reviewKey = randomUUID();
    const decision = await request(reviewPath, teacherToken, reviewInput, reviewKey);
    assert.equal(decision.stage, 'VALID');
    assert.equal(decision.creditedMinutes, 60);
    const replay = await request(reviewPath, teacherToken, reviewInput, reviewKey);
    assert.deepEqual(replay, decision);
    const reviewCount = await prisma.reviewRecord.count({ where: { recordId: draft.id } });
    assert.equal(reviewCount, 2, 'Initial pending plus exactly one teacher decision');
    const events = await prisma.$queryRaw`SELECT count(*)::int AS count FROM v81_events
      WHERE resource_id=${draft.id}::uuid AND event_type='VALID'`;
    assert.equal(events[0].count, 1);
    const readback = await request(`/exercise-records/${draft.id}`, token);
    assert.equal(readback.workflowStage, 'VALID');
    assert.equal(readback.creditedDurationSeconds, 3600);
    const persisted = await prisma.$queryRaw`SELECT stage FROM v81_record_workflows WHERE record_id=${draft.id}::uuid`;
    assert.equal(persisted[0].stage, 'VALID');
    console.log(JSON.stringify({ check: 'RULES_SUBMIT_TEACHER_APPROVE_STUDENT_READBACK', result: 'PASS', creditedMinutes: 60 }));
    console.log(JSON.stringify({ check: 'STUDENT_REVIEW_DENIED_AND_TEACHER_REPLAY_ONCE', result: 'PASS' }));
    console.log(JSON.stringify({ check: 'OTHER_TEACHER_AND_ORGANIZATION_READ_REVIEW_DENIED', result: 'PASS' }));
    const gradesPath = `/enrollments/${student.enrollmentId}/final-grades`;
    const gradeInput = { finalGrade: 123, published: false, expectedVersion: 0 };
    const gradeKey = randomUUID();
    const grade = await request(gradesPath, teacherToken, gradeInput, gradeKey);
    assert.deepEqual(await request(gradesPath, teacherToken, gradeInput, gradeKey), grade);
    await request(gradesPath, teacherToken, { finalGrade: 125, published: true, expectedVersion: 1 });
    const gradeHistory = await request(gradesPath, teacherToken);
    assert.deepEqual(gradeHistory.items.map(item => [item.version, item.finalGrade, item.published]),
      [[2, 125, true], [1, 123, false]]);
    for (const [actor, expectedStatus] of [[token, 403], [adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])]) {
      const denied = await fetch(baseUrl + gradesPath, { headers: { authorization: `Bearer ${actor}` } });
      assert.equal(denied.status, expectedStatus);
    }
    const noted = await fetch(baseUrl + gradesPath, { method: 'POST', headers: {
      'content-type': 'application/json', authorization: `Bearer ${teacherToken}`, 'idempotency-key': randomUUID(),
    }, body: JSON.stringify({ finalGrade: 126, published: true, expectedVersion: 2, note: 'Forbidden note' }) });
    assert.equal(noted.status, 422);
    const afterGrade = await request(`/exercise-records/${draft.id}`, token);
    assert.equal(afterGrade.creditedDurationSeconds, 3600);
    assert.equal(Object.hasOwn(afterGrade, 'finalGrade'), false);
    console.log(JSON.stringify({ check: 'INTERNAL_GRADE_HISTORY_REPLAY_ROLE_ISOLATION_NO_NOTE', result: 'PASS' }));
    const certificationWebp = process.env.V81_CERTIFICATION_WEBP === '1';
    const certificationBytes = certificationWebp
      ? readFileSync(new URL('../../backend/test/fixtures/v81-media/sample-lossless.webp', import.meta.url)) : bytes;
    const certificationDigest = createHash('sha256').update(certificationBytes).digest('hex');
    const certificationUpload = await request('/media-uploads', token, { enrollmentId: student.enrollmentId,
      businessPurpose: 'EXEMPTION_APPLICATION', mediaType: 'IMAGE', mimeType: certificationWebp ? 'image/webp' : 'image/png',
      fileSizeBytes: certificationBytes.length, captureSource: 'FILE_PICKER', declaredContentSha256: certificationDigest });
    const certificationPut = await fetch(certificationUpload.uploadUrl, { method: 'PUT', headers: certificationUpload.requiredHeaders, body: certificationBytes });
    assert.ok(certificationPut.ok);
    await request(`/media-uploads/${certificationUpload.uploadSessionId}/confirm`, token,
      { etag: certificationPut.headers.get('etag').replaceAll('"', '') });
    let certificationMedia;
    for (let attempt = 0; attempt < 40; attempt++) {
      certificationMedia = await request(`/media/${certificationUpload.mediaId}`, token);
      if (certificationMedia.uploadStatus === 'AVAILABLE') break;
      await delay(500);
    }
    assert.equal(certificationMedia.uploadStatus, 'AVAILABLE');
    assert.equal(certificationMedia.verifiedContentSha256, certificationDigest);
    console.log(JSON.stringify({ check: 'CERTIFICATION_MEDIA_AVAILABLE', result: 'PASS', format: certificationWebp ? 'WEBP' : 'PNG' }));
    const application = await request('/exemption-applications', token, { enrollmentId: student.enrollmentId,
      applicationType: 'EXERCISE_CHECK_IN', applicationSubtype: 'SCHOOL_TEAM', organizationName: 'Synthetic team',
      reason: 'Synthetic participation certification', mediaIds: [certificationUpload.mediaId] });
    const sentApplication = await request(`/exemption-applications/${application.id}/submit`, token, { expectedVersion: application.version });
    const approved = await request(`/exemption-applications/${application.id}/review`, teacherToken, {
      decision: 'APPROVE', publicComment: 'Synthetic verified participation', courseMinutes: 120, generalMinutes: 0,
      expectedVersion: sentApplication.version });
    assert.equal(approved.status, 'APPROVED');
    const recognition = await prisma.$queryRaw`SELECT active,course_minutes FROM v81_certification_credits WHERE application_id=${application.id}::uuid`;
    assert.equal(recognition[0].active, true);
    assert.equal(recognition[0].course_minutes, 120);
    const approvedProgress = (await request('/student-progress', token)).find(item => item.enrollmentId === student.enrollmentId);
    assert.ok(approvedProgress);
    assert.equal(approvedProgress.courseRelated.recognizedSeconds, 7200);
    assert.equal(approvedProgress.general.validExerciseSeconds, 3600);
    assert.equal(approvedProgress.totalEffectiveSeconds, 10800);
    assert.equal(Object.hasOwn(approvedProgress, 'finalGrade'), false);
    const reportingStudent = await prisma.studentProfile.findUniqueOrThrow({ where: { id: student.studentId } });
    const reportingImportId = randomUUID(), reportingNow = new Date();
    await prisma.officialRosterImport.create({ data: { id: reportingImportId, organizationId: fixture.organizationId,
      classSectionId: fixture.teacherAActiveSectionId, versionNumber: 1, source: 'FILE', fileName: 'synthetic-report.csv',
      sourceFileStorageKey: 'synthetic/report.csv', fileChecksumSha256: 'c'.repeat(64),
      fieldMappingSnapshot: { studentNumber: 'student_number', fullName: 'full_name' }, importedBy: fixture.teacherUserId,
      importedAt: reportingNow, createdAt: reportingNow } });
    await prisma.officialRosterImport.update({ where: { id: reportingImportId }, data: { status: 'VALIDATING', version: { increment: 1 } } });
    await prisma.officialRosterEntry.create({ data: { id: randomUUID(), organizationId: fixture.organizationId,
      rosterImportId: reportingImportId, classSectionId: fixture.teacherAActiveSectionId, sourceRowNumber: 2,
      normalizedStudentNumber: reportingStudent.studentNumber, rawStudentNumberSafe: reportingStudent.studentNumber,
      fullName: reportingStudent.fullName, rowValidationStatus: 'VALID', rowErrorCodes: [], rawRowSnapshotSafe: {}, createdAt: reportingNow } });
    await prisma.officialRosterImport.update({ where: { id: reportingImportId }, data: { status: 'VALIDATED', totalRowCount: 1,
      validRowCount: 1, isCurrent: true, version: { increment: 1 } } });
    await request(`/roster-imports/${reportingImportId}/confirmation`, teacherToken, { expectedVersion: 3 });
    const reportingPath = `/class-sections/${fixture.teacherAActiveSectionId}/composite-roster`;
    const approvedReport = await request(reportingPath, teacherToken);
    const ownRoster = await request(ownRosterPath, token);
    assert.equal(ownRoster.available, true);
    assert.equal(ownRoster.status, 'MATCHED');
    assert.equal(ownRoster.registrationComplete, true);
    assert.equal(ownRoster.rosterVersion, approvedReport.rosterVersion);
    assert.deepEqual(Object.keys(ownRoster).sort(), ['enrollmentId', 'classSectionId', 'generatedAt', 'available',
      'rosterVersion', 'status', 'registrationComplete'].sort());
    for (const accessToken of [teacherToken, adminToken]) {
      const denied = await fetch(baseUrl + ownRosterPath, { headers: { authorization: `Bearer ${accessToken}` } });
      assert.equal(denied.status, 403); await denied.arrayBuffer();
    }
    const missingRoster = await fetch(baseUrl + `/enrollments/${randomUUID()}/roster-status`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(missingRoster.status, 404); await missingRoster.arrayBuffer();
    const studentSource = await fetch(baseUrl + `/roster-imports/${reportingImportId}/source`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(studentSource.status, 403); await studentSource.arrayBuffer();
    console.log(JSON.stringify({ check: 'STUDENT_OWN_ROSTER_UNAVAILABLE_THEN_MATCHED_TEACHER_PARITY_PRIVATE_SOURCE_DENIED', result: 'PASS' }));
    const reportProgress = approvedReport.rows[0].progress;
    assert.equal(reportProgress.actualSeconds, 3600);
    assert.equal(reportProgress.creditedSeconds, 3600);
    assert.equal(reportProgress.invalidActualSeconds, 0);
    assert.equal(reportProgress.validUncreditedSeconds, 0);
    assert.equal(reportProgress.course.recognizedSeconds, approvedProgress.courseRelated.recognizedSeconds);
    assert.equal(reportProgress.general.validExerciseSeconds, approvedProgress.general.validExerciseSeconds);
    assert.equal(reportProgress.remainingSeconds, 61200);
    const validDirectory = await request('/admin/course-directory', adminToken);
    const validDirectoryRow = validDirectory.rows.find(row => row.id === fixture.teacherAActiveSectionId);
    assert.equal(validDirectoryRow.currentMembers.creditedSeconds, 3600);
    assert.equal(validDirectoryRow.currentMembers.validRecords, 1);
    assert.equal(validDirectoryRow.currentMembers.submittedStudents, 1);
    assert.equal(validDirectoryRow.removedMembers.creditedSeconds, 0);
    console.log(JSON.stringify({ check: 'ADMIN_DIRECTORY_MANUAL_VALID_RECORD_CREDIT_3600', result: 'PASS' }));
    if (process.env.V81_ADMIN_DIRECTORY_REMOVAL === '1') {
      const beforeRemoval = await prisma.enrollment.findUniqueOrThrow({ where: { id: student.enrollmentId } });
      const removeKey = randomUUID();
      const removeBody = { expectedVersion: beforeRemoval.version, reason: 'Synthetic directory membership scope verification' };
      const removed = await request(`/enrollments/${student.enrollmentId}/remove`, teacherToken, removeBody, removeKey);
      assert.equal(removed.status, 'REMOVED');
      assert.deepEqual(await request(`/enrollments/${student.enrollmentId}/remove`, teacherToken, removeBody, removeKey), removed);
      const directory = await request('/admin/course-directory', adminToken);
      const historical = directory.rows.find(row => row.id === fixture.teacherAActiveSectionId);
      assert.equal(historical.currentMembers.students, 0);
      assert.equal(historical.currentMembers.creditedSeconds, 0);
      assert.equal(historical.currentMembers.totalRecords, 0);
      assert.equal(historical.currentMembers.submittedStudents, 0);
      assert.equal(historical.removedMembers.students, 1);
      assert.equal(historical.removedMembers.creditedSeconds, 3600);
      assert.equal(historical.removedMembers.validRecords, 1);
      assert.equal(historical.removedMembers.submittedStudents, 1);
      assert.equal(directory.summary.students, validDirectory.summary.students - 1);
      const restore = await request(`/enrollments/${student.enrollmentId}/restore`, teacherToken,
        { expectedVersion: removed.version, reason: 'Synthetic restore same historical membership' });
      assert.equal(restore.status, 'ACTIVE');
      const restoredDirectory = await request('/admin/course-directory', adminToken);
      const restoredRow = restoredDirectory.rows.find(row => row.id === fixture.teacherAActiveSectionId);
      assert.deepEqual(restoredRow.currentMembers, validDirectoryRow.currentMembers);
      assert.deepEqual(restoredRow.removedMembers, validDirectoryRow.removedMembers);
      assert.equal(restoredDirectory.summary.students, validDirectory.summary.students);
      console.log(JSON.stringify({ check: 'ADMIN_DIRECTORY_REMOVE_REPLAY_RESTORE_CURRENT_VS_HISTORY_3600_NO_DOUBLE_COUNT', result: 'PASS' }));
      return;
    }
    const revoked = await request(`/activity-certification-applications/${application.id}/revoke`, teacherToken,
      { expectedVersion: approved.version, reason: 'Synthetic corrected participation evidence' });
    assert.equal(revoked.status, 'REVOKED');
    const removedRecognition = await prisma.$queryRaw`SELECT active FROM v81_certification_credits WHERE application_id=${application.id}::uuid`;
    assert.equal(removedRecognition[0].active, false);
    const revokedProgress = (await request('/student-progress', token)).find(item => item.enrollmentId === student.enrollmentId);
    assert.equal(revokedProgress.courseRelated.recognizedSeconds, 0);
    assert.equal(revokedProgress.general.validExerciseSeconds, 3600);
    assert.equal(revokedProgress.totalEffectiveSeconds, 3600);
    const revokedReport = await request(reportingPath, teacherToken);
    assert.equal(revokedReport.rows[0].progress.remainingSeconds, 68400);
    assert.equal(revokedReport.rows[0].progress.course.recognizedSeconds, 0);
    let originalSettlement;
    if(process.env.V81_STUDENT_SETTLEMENT==='1') {
      assert.deepEqual(await request(`/student/enrollments/${student.enrollmentId}/settlement-result`,token),
        {enrollmentId:student.enrollmentId,available:false,reportVersion:null,ruleVersion:null,generatedAt:null,result:null});
    }
    if(process.env.V81_SETTLEMENT_REPORT_CORRECTION==='1') {
      const {seedCorrectionReport}=await import('./v81-settlement-record-correction-probe.mjs');
      originalSettlement=await seedCorrectionReport({prisma,fixture,report:revokedReport});
    }
    const correctionInput={ action: 'INVALID', reasonCode: 'INCONSISTENT_EVIDENCE', correctionReason: 'Synthetic report correction verification', expectedVersion: decision.version };
    const correctionKey=randomUUID(),correctionPath=`/exercise-records/${draft.id}/corrections`;
    if(originalSettlement && process.env.V81_SETTLEMENT_CORRECTION_ROLLBACK==='1') {
      const {probeCorrectionRollback}=await import('./v81-settlement-record-correction-probe.mjs');
      await probeCorrectionRollback({prisma,baseUrl,teacherToken,path:correctionPath,input:correctionInput,key:correctionKey,recordId:draft.id});
    }
    const corrected = await request(correctionPath, teacherToken,correctionInput,correctionKey);
    if(originalSettlement) {
      assert.deepEqual(await request(correctionPath,teacherToken,correctionInput,correctionKey),corrected);
      const {verifyCorrectionReport}=await import('./v81-settlement-record-correction-probe.mjs');
      await verifyCorrectionReport({prisma,fixture,original:originalSettlement,recordId:draft.id,request,adminToken});
      if(process.env.V81_STUDENT_SETTLEMENT==='1') {
        const {probeStudentSettlement}=await import('./v81-student-settlement-probe.mjs');
        await probeStudentSettlement({request,baseUrl,prisma,fixture,student,token,teacherToken,adminToken});
      }
      if(process.env.V81_SETTLEMENT_REPORT_READ==='1') {
        const {probeSettlementRead}=await import('./v81-settlement-read-probe.mjs');
        await probeSettlementRead({request,baseUrl,teacherToken,adminToken,studentToken:token,otherTeacherTokens,fixture,prisma});
      }
    }
    assert.equal(corrected.stage, 'INVALID');
    const invalidReport = await request(reportingPath, teacherToken);
    assert.equal(invalidReport.rows[0].progress.actualSeconds, 3600);
    assert.equal(invalidReport.rows[0].progress.invalidActualSeconds, 3600);
    assert.equal(invalidReport.rows[0].progress.creditedSeconds, 0);
    assert.equal(invalidReport.rows[0].progress.validUncreditedSeconds, 0);
    assert.equal(invalidReport.rows[0].progress.remainingSeconds, 72000);
    const invalidDirectory = await request('/admin/course-directory', adminToken);
    const invalidDirectoryRow = invalidDirectory.rows.find(row => row.id === fixture.teacherAActiveSectionId);
    assert.equal(invalidDirectoryRow.currentMembers.creditedSeconds, 0);
    assert.equal(invalidDirectoryRow.currentMembers.validRecords, 0);
    assert.equal(invalidDirectoryRow.currentMembers.invalidRecords, 1);
    assert.equal(invalidDirectoryRow.currentMembers.submittedStudents, 1);
    console.log(JSON.stringify({ check: 'ADMIN_DIRECTORY_CORRECTION_INVALID_REMOVES_CREDIT_PRESERVES_SUBMISSION', result: 'PASS' }));
    const exported = await request(reportingPath + '/export', teacherToken);
    assert.equal(exported.contentType, 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    assert.ok(exported.fileName.startsWith('composite-roster-preview-'));
    const { read: readReport, utils: reportUtils } = await import('../../backend/node_modules/xlsx/xlsx.mjs');
    const workbook = readReport(Buffer.from(exported.fileBase64, 'base64'), { type: 'buffer' });
    assert.deepEqual(workbook.SheetNames, ['说明', '名单内', '名单外']);
    const metadata = reportUtils.sheet_to_json(workbook.Sheets['说明'], { header: 1 });
    assert.equal(metadata[0][1], '实时预览（未结算）');
    assert.equal(metadata[1][1], exported.generatedAt);
    const reportRows = reportUtils.sheet_to_json(workbook.Sheets['名单内'], { header: 1 });
    assert.equal(reportRows[1][0], reportingStudent.studentNumber);
    assert.equal(workbook.Sheets['名单内'].A2.t, 's');
    assert.equal(workbook.Sheets['名单内'].A2.f, undefined);
    assert.equal(reportRows[1][8], 3600);
    assert.equal(reportRows[1][9], 3600);
    assert.equal(reportRows[1][11], 0);
    assert.equal(reportRows[1][19], 72000);
    assert.equal(reportUtils.sheet_to_json(workbook.Sheets['名单外'], { header: 1 }).length, 1);
    for (const [access, expected] of [[adminToken, 403], ...otherTeacherTokens.map(item => [item.token, 404])]) {
      const response = await fetch(baseUrl + reportingPath + '/export', { headers: { authorization: `Bearer ${access}` } });
      assert.equal(response.status, expected);
    }
    console.log(JSON.stringify({ check: 'COMPOSITE_XLSX_EXPORT_METADATA_TEXT_IDENTIFIERS_EXACT_SECONDS_TEACHER_SCOPE', result: 'PASS' }));
    const originalUser = await prisma.user.findUniqueOrThrow({ where: { id: student.userId } });
    try {
      await prisma.user.update({ where: { id: student.userId }, data: { emailVerifiedAt: null } });
      const unverified = await request(ownRosterPath, token);
      assert.equal(unverified.status, 'PENDING_REGISTRATION');
      assert.equal(unverified.registrationComplete, false);
      assert.equal((await request(reportingPath, teacherToken)).rows[0].status, unverified.status);
      await prisma.user.update({ where: { id: student.userId }, data: { emailVerifiedAt: originalUser.emailVerifiedAt } });
      await prisma.studentProfile.update({ where: { id: student.studentId }, data: { fullName: 'Synthetic identity conflict' } });
      const conflict = await request(ownRosterPath, token);
      assert.equal(conflict.status, 'IDENTITY_CONFLICT');
      assert.equal(conflict.registrationComplete, false);
      assert.equal((await request(reportingPath, teacherToken)).rows[0].status, conflict.status);
      await prisma.studentProfile.update({ where: { id: student.studentId }, data: {
        fullName: reportingStudent.fullName, studentNumber: 'X' + randomUUID().replaceAll('-', '').slice(0, 10).toUpperCase() } });
      const outside = await request(ownRosterPath, token);
      assert.equal(outside.status, 'EXTRA_IN_PLATFORM');
      assert.equal(outside.registrationComplete, false);
      assert.equal((await request(reportingPath, teacherToken)).extras.find(row => row.enrollmentId === student.enrollmentId).status, outside.status);
    } finally {
      await prisma.user.update({ where: { id: student.userId }, data: { emailVerifiedAt: originalUser.emailVerifiedAt } });
      await prisma.studentProfile.update({ where: { id: student.studentId }, data: {
        fullName: reportingStudent.fullName, studentNumber: reportingStudent.studentNumber } });
    }
    const anotherStudent = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase(), 'ACTIVE', false);
    const foreignRoster = await fetch(baseUrl + `/enrollments/${anotherStudent.enrollmentId}/roster-status`, {
      headers: { authorization: `Bearer ${token}` } });
    assert.equal(foreignRoster.status, 404); await foreignRoster.arrayBuffer();
    assert.equal((await request(ownRosterPath, token)).status, 'MATCHED');
    console.log(JSON.stringify({ check: 'STUDENT_ROSTER_EMAIL_CONFLICT_EXTRA_TEACHER_PARITY_OTHER_STUDENT_DENIED', result: 'PASS', identityChanges: 'database-fixtures' }));
    console.log(JSON.stringify({ check: 'COMPOSITE_ROSTER_REAL_REVIEW_RECOGNITION_REVOKE_CORRECTION_ACCOUNTING', result: 'PASS' }));
    console.log(JSON.stringify({ check: 'CERTIFICATION_UPLOAD_SUBMIT_APPROVE_REVOKE', result: 'PASS' }));
    console.log(JSON.stringify({ check: 'STUDENT_PROGRESS_RECOGNITION_APPROVE_REVOKE', result: 'PASS' }));
    if (process.env.V81_FINAL_GRADE_CORRECTION === '1') {
      const { probeFinalGradeCorrection } = await import('./v81-final-grade-correction-probe.mjs');
      await probeFinalGradeCorrection({ prisma, fixture, request, baseUrl, student, teacherToken, adminToken, token, otherTeacherTokens });
    }
    if (process.env.V81_ARCHIVED_RECORD_CORRECTION === '1') {
      const [database] = await prisma.$queryRaw`SELECT current_database() AS name`;
      assert.equal(database.name, 'v81_runtime_test');
      assert.ok(originalSettlement);
      // Archived-state fixture only; actual semester switching has a separate HTTP suite.
      await prisma.semester.update({ where: { id: fixture.semesterId }, data: { status: 'ARCHIVED' } });
      const before = await prisma.$queryRaw`SELECT version,report::text AS report,report_sha256 FROM v81_settlement_report_revisions
        WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid ORDER BY version`;
      const workflow = await request(`/exercise-records/${draft.id}/workflow`, teacherToken);
      const body = { action: 'INVALID', reasonCode: 'INCONSISTENT_EVIDENCE', expectedVersion: workflow.version,
        correctionReason: 'Synthetic archived fact correction' }, key = randomUUID();
      const corrected = await request(`/exercise-records/${draft.id}/corrections`, teacherToken, body, key);
      assert.deepEqual(await request(`/exercise-records/${draft.id}/corrections`, teacherToken, body, key), corrected);
      const after = await prisma.$queryRaw`SELECT version,report::text AS report,report_sha256 FROM v81_settlement_report_revisions
        WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid ORDER BY version`;
      assert.equal(after.length, before.length + 1); assert.deepEqual(after.slice(0, -1), before);
      const ordinary = await fetch(baseUrl + `/exercise-records/${draft.id}/v81-reviews`, { method: 'POST',
        headers: { authorization: `Bearer ${teacherToken}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
        body: JSON.stringify({ action: 'INVALID', reasonCode: 'INCONSISTENT_EVIDENCE', expectedVersion: corrected.version }) });
      assert.equal(ordinary.status, 409);
      console.log(JSON.stringify({ check: 'ARCHIVED_RECORD_CORRECTION_APPENDS_REPORT_REPLAY_PRESERVES_HISTORY_ORDINARY_REVIEW_DENIED', result: 'PASS', fixture: 'archived state prepared only in isolated database' }));
    }
  } finally { await prisma.$disconnect(); }
}
