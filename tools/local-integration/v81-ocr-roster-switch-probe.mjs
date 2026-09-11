import assert from 'node:assert/strict';
import { randomUUID, createHash } from 'node:crypto';

export async function probeOcrRosterSwitch({ prisma, fixture, request, baseUrl, teacherToken, adminToken, otherTeacherToken, confirmed }) {
  const section = fixture.teacherAActiveSectionId;
  const summaryPath = `/admin/class-sections/${section}/roster-summary`;
  const current = () => prisma.$queryRaw`SELECT id,version,roster_import_id,ocr_batch_id FROM v81_current_confirmed_rosters WHERE class_section_id=${section}::uuid`;
  const importCsv = async number => {
    const bytes = Buffer.from(`student_number,full_name\n${number},Synthetic Electronic Name\n`, 'utf8');
    const form = new FormData();
    form.append('source', 'FILE'); form.append('fileFormat', 'CSV');
    form.append('fieldMappingSnapshot', JSON.stringify({ studentNumber: 'student_number', fullName: 'full_name' }));
    form.append('file', new Blob([bytes], { type: 'text/csv' }), 'synthetic-switch.csv');
    const response = await fetch(baseUrl + `/class-sections/${section}/roster-imports`, {
      method: 'POST', headers: { authorization: `Bearer ${teacherToken}`, 'idempotency-key': randomUUID() }, body: form });
    assert.equal(response.status, 201);
    const imported = (await response.json()).data;
    assert.equal(imported.status, 'VALIDATED');
    const previewPath = `/roster-imports/${imported.id}/registration-preview`;
    const preview = await request(previewPath, teacherToken);
    assert.equal(preview.classSectionId, section);
    assert.equal(preview.rosterImportId, imported.id);
    assert.equal(preview.sourceVersion, imported.version);
    assert.equal(preview.sourceRowCount, 1);
    assert.equal(preview.denominator, 1);
    assert.equal(preview.matchedCount, 0);
    assert.equal(preview.unresolvedRowCount, 1);
    assert.equal(preview.registrationComplete, false);
    assert.deepEqual(preview.extras, []);
    assert.equal(preview.rows[0].studentNumber, number);
    assert.equal(preview.rows[0].status, 'PENDING_REGISTRATION');
    assert.equal(preview.rows[0].studentId, null);
    assert.equal(preview.rows[0].enrollmentId, null);
    assert.equal(await prisma.enrollment.count({ where: { classSectionId: section } }), 0);
    assert.equal((await fetch(baseUrl + previewPath, { headers: { authorization: `Bearer ${adminToken}` } })).status, 403);
    if (otherTeacherToken) assert.equal((await fetch(baseUrl + previewPath,
      { headers: { authorization: `Bearer ${otherTeacherToken}` } })).status, 404);

    const source = await request(`/roster-imports/${imported.id}/source`, teacherToken);
    assert.equal(source.sourceSha256, createHash('sha256').update(bytes).digest('hex'));
    assert.ok(Buffer.from(source.fileBase64, 'base64').equals(bytes));
    return imported;
  };
  const first = await importCsv('000456');
  assert.deepEqual(await current(), []);
  assert.equal((await request(summaryPath, adminToken)).available, false);
  assert.deepEqual(await request(`/ocr-batches/${confirmed.batchId}/roster-confirmation`, teacherToken), confirmed);
  const firstSnapshot = await request(`/roster-imports/${first.id}/confirmation`, teacherToken, { expectedVersion: first.version });
  assert.equal(firstSnapshot.version, 2); assert.equal(firstSnapshot.sourceRows[0].studentNumber, '000456');
  assert.equal((await current())[0].id, firstSnapshot.id);
  assert.equal((await request(summaryPath, adminToken)).rosterVersion, 2);
  const second = await importCsv('000789');
  assert.deepEqual(await current(), []);
  const secondSnapshot = await request(`/roster-imports/${second.id}/confirmation`, teacherToken, { expectedVersion: second.version });
  assert.equal(secondSnapshot.version, 3); assert.equal((await current())[0].id, secondSnapshot.id);
  await request(`/roster-imports/${first.id}/rollback`, teacherToken, { expectedCurrentRosterImportId: second.id,
    expectedVersion: second.version, reason: 'Synthetic electronic baseline rollback after OCR' });
  const restored = await current();
  assert.equal(restored.length, 1); assert.equal(restored[0].id, firstSnapshot.id);
  assert.equal(restored[0].version, 2); assert.equal(restored[0].ocr_batch_id, null);
  assert.deepEqual(await request(`/ocr-batches/${confirmed.batchId}/roster-confirmation`, teacherToken), confirmed);
  assert.deepEqual(await request(`/roster-imports/${second.id}/confirmation`, teacherToken), secondSnapshot);
  const history = await prisma.$queryRaw`SELECT version,roster_import_id,ocr_batch_id FROM v81_roster_basis_history WHERE class_section_id=${section}::uuid ORDER BY version`;
  assert.deepEqual(history, [
    { version: 1, roster_import_id: null, ocr_batch_id: confirmed.batchId },
    { version: 2, roster_import_id: first.id, ocr_batch_id: null },
    { version: 3, roster_import_id: second.id, ocr_batch_id: null },
    { version: 4, roster_import_id: first.id, ocr_batch_id: null },
  ]);
  assert.equal(await prisma.enrollment.count({ where: { classSectionId: section } }), 0);
  const basisPath = `/class-sections/${section}/roster-basis`;
  assert.equal((await request(basisPath, teacherToken)).version, 4);
  const selection = { confirmedRosterId: confirmed.id, expectedVersion: 4, reason: 'Synthetic restore original paper roster' };
  const post = (body, key = randomUUID(), token = teacherToken) => fetch(baseUrl + basisPath, {
    method: 'POST', headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json', 'idempotency-key': key }, body: JSON.stringify(body) });
  assert.equal((await post(selection, randomUUID(), adminToken)).status, 403);
  assert.equal((await post({ ...selection, reason: ' ' })).status, 422);
  assert.equal((await post({ ...selection, confirmedRosterId: randomUUID() })).status, 404);
  assert.equal((await post({ ...selection, expectedVersion: 3 })).status, 409);
  const keys = [randomUUID(), randomUUID()], competing = await Promise.all(keys.map(key => post(selection, key)));
  assert.deepEqual(competing.map(response => response.status).sort(), [201, 409]);
  const winner = competing.findIndex(response => response.status === 201), selectedOcr = (await competing[winner].json()).data;
  assert.equal(selectedOcr.version, 5); assert.equal(selectedOcr.rosterVersion, 1); assert.equal(selectedOcr.sourceKind, 'OCR');
  assert.equal(selectedOcr.confirmedRosterId, confirmed.id);
  assert.deepEqual((await (await post(selection, keys[winner])).json()).data, selectedOcr);
  assert.deepEqual(await request(basisPath, teacherToken), selectedOcr);
  const selectedElectronic = await request(basisPath, teacherToken, { confirmedRosterId: firstSnapshot.id, expectedVersion: 5, reason: 'Synthetic return to electronic current source' });
  assert.equal(selectedElectronic.version, 6); assert.equal(selectedElectronic.rosterVersion, 2);
  const selectedOlderElectronic = await request(basisPath, teacherToken, { confirmedRosterId: secondSnapshot.id, expectedVersion: 6, reason: 'Synthetic select inactive electronic source' });
  assert.equal(selectedOlderElectronic.version, 7); assert.equal(selectedOlderElectronic.rosterVersion, 3);
  assert.equal((await current())[0].id, secondSnapshot.id);
  const finalHistory = await prisma.$queryRaw`SELECT version FROM v81_roster_basis_history WHERE class_section_id=${section}::uuid ORDER BY version`;
  assert.deepEqual(finalHistory.map(row => row.version), [1, 2, 3, 4, 5, 6, 7]);
  const selectionEvents = await prisma.$queryRaw`SELECT version,facts FROM v81_events WHERE resource_type='ROSTER_BASIS' AND resource_id=${section}::uuid ORDER BY version`;
  assert.deepEqual(selectionEvents.map(row => row.version), [5, 6, 7]);
  assert.equal(selectionEvents[0].facts.reason, selection.reason);
  const snapshotPath = basisPath + '/snapshots';
  const snapshotFirst = await request(snapshotPath + '?limit=2', teacherToken);
  assert.deepEqual(snapshotFirst.items.map(row => row.version), [3, 2]); assert.equal(snapshotFirst.nextBeforeVersion, 2);
  assert.deepEqual(snapshotFirst.items.map(row => row.selected), [true, false]);
  const snapshotNext = await request(snapshotPath + '?limit=2&beforeVersion=2', teacherToken);
  assert.deepEqual(snapshotNext.items.map(row => row.version), [1]); assert.equal(snapshotNext.nextBeforeVersion, null);
  assert.equal(snapshotNext.items[0].sourceKind, 'OCR'); assert.equal(snapshotNext.items[0].ocrBatchId, confirmed.batchId);
  assert.equal(snapshotNext.items[0].sourceRowCount, 1); assert.equal(snapshotNext.items[0].selected, false);
  assert.deepEqual((await request(snapshotPath + '?beforeVersion=1', teacherToken)).items, []);
  for (const suffix of ['?limit=0', '?limit=101', '?beforeVersion=0']) assert.equal((await fetch(baseUrl + snapshotPath + suffix,
    { headers: { authorization: `Bearer ${teacherToken}` } })).status, 422);
  assert.equal((await fetch(baseUrl + snapshotPath, { headers: { authorization: `Bearer ${adminToken}` } })).status, 403);
  for (const row of [...snapshotFirst.items, ...snapshotNext.items]) assert.deepEqual(Object.keys(row).sort(),
    ['id', 'version', 'sourceKind', 'rosterImportId', 'ocrBatchId', 'sourceVersion', 'sourceRowCount', 'confirmedAt', 'selected'].sort());
  console.log(JSON.stringify({ check: 'CONFIRMED_ROSTER_SNAPSHOT_LIST_CURSOR_CURRENT_SELECTION_METADATA_ONLY', result: 'PASS' }));
  assert.equal(await prisma.enrollment.count({ where: { classSectionId: section } }), 0);
  console.log(JSON.stringify({ check: 'UNIFIED_ROSTER_BASIS_RESTORE_OCR_ELECTRONIC_CONCURRENT_VERSION_REASON_REPLAY_HISTORY', result: 'PASS' }));
  console.log(JSON.stringify({ check: 'OCR_TO_REAL_CSV_CONFIRM_REPLACE_ROLLBACK_SHARED_VERSION_SOURCE_BYTES_HISTORY_NO_MEMBERSHIP', result: 'PASS', providerSimulated: true }));
}
