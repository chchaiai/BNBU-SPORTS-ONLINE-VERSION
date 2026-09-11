import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createRequire } from 'node:module';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';
import { TEST_PASSWORD } from '../../backend/test/helpers/test-environment.ts';

export async function probeOcrRosterMember({ prisma, fixture, request, baseUrl, teacherToken, adminToken, confirmed }) {
  // These are new synthetic registration fixtures, not a rerun or change of the failed physical-confirmation probe.
  const member = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const outside = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  await prisma.studentProfile.update({ where: { id: member.studentId }, data: {
    studentNumber: confirmed.sourceRows[0].studentNumber, fullName: confirmed.sourceRows[0].fullName } });
  await prisma.user.update({ where: { id: member.userId }, data: { emailVerifiedAt: new Date() } });
  const login = await request('/auth/password-login', null, { account: member.email, password: TEST_PASSWORD });
  const own = await request(`/enrollments/${member.enrollmentId}/roster-status`, login.accessToken);
  assert.equal(own.available, true); assert.equal(own.status, 'MATCHED'); assert.equal(own.registrationComplete, true);
  assert.equal(own.rosterVersion, confirmed.version);
  assert.deepEqual(Object.keys(own).sort(), ['enrollmentId', 'classSectionId', 'generatedAt', 'available', 'rosterVersion', 'status', 'registrationComplete'].sort());
  const denied = await fetch(baseUrl + `/enrollments/${outside.enrollmentId}/roster-status`, { headers: { authorization: `Bearer ${login.accessToken}` } });
  assert.equal(denied.status, 404);
  const summary = await request(`/admin/class-sections/${fixture.teacherAActiveSectionId}/physical-summary`, adminToken);
  assert.equal(summary.notRecordedCount, 1); assert.equal(summary.unresolvedRegistrationCount, 0);
  assert.equal(summary.recordedCount, 0); assert.equal(summary.exemptCount, 0);
  await prisma.classSection.update({ where: { id: fixture.teacherAActiveSectionId }, data: {
    dailyStartTime: new Date('1970-01-01T00:00:00Z'), dailyEndTime: new Date('1970-01-01T23:59:59Z') } });
  await request(`/class-sections/${fixture.teacherAActiveSectionId}/v81-rules`, teacherToken, {
    minimumMinutes: 30, weeklyLimit: 3, courseTarget: 600, generalTarget: 600,
    regularDeadline: '2027-01-23T15:59:59Z', closingDeadline: '2027-01-30T15:59:59Z',
    settlementPlannedAt: '2027-01-30T16:00:00Z', publish: true, expectedVersion: 0 });
  const reportPath = `/class-sections/${fixture.teacherAActiveSectionId}/composite-roster`;
  const report = await request(reportPath, teacherToken);
  assert.equal(report.sourceKind, 'OCR'); assert.equal(report.ocrBatchId, confirmed.batchId);
  assert.equal(report.rosterImportId, null); assert.equal(report.confirmedRosterId, confirmed.id);
  assert.equal(report.registrationComplete, true); assert.equal(report.rows.length, 1); assert.equal(report.extras.length, 1);
  assert.equal(report.rows[0].status, 'MATCHED'); assert.equal(report.rows[0].physical.status, 'NOT_RECORDED');
  assert.equal(report.rows[0].progress.remainingSeconds, 72000); assert.equal(report.isSettlementSnapshot, false);
  const exported = await request(reportPath + '/export', teacherToken);
  const requireBackend = createRequire(new URL('../../backend/package.json', import.meta.url));
  const { read, utils } = requireBackend('xlsx');
  const workbook = read(Buffer.from(exported.fileBase64, 'base64'), { type: 'buffer' });
  const metadata = utils.sheet_to_json(workbook.Sheets['说明'], { header: 1 });
  assert.equal(metadata.find(row => row[0] === '来源类型')[1], 'OCR');
  assert.equal(metadata.find(row => row[0] === '来源名单标识')[1], confirmed.batchId);
  console.log(JSON.stringify({ check: 'OCR_ROSTER_STUDENT_OWN_SCOPE_ADMIN_NOT_RECORDED_COMPOSITE_PREVIEW_EXPORT_SOURCE', result: 'PASS', membersSeeded: true, providerSimulated: true }));
}
