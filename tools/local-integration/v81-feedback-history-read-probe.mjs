import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.ts';

export async function probeFeedbackHistoryRead({ prisma, fixture, request, adminToken }) {
  const member = await seedExerciseSessionStudent(prisma, fixture, randomUUID().slice(0, 8).toUpperCase());
  const ids = [];
  for (let index = 0; index < 7; index++) {
    const feedback = await prisma.feedback.create({ data: { id: randomUUID(), organizationId: fixture.organizationId,
      createdByUserId: member.userId, category: 'PRIVACY', content: `Synthetic retained feedback ${index}${index === 0 ? ' marker_%' : ''}`,
      status: 'OPEN', createdAt: new Date(), updatedAt: new Date() } });
    ids.push(feedback.id);
  }
  await request(`/admin/feedback/${ids[0]}/handling`, adminToken,
    { status: 'RESOLVED', publicReply: 'Synthetic retained public reply', expectedVersion: 1 });
  const before = await request(`/admin/feedback/${ids[0]}`, adminToken);
  assert.equal(before.requester.email, member.email);
  assert.equal(before.history.length, 1);
  const stored = await prisma.feedback.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } });
  const events = await prisma.feedbackEvent.findMany({ where: { feedbackId: ids[0] }, orderBy: { eventVersion: 'asc' } });
  const verifyLists = async (retired) => {
    const first = await request('/admin/feedback?page=1', adminToken);
    const second = await request('/admin/feedback?page=2', adminToken);
    assert.equal(first.items.length, 6);
    assert.equal(second.items.length, 1);
    assert.deepEqual([...first.items, ...second.items].map(item => item.id).sort(), [...ids].sort());
    assert.deepEqual(first.summary, { total: 7, pending: 6, waitingTech: 0, resolved: 1 });
    if (retired) assert.ok([...first.items, ...second.items].every(item =>
      Object.values(item.requester).every(value => value === null)));
    for (const search of [ids[0], 'marker_%', '%']) {
      const result = await request(`/admin/feedback?search=${encodeURIComponent(search)}`, adminToken);
      assert.deepEqual(result.items.map(item => item.id), [ids[0]]);
    }
    const email = await request(`/admin/feedback?search=${encodeURIComponent(member.email)}`, adminToken);
    assert.equal(email.total, retired ? 0 : 7);
    const resolved = await request('/admin/feedback?status=RESOLVED&category=PRIVACY', adminToken);
    assert.deepEqual(resolved.items.map(item => item.id), [ids[0]]);
  };
  await verifyLists(false);
  await prisma.$transaction(async tx => {
    await tx.authSession.delete({ where: { id: member.authSessionId } });
    await tx.studentProfile.delete({ where: { id: member.studentId } });
    await tx.user.delete({ where: { id: member.userId } });
  });
  await verifyLists(true);
  assert.deepEqual(await request(`/admin/feedback/${ids[0]}`, adminToken),
    { ...before, requester: { name: null, studentNumber: null, email: null } });
  assert.deepEqual(await prisma.feedback.findMany({ where: { id: { in: ids } }, orderBy: { id: 'asc' } }), stored);
  assert.deepEqual(await prisma.feedbackEvent.findMany({ where: { feedbackId: ids[0] }, orderBy: { eventVersion: 'asc' } }), events);
  assert.equal(await prisma.user.findUnique({ where: { id: member.userId } }), null);
  console.log(JSON.stringify({ check: 'FEEDBACK_RETIRED_STUDENT_PAGINATION_SEARCH_SUMMARY_HISTORY_NO_CURRENT_PII',
    result: 'PASS', feedbackCount: 7, handledHistoryCount: 1, syntheticDirectDeletion: true, deletionApiValidated: false }));
}
