import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeOcrDraftApi({ baseUrl, request, prisma, fixture, teacherToken, adminToken, otherTeacherTokens, batchId, pageId }) {
  const path = `/ocr-batches/${batchId}/draft`;
  const post = (route, body, key = randomUUID(), token = teacherToken) => fetch(baseUrl + route, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
  const selection = { pageId, attempt: 2, tableIndex: 0, headerRow: 0, columns: { studentNumber: 0, name: 1 } };
  const input = { expectedVersion: 0, selections: [selection] };
  assert.equal((await fetch(baseUrl + path, { headers: { authorization: `Bearer ${teacherToken}` } })).status, 404);
  for (const [token, status] of [[adminToken, 403], ...otherTeacherTokens.map(({ token }) => [token, 404])]) {
    assert.equal((await post(path, input, randomUUID(), token)).status, status);
    assert.equal((await fetch(baseUrl + path, { headers: { authorization: `Bearer ${token}` } })).status, status);
  }
  for (const [body, status] of [
    [{ ...input, selections: [{ ...selection, attempt: 1 }] }, 409],
    [{ ...input, selections: [selection, selection] }, 422],
    [{ ...input, selections: [{ ...selection, pageId: randomUUID() }] }, 422],
    [{ ...input, selections: [{ ...selection, headerRow: 100 }] }, 422],
    [{ ...input, selections: [{ ...selection, columns: { studentNumber: 0, name: 0 } }] }, 422],
    [{ ...input, selections: [{ ...selection, columns: null }] }, 422],
    [{ ...input, isFormal: true }, 422],
  ]) assert.equal((await post(path, body)).status, status);
  const key = randomUUID(), createdResponse = await post(path, input, key);
  assert.equal(createdResponse.status, 201);
  const first = (await createdResponse.json()).data;
  assert.equal(first.version, 1); assert.equal(first.isFormal, false); assert.equal(first.pendingReviewCount, 1);
  assert.equal(first.rows.length, 1); assert.equal(first.rows[0].values.studentNumber, '000123');
  assert.equal(first.rows[0].values.name, 'Synthetic OCR name');
  assert.deepEqual(first.rows[0].source.evidence, { studentNumber: [0], name: [3] });
  assert.deepEqual((await (await post(path, input, key)).json()).data, first);
  assert.deepEqual(await request(path, teacherToken), first);
  assert.equal((await post(path, input)).status, 409);
  const edit = { id: first.rows[0].id, values: { studentNumber: '000123', name: 'Teacher reviewed name' }, reviewedAgainstSource: true };
  for (const row of [{ ...edit, source: first.rows[0].source }, { ...edit, id: randomUUID() },
    { ...edit, values: { ...edit.values, runType: '800M' } }, { ...edit, reviewedAgainstSource: 'true' }]) {
    assert.equal((await post(path + '/revisions', { expectedVersion: 1, rows: [row] })).status, 422);
  }
  const keys = [randomUUID(), randomUUID()];
  const inputs = [edit, { ...edit, values: { ...edit.values, name: 'Other simultaneous edit' } }].map(row => ({ expectedVersion: 1, rows: [row] }));
  const competing = await Promise.all(inputs.map((body, i) => post(path + '/revisions', body, keys[i])));
  assert.deepEqual(competing.map(response => response.status).sort(), [201, 409]);
  const winner = competing.findIndex(response => response.status === 201), second = (await competing[winner].json()).data;
  assert.equal(second.version, 2); assert.equal(second.pendingReviewCount, 0); assert.equal(second.isFormal, false);
  assert.deepEqual(second.rows[0].source, first.rows[0].source); assert.deepEqual(second.rows[0].ocrIssues, first.rows[0].ocrIssues);
  assert.deepEqual(await request(path, teacherToken), second);
  assert.deepEqual(await request(path + '?version=1', teacherToken), first);
  assert.deepEqual((await (await post(path + '/revisions', inputs[winner], keys[winner])).json()).data, second);
  assert.equal((await fetch(baseUrl + path + '?version=0', { headers: { authorization: `Bearer ${teacherToken}` } })).status, 422);
  const revisions = await prisma.$queryRaw`SELECT version FROM v81_ocr_draft_revisions WHERE batch_id=${batchId}::uuid ORDER BY version`;
  assert.deepEqual(revisions.map(row => row.version), [1, 2]);
  const audit = await prisma.$queryRaw`SELECT event_type,version FROM v81_events WHERE organization_id=${fixture.organizationId}::uuid
    AND resource_type='OCR_DRAFT' AND resource_id=${batchId}::uuid ORDER BY version`;
  assert.deepEqual(audit, [{ event_type: 'CREATED', version: 1 }, { event_type: 'REVISED', version: 2 }]);
  console.log(JSON.stringify({ check: 'OCR_DRAFT_HTTP_MAPPING_SCOPE_VALIDATION_REPLAY_CONCURRENT_REVISION_HISTORY_SOURCE_RETAINED', result: 'PASS', providerSimulated: true, formalConfirmation: false }));
}
