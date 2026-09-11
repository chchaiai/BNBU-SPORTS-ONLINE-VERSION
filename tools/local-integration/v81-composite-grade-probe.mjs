import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';

export async function probeCompositeGrades({ prisma, fixture, request, baseUrl, teacherToken, adminToken, student, studentToken }) {
  const template = await request('/rule-templates', adminToken, { displayName: 'Synthetic composite grade template', expectedVersion: 0 });
  const classId = fixture.teacherAActiveSectionId;
  await prisma.classSection.update({ where: { id: classId }, data: {
    dailyStartTime: new Date('1970-01-01T00:00:00Z'), dailyEndTime: new Date('1970-01-01T23:59:59Z') } });
  await request(`/class-sections/${classId}/v81-rules`, teacherToken, { templateId: template.id, minimumMinutes: 30, weeklyLimit: 3,
    courseTarget: 600, generalTarget: 600, regularDeadline: '2027-01-23T00:00:00Z', closingDeadline: '2027-01-30T00:00:00Z',
    settlementPlannedAt: '2027-01-30T01:00:00Z', publish: true, expectedVersion: 0 });
  const profile = await prisma.studentProfile.findUniqueOrThrow({ where: { id: student.studentId } });
  const csvValue = value => '"' + String(value).replaceAll('"', '""') + '"';
  const csv = `student_number,full_name\n${csvValue(profile.studentNumber)},${csvValue(profile.fullName)}\n000999,Synthetic unregistered student\n`;
  const form = new FormData(); form.append('source', 'FILE'); form.append('fileFormat', 'CSV');
  form.append('fieldMappingSnapshot', JSON.stringify({ studentNumber: 'student_number', fullName: 'full_name', gender: null,
    gradeYear: null, collegeName: null, majorName: null, administrativeClassName: null }));
  form.append('file', new Blob([csv], { type: 'text/csv' }), 'synthetic-composite-grades.csv');
  const uploaded = await fetch(baseUrl + `/class-sections/${classId}/roster-imports`, { method: 'POST',
    headers: { authorization: `Bearer ${teacherToken}`, 'idempotency-key': randomUUID() }, body: form });
  assert.equal(uploaded.status, 201);
  const source = (await uploaded.json()).data;
  await request(`/roster-imports/${source.id}/confirmation`, teacherToken, { expectedVersion: source.version });
  const path = `/class-sections/${classId}/composite-roster`, gradePath = `/enrollments/${student.enrollmentId}/final-grades`;
  const before = await request(path, teacherToken);
  const baseline = before.rows.find(row => row.enrollmentId === student.enrollmentId);
  assert.equal(baseline.finalGrade.latestRevision.version, 4); assert.deepEqual(baseline.finalGrade.latestRevision, baseline.finalGrade.publishedRevision);
  assert.equal(before.rows.find(row => row.studentNumber === '000999').finalGrade, null);
  const draft = await request(gradePath, teacherToken, { finalGrade: 777, published: false, expectedVersion: 4 });
  const after = await request(path, teacherToken), row = after.rows.find(item => item.enrollmentId === student.enrollmentId);
  assert.equal(row.finalGrade.latestRevision.version, draft.version); assert.equal(row.finalGrade.latestRevision.finalGrade, 777);
  assert.equal(row.finalGrade.latestRevision.published, false);
  assert.deepEqual(row.finalGrade.publishedRevision, baseline.finalGrade.publishedRevision);
  assert.deepEqual(row.progress, baseline.progress); assert.deepEqual(row.physical, baseline.physical);
  const exported = await request(path + '/export', teacherToken);
  const require = createRequire(new URL('../../backend/package.json', import.meta.url));
  const { read, utils } = require('xlsx');
  const workbook = read(Buffer.from(exported.fileBase64, 'base64'), { type: 'buffer' });
  const sheet = utils.sheet_to_json(workbook.Sheets['名单内'], { defval: null });
  const item = sheet.find(item => item['学号'] === profile.studentNumber);
  assert.equal(item['内部最新成绩'], 777); assert.equal(item['内部最新版本'], 5);
  assert.equal(item['内部已发布成绩'], baseline.finalGrade.publishedRevision.finalGrade); assert.equal(item['内部已发布版本'], 4);
  for (const token of [studentToken, adminToken]) {
    assert.equal((await fetch(baseUrl + path, { headers: { authorization: `Bearer ${token}` } })).status, 403);
    assert.equal((await fetch(baseUrl + path + '/export', { headers: { authorization: `Bearer ${token}` } })).status, 403);
  }
  assert.equal(after.isSettlementSnapshot, false);
  if(process.env.V81_SETTLEMENT_STORAGE==='1') {
    const {probeSettlementStorage}=await import('./v81-settlement-storage-probe.mjs');
    await probeSettlementStorage({prisma,fixture,report:after});
  }
  console.log(JSON.stringify({ check: 'COMPOSITE_INTERNAL_GRADE_LATEST_VS_PUBLISHED_CSV_CONFIRM_XLSX_STUDENT_ADMIN_DENIED', result: 'PASS', settlementSnapshotNotImplemented: true }));
}
