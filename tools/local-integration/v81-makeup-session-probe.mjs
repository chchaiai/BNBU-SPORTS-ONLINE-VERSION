import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import { setTimeout as delay } from 'node:timers/promises';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';
const sharp = createRequire(new URL('../../backend/package.json', import.meta.url))('sharp');

export async function probeMakeupSession({ prisma, fixture, request, baseUrl, teacherToken, adminToken, processMedia, otherTeacherTokens = [], readMailboxJson = async url => (await fetch(url)).json() }) {
  const student = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const template = await request('/rule-templates', adminToken, { displayName: 'Synthetic expired regular period template', expectedVersion: 0 });
  await request('/admin/review-services/manual-mode', adminToken, {classSectionId:fixture.teacherAActiveSectionId,
    enabled:true,reason:'Synthetic manual makeup verification',expectedVersion:0});
  const now = new Date(), regular = new Date(now.getTime() - 3600000), closing = new Date(regular.getTime() + 7 * 86400000);
  // A real Web publication stores this same regular deadline in the legacy projection.
  await prisma.classSection.update({where:{id:fixture.teacherAActiveSectionId},data:{submissionDeadlineAt:regular}});
  // The schedule is a synthetic server fixture; authorization, sign-in, start and revocation use HTTP.
  await prisma.$executeRaw`INSERT INTO v81_course_rules(class_section_id,organization_id,minimum_minutes,weekly_limit,course_target,general_target,
    regular_deadline,closing_deadline,settlement_planned_at,published_at,version,template_id)
    VALUES(${fixture.teacherAActiveSectionId}::uuid,${fixture.organizationId}::uuid,30,3,600,600,${regular},${closing},${closing},${now},1,${template.id}::uuid)`;
  const organization = await prisma.organization.findUniqueOrThrow({ where: { id: fixture.organizationId } });
  const challenge = await request('/auth/student-sign-in-codes', null, { organizationCode: organization.organizationCode,
    account: student.email, channel: 'EMAIL', locale: 'en' });
  let code;
  for (let i = 0; i < 30 && !code; i++) {
    const messages = await readMailboxJson('http://mailpit:8025/api/v1/messages?limit=50');
    const message = messages.messages?.find(item => JSON.stringify(item.To ?? []).toLowerCase().includes(student.email));
    if (message) {
      const detail = await readMailboxJson(`http://mailpit:8025/api/v1/message/${encodeURIComponent(message.ID)}`);
      code = String(detail.Text ?? '').match(/(?:code is|验证码是)\s*(\d{4,10})/u)?.[1];
    }
    if (!code) await delay(500);
  }
  assert.ok(code, 'Synthetic student email code must arrive in local Mailpit');
  const login = await request('/auth/student-sign-in-codes/verify', null, { challengeId: challenge.challengeId, code, deviceId: randomUUID() });
  const body = { enrollmentId: student.enrollmentId, clientObservedAt: new Date(now.getTime() - 7 * 86400000).toISOString() };
  const start = (key = randomUUID()) => fetch(baseUrl + '/exercise-sessions', { method: 'POST',
    headers: { authorization: `Bearer ${login.accessToken}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
  const denied = await start(); assert.equal(denied.status, 409);
  assert.equal((await denied.json()).code, 'SESSION_OUTSIDE_TIME_WINDOW');
  const grant = await request(`/class-sections/${fixture.teacherAActiveSectionId}/makeup-windows`, teacherToken, {
    enrollmentId: student.enrollmentId, expectedRuleVersion: 1,
    startsAt: new Date(now.getTime() - 1800000).toISOString(), endsAt: new Date(now.getTime() + 3600000).toISOString() });
  const key = randomUUID(), response = await start(key); assert.equal(response.status, 201);
  const session = (await response.json()).data;
  assert.equal(session.status, 'IN_PROGRESS');
  assert.deepEqual((await (await start(key)).json()).data, session);
  const stored = await prisma.exerciseSession.findUniqueOrThrow({ where: { id: session.id } });
  assert.ok(stored.startedAt >= new Date(grant.acceptedAt));
  const parts = new Map(new Intl.DateTimeFormat('en-US', { timeZone: organization.timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(stored.startedAt).map(p => [p.type, p.value]));
  assert.equal(stored.businessDate.toISOString().slice(0, 10), `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`);
  assert.notEqual(stored.businessDate.toISOString().slice(0, 10), body.clientObservedAt.slice(0, 10));
  const links = await prisma.$queryRaw`SELECT window_id FROM v81_makeup_session_sources WHERE session_id=${session.id}::uuid`;
  assert.deepEqual(links, [{ window_id: grant.id }]);
  await request(`/makeup-windows/${grant.id}/revocation`, teacherToken, { expectedVersion: 1, reason: 'Synthetic revoke new starts only' });
  assert.equal((await request(`/exercise-sessions/${session.id}`, login.accessToken)).status, 'IN_PROGRESS');
  const invalidCancel = await fetch(baseUrl + `/exercise-sessions/${session.id}/cancel`, { method: 'POST',
    headers: { authorization: `Bearer ${login.accessToken}`, 'content-type': 'application/json', 'idempotency-key': randomUUID() },
    body: JSON.stringify({ expectedVersion: 1, reason: 'Synthetic validation finished', clientObservedAt: new Date().toISOString() }) });
  assert.equal(invalidCancel.status, 422);
  assert.equal((await request(`/exercise-sessions/${session.id}`, login.accessToken)).status, 'IN_PROGRESS');
  const finishKey = randomUUID(), finishBody = { expectedVersion: 1, clientObservedAt: '2099-01-01T00:00:00.000Z' };
  const finished = await request(`/exercise-sessions/${session.id}/finish`, login.accessToken, finishBody, finishKey);
  assert.equal(finished.status, 'COMPLETED');assert.equal(finished.version, 2);
  assert.ok(finished.actualDurationSeconds >= 0 && finished.actualDurationSeconds < 60);
  assert.deepEqual(await request(`/exercise-sessions/${session.id}/finish`, login.accessToken, finishBody, finishKey), finished);
  const draftKey = randomUUID(), draftBody = { sessionId: session.id, creditType: 'GENERAL', sportType: 'RUNNING',
    description: 'Synthetic granted session completed after revocation', clientRequestId: randomUUID() };
  const draft = await request('/exercise-records', login.accessToken, draftBody, draftKey);
  assert.equal(draft.sessionId, session.id);assert.equal(draft.creditedDurationSeconds, 0);
  assert.deepEqual(await request('/exercise-records', login.accessToken, draftBody, draftKey), draft);
  assert.equal((await request(`/exercise-records/${draft.id}`, login.accessToken)).id, draft.id);
  for (const { token } of otherTeacherTokens) {
    const deniedRead = await fetch(baseUrl + `/exercise-records/${draft.id}`, { headers: { authorization: `Bearer ${token}` } });
    assert.equal(deniedRead.status, 404);
  }
  assert.equal(await prisma.exerciseRecord.count({ where: { sessionId: session.id } }), 1);
  assert.equal(await prisma.exerciseSessionSegment.count({ where: { exerciseSessionId: session.id, endedAt: null } }), 0);
  const bytes = await sharp({create:{width:2,height:3,channels:3,background:'#237fa8'}}).png().toBuffer();
  const digest = createHash('sha256').update(bytes).digest('hex');
  const upload = await request('/media-uploads', login.accessToken, {sessionId:session.id,businessPurpose:'EXERCISE_RECORD',
    mediaType:'IMAGE',mimeType:'image/png',fileSizeBytes:bytes.length,captureSource:'IN_APP_CAMERA',declaredContentSha256:digest});
  const put = await fetch(upload.uploadUrl,{method:upload.uploadMethod,headers:upload.requiredHeaders,body:bytes});
  assert.ok(put.ok);const etag=put.headers.get('etag')?.replaceAll('"','');assert.ok(etag);
  const privateUrl=new URL(upload.uploadUrl);privateUrl.search='';
  assert.equal((await fetch(privateUrl)).status,403);
  const confirmed=await request(`/media-uploads/${upload.uploadSessionId}/confirm`,login.accessToken,{etag});
  await request(`/media/${upload.mediaId}/bind`,login.accessToken,{sessionId:session.id,expectedVersion:confirmed.version});
  assert.equal(await processMedia(),true);
  const available=await request(`/media/${upload.mediaId}`,login.accessToken);
  assert.equal(available.uploadStatus,'AVAILABLE');assert.equal(available.verifiedContentSha256,digest);
  const submitBody={mediaIds:[upload.mediaId],expectedVersion:draft.version},submitKey=randomUUID();
  const submitted=await request(`/exercise-records/${draft.id}/submit`,login.accessToken,submitBody,submitKey);
  assert.equal(submitted.workflowStage,'PENDING_TEACHER');
  assert.deepEqual(await request(`/exercise-records/${draft.id}/submit`,login.accessToken,submitBody,submitKey),submitted);
  const reviewBody={action:'VALID',expectedVersion:submitted.workflowVersion},reviewKey=randomUUID();
  const reviewed=await request(`/exercise-records/${draft.id}/v81-reviews`,teacherToken,reviewBody,reviewKey);
  assert.equal(reviewed.stage,'VALID');
  assert.deepEqual(await request(`/exercise-records/${draft.id}/v81-reviews`,teacherToken,reviewBody,reviewKey),reviewed);
  const own=await request(`/exercise-records/${draft.id}`,login.accessToken);
  assert.equal(own.workflowStage,'VALID');assert.equal(own.creditedDurationSeconds,0);
  const after = await start(); assert.equal(after.status, 409); assert.equal((await after.json()).code, 'SESSION_OUTSIDE_TIME_WINDOW');
  assert.equal((await prisma.$queryRaw`SELECT session_id FROM v81_makeup_session_sources WHERE window_id=${grant.id}::uuid`).length, 1);
  console.log(JSON.stringify({ check: 'MAKEUP_REVOKED_SESSION_MINIO_UPLOAD_SUBMIT_MANUAL_REVIEW_REPLAY', result: 'PASS', scheduleSeeded: true, syntheticImage: true, shortSessionNoCredit: true }));
}
