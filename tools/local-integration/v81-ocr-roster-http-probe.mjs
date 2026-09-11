import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';

export async function probeOcrRosterHttp({ baseUrl, request, prisma, fixture, teacherToken, adminToken, otherTeacherTokens, batchId }) {
  const path = `/ocr-batches/${batchId}/roster-confirmation`, input = { expectedDraftVersion: 2 };
  const post = (body = input, token = teacherToken, key = randomUUID(), route = path) => fetch(baseUrl + route, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
  const beforeDraft = await request(`/ocr-batches/${batchId}/draft`, teacherToken);
  const settlementPath = `/class-sections/${fixture.teacherAActiveSectionId}/settlement-check`;
  const settlementBefore = await request(settlementPath, teacherToken);
  assert.deepEqual(settlementBefore.checks.find(c => c.code === 'OCR_DRAFTS'), { code: 'OCR_DRAFTS', status: 'BLOCKED', count: 2 });
  const adminRosterPath = `/admin/class-sections/${fixture.teacherAActiveSectionId}/roster-summary`;
  const adminPhysicalPath = `/admin/class-sections/${fixture.teacherAActiveSectionId}/physical-summary`;
  assert.equal((await request(adminRosterPath, adminToken)).available, false);
  assert.equal((await request(adminPhysicalPath, adminToken)).available, false);
  assert.equal((await fetch(baseUrl + path, { headers: { authorization: `Bearer ${teacherToken}` } })).status, 404);
  for (const [token, status] of [[adminToken, 403], ...otherTeacherTokens.map(({ token }) => [token, 404])]) {
    assert.equal((await post(input, token)).status, status);
    assert.equal((await fetch(baseUrl + path, { headers: { authorization: `Bearer ${token}` } })).status, status);
  }
  assert.equal((await post({ expectedDraftVersion: 1 })).status, 409);
  assert.equal((await post({ ...input, sourceRows: [] })).status, 422);
  const beforeMembers = await prisma.enrollment.count({ where: { classSectionId: fixture.teacherAActiveSectionId } });
  const keys = [randomUUID(), randomUUID()];
  const responses = await Promise.all(keys.map(key => post(input, teacherToken, key)));
  assert.deepEqual(responses.map(response => response.status).sort(), [201, 409]);
  const winner = responses.findIndex(response => response.status === 201), confirmed = (await responses[winner].json()).data;
  assert.equal(confirmed.batchId, batchId); assert.equal(confirmed.draftVersion, 2); assert.equal(confirmed.version, 1);
  assert.equal(confirmed.sourceRows.length, 1); assert.equal(confirmed.sourceRows[0].studentNumber, '000123');
  assert.deepEqual(confirmed.sourceRows[0].ocrSource, beforeDraft.rows[0].source);
  assert.deepEqual(confirmed.sourceRows[0].ocrIssues, beforeDraft.rows[0].ocrIssues);
  assert.equal(confirmed.sourceRows[0].rawFullName, beforeDraft.rows[0].values.name);
  assert.deepEqual((await (await post(input, teacherToken, keys[winner])).json()).data, confirmed);
  assert.deepEqual(await request(path, teacherToken), confirmed);
  const current = await prisma.$queryRaw`SELECT id FROM v81_current_confirmed_rosters WHERE class_section_id=${fixture.teacherAActiveSectionId}::uuid`;
  assert.deepEqual(current, [{ id: confirmed.id }]);
  assert.equal(await prisma.enrollment.count({ where: { classSectionId: fixture.teacherAActiveSectionId } }), beforeMembers);
  assert.equal((await post({ expectedVersion: 2, rows: [{ id: beforeDraft.rows[0].id, values: beforeDraft.rows[0].values,
    reviewedAgainstSource: true }] }, teacherToken, randomUUID(), `/ocr-batches/${batchId}/draft/revisions`)).status, 409);
  const events = await prisma.$queryRaw`SELECT id FROM v81_events WHERE resource_type='ROSTER_CONFIRMATION' AND resource_id=${confirmed.id}::uuid`;
  assert.equal(events.length, 1);
  const settlementAfter = await request(settlementPath, teacherToken);
  assert.deepEqual(settlementAfter.checks.find(c => c.code === 'OCR_DRAFTS'), { code: 'OCR_DRAFTS', status: 'BLOCKED', count: 1 });
  assert.equal(settlementAfter.checks.find(c => c.code === 'CURRENT_ROSTER').status, 'CLEAR');
  assert.equal(settlementAfter.checks.find(c => c.code === 'CONFIRMED_OFFICIAL_ROSTER').status, 'CLEAR');
  assert.deepEqual(settlementAfter.checks.find(c => c.code === 'ROSTER_PENDING_DIFFERENCE'), { code: 'ROSTER_PENDING_DIFFERENCE', status: 'CLEAR', count: 0 });
  assert.deepEqual(settlementAfter.checks.find(c => c.code === 'ROSTER_REGISTRATION_INCOMPLETE'), { code: 'ROSTER_REGISTRATION_INCOMPLETE', status: 'UNAVAILABLE', count: 1 });
  assert.equal(settlementAfter.ready, false);
  console.log(JSON.stringify({ check: 'OCR_SETTLEMENT_PENDING_BATCHES_UNIFIED_SOURCE_UNRESOLVED_REGISTRATION_STILL_BLOCKED', result: 'PASS' }));
  const rosterSummary = await request(adminRosterPath, adminToken);
  assert.equal(rosterSummary.available, true); assert.equal(rosterSummary.rosterVersion, confirmed.version);
  assert.equal(rosterSummary.denominator, 1); assert.equal(rosterSummary.pendingRegistrationCount, 1);
  assert.equal(rosterSummary.matchedCount, 0); assert.equal(rosterSummary.registrationComplete, false);
  const physicalSummary = await request(adminPhysicalPath, adminToken);
  assert.equal(physicalSummary.available, true); assert.equal(physicalSummary.sourceRowCount, 1);
  assert.equal(physicalSummary.unresolvedRegistrationCount, 1); assert.equal(physicalSummary.recordedCount, 0);
  for (const summary of [rosterSummary, physicalSummary]) {
    assert.equal(JSON.stringify(summary).includes('000123'), false);
    assert.equal(JSON.stringify(summary).includes(batchId), false);
    assert.equal(JSON.stringify(summary).includes(beforeDraft.rows[0].values.name), false);
  }
  console.log(JSON.stringify({ check: 'OCR_CONFIRMED_ROSTER_ADMIN_SUMMARIES_USE_UNIFIED_BASIS_NO_PERSONAL_SOURCE_DATA', result: 'PASS' }));
  console.log(JSON.stringify({ check: 'OCR_ROSTER_HTTP_CONFIRM_CONCURRENT_SINGLE_SNAPSHOT_BASIS_REPLAY_SCOPE_HISTORY_NO_ENROLLMENT', result: 'PASS', providerSimulated: true }));
  if (process.env.V81_OCR_ROSTER_SWITCH === '1') {
    const { probeOcrRosterSwitch } = await import('./v81-ocr-roster-switch-probe.mjs');
    await probeOcrRosterSwitch({ prisma, fixture, request, baseUrl, teacherToken, adminToken, confirmed });
  }
  if (process.env.V81_OCR_ROSTER_MEMBER === '1') {
    const { probeOcrRosterMember } = await import('./v81-ocr-roster-member-probe.mjs');
    await probeOcrRosterMember({ prisma, fixture, request, baseUrl, teacherToken, adminToken, confirmed });
  }
}
