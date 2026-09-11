import 'reflect-metadata';
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { V81SemestersService } from '../../src/modules/v8/v81-semesters.js';

async function check(states: ('CLEAR' | 'BLOCKED' | 'UNAVAILABLE')[], after?: string) {
  const target = { id: 'target', version: 1, displayName: 'Synthetic', status: 'UPCOMING',
    startDate: new Date('2026-09-01'), endDate: new Date('2027-01-31') };
  const tx = {
    $queryRaw: async () => [{ kind: 'SUPER', permissions: [], must_change_password: false }],
    semester: { findFirst: async ({ where }: { where: { id?: string } }) => where.id ? target : { ...target, id: 'current', status: 'CURRENT' } },
    organization: { findUniqueOrThrow: async () => ({ timezone: 'Asia/Shanghai' }) },
    classSection: { findMany: async () => states.map((_, index) => ({ id: String(index) })) },
  };
  const service = new V81SemestersService({ $transaction: async (fn: (value: typeof tx) => unknown) => fn(tx) } as never,
    null as never, { now: () => new Date('2026-09-08T00:00:00Z') } as never, null as never,
    { checkInTransaction: async (_tx: unknown, _org: string, id: string) => ({ classSectionId: id,
      checkedAt: '2026-09-08T00:00:00Z', ready: states[Number(id)] === 'CLEAR', checks: [
        { code: 'CONFIRMED_COMPOSITE_ROSTER', status: 'CLEAR', count: 0 },
        { code: 'PENDING_REVIEW', status: states[Number(id)], count: states[Number(id)] === 'CLEAR' ? 0 : 1 },
      ] }) } as never, { businessDate: () => '2026-09-08' } as never);
  return service.switchCheck({ role: 'ADMIN', userId: 'admin', organizationId: 'org' } as never,
    'target', { limit: 1, ...(after === undefined ? {} : { after }) });
}
test('saved reports with all work complete permit readiness on any page', async () => {
  for (const after of [undefined, '0', '9']) {
    const result = await check(['CLEAR', 'CLEAR'], after);
    assert.equal(result.ready, true);
    assert.equal(result.totalCourseCount, 2);
    assert.ok(result.checks.every(item => item.status === 'CLEAR' && item.count === 0));
  }
});
test('off-page work and unavailable facts block readiness even when reports exist', async () => {
  for (const status of ['BLOCKED', 'UNAVAILABLE'] as const) {
    const result = await check(['CLEAR', status], '9');
    assert.deepEqual(result.courses, []);
    assert.equal(result.ready, false);
    assert.deepEqual(result.checks.find(item => item.code === 'COURSE_UNFINISHED_WORK'),
      { code: 'COURSE_UNFINISHED_WORK', status, count: 1 });
  }
});
test('a semester without courses has no course settlement blockers', async () => {
  const result = await check([]);
  assert.equal(result.ready, true);
  assert.equal(result.nextCursor, null);
});
