import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeOcrPhysicalHttp({ prisma, fixture, member, baseUrl, request, teacherToken, adminToken, otherTeacherTokens, password }) {
  const batch = (await prisma.$queryRaw`SELECT * FROM v81_ocr_batches WHERE organization_id=${fixture.organizationId}::uuid AND purpose='PHYSICAL'`)[0];
  const student = await prisma.studentProfile.findUniqueOrThrow({ where: { id: member.studentId } });
  const page = batch.source_manifest[0], rowId = randomUUID(), pendingId = randomUUID(), runType = student.gender === 'MALE' ? '1000m' : '800m';
  const selection = [{ pageId: page.id, attempt: 1, tableIndex: 0, headerRow: 0,
    columns: { studentNumber: 0, name: 1, runType: 2, elapsed: 3, testedOn: 4 } }];
  const row = { id: rowId, source: { pageId: page.id, attempt: 1, tableIndex: 0, sourceRow: 1, evidence: {} },
    values: { studentNumber: student.studentNumber, name: student.fullName, runType, elapsed: '4:30', testedOn: '2026-09-08' },
    ocrIssues: [], reviewedAgainstSource: false };
  const pending = { ...row, id: pendingId, source: { ...row.source, sourceRow: 2 }, values: { ...row.values, studentNumber: 'UNMATCHED-SYNTHETIC' } };
  await prisma.$executeRaw`INSERT INTO v81_ocr_draft_revisions(batch_id,version,selections,draft_rows,actor_id,request_id,created_at)
    VALUES(${batch.id}::uuid,1,${JSON.stringify(selection)}::jsonb,${JSON.stringify([row, pending])}::jsonb,
      ${fixture.teacherUserId}::uuid,${randomUUID()},${new Date()})`;
  const path = `/ocr-batches/${batch.id}/physical-confirmations`, draftPath = `/ocr-batches/${batch.id}/draft`;
  const post = (body, token = teacherToken, key = randomUUID(), route = path) => fetch(baseUrl + route, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
  const body = { expectedDraftVersion: 1, selections: [{ rowId, expectedResultVersion: 0 }] };
  const login = await request('/auth/password-login', null, { account: member.email, password });
  const studentPath = `/student/enrollments/${member.enrollmentId}/physical-result`;
  assert.equal((await request(studentPath, login.accessToken)).status, 'NOT_RECORDED');
  for (const [token, status] of [[adminToken, 403], [login.accessToken, 403], ...otherTeacherTokens.map(({ token }) => [token, 404])]) {
    assert.equal((await post(body, token)).status, status);
    assert.equal((await fetch(baseUrl + path, { headers: { authorization: `Bearer ${token}` } })).status, status);
  }
  const first = await request(path, teacherToken);
  assert.equal(first.pendingCount, 2); assert.ok(first.rows[0].issues.includes('SOURCE_REVIEW_REQUIRED'));
  assert.equal((await post(body)).status, 422);
  const revised = await request(draftPath + '/revisions', teacherToken, { expectedVersion: 1,
    rows: [{ id: rowId, values: row.values, reviewedAgainstSource: true }] });
  assert.equal(revised.version, 2);
  assert.equal((await post(body)).status, 409);
  const readyBody = { ...body, expectedDraftVersion: 2 };
  assert.equal((await post({ ...readyBody, selections: [...readyBody.selections, { rowId: pendingId, expectedResultVersion: 0 }] })).status, 422);
  assert.equal((await request(studentPath, login.accessToken)).status, 'NOT_RECORDED');
  assert.equal((await post({ ...readyBody, selections: [{ rowId, expectedResultVersion: 9 }] })).status, 409);
  const key = randomUUID(), confirmedResponse = await post(readyBody, teacherToken, key);
  assert.equal(confirmedResponse.status, 201);
  const confirmed = (await confirmedResponse.json()).data;
  assert.equal(confirmed.pendingCount, 1); assert.equal(confirmed.rows.find(r => r.rowId === rowId).confirmed, true);
  assert.equal(confirmed.rows.find(r => r.rowId === pendingId).confirmed, false);
  assert.deepEqual((await (await post(readyBody, teacherToken, key)).json()).data, confirmed);
  assert.equal((await post(readyBody)).status, 409);
  const formal = await request(studentPath, login.accessToken);
  assert.deepEqual(formal, { status: 'RECORDED', result: { version: 1, runType, elapsedSeconds: 270, testedOn: '2026-09-08' } });
  assert.equal((await post({ expectedVersion: 2, rows: [{ id: rowId, values: row.values, reviewedAgainstSource: true }] }, teacherToken, randomUUID(), draftPath + '/revisions')).status, 409);
  const links = await prisma.$queryRaw`SELECT draft_version,result_version FROM v81_ocr_physical_confirmations WHERE batch_id=${batch.id}::uuid`;
  assert.deepEqual(links, [{ draft_version: 2, result_version: 1 }]);
  assert.equal(await prisma.notification.count({ where: { recipientUserId: member.userId, notificationType: 'RAW_ENDURANCE_RESULT' } }), 1);
  console.log(JSON.stringify({ check: 'OCR_PHYSICAL_HTTP_REVIEW_SCOPE_ATOMIC_REJECTION_RESULT_VERSION_REPLAY_SOURCE_LINK_STUDENT_RESULT_PENDING_ROW', result: 'PASS', draftSeeded: true, providerSimulated: true }));
}
