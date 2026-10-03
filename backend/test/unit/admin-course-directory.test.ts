import assert from 'node:assert/strict';
import test from 'node:test';
import { V81AdminCourseDirectoryService } from '../../src/modules/v8/v81-admin-course-directory.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import type { Clock } from '../../src/common/time/clock.js';
import type { AuthenticatedPrincipal } from '../../src/common/http/request-context.js';

test('directory exposes each published course rule and leaves unpublished rules unavailable', async () => {
  const sections = ['one', 'two', 'unpublished'].map(id => ({ id, displayName: id,
    teacherId: 'teacher', teacher: { fullName: 'Teacher' }, status: 'ACTIVE', isEnrollmentOpen: true,
    checkInWindowMode: 'UNAVAILABLE' }));
  const queries: string[] = [];
  const tx = {
    semester: { findFirst: async () => ({ id: 'semester', displayName: 'Semester' }) },
    classSection: { findMany: async () => sections },
    enrollment: { findMany: async () => [] },
    $queryRaw: async (parts: TemplateStringsArray) => {
      const sql = parts.join('?'); queries.push(sql);
      if (sql.includes('v81_admin_access')) return [{ kind: 'SUPER', must_change_password: false }];
      if (sql.includes('course_target AS course')) return [
        { classSectionId: 'one', course: 0, general: 1200, minimumMinutes: 30, maximumMinutes: 90, weeklyLimit: 4, dailyLimit: 2 },
        { classSectionId: 'two', course: 600, general: 600, minimumMinutes: 45, maximumMinutes: 120, weeklyLimit: 3, dailyLimit: 1 },
      ];
      return [];
    },
  };
  const prisma = { $transaction: async (run: (client: typeof tx) => unknown) => run(tx) };
  const service = new V81AdminCourseDirectoryService(prisma as unknown as PrismaService,
    { now: () => new Date('2026-10-02T00:00:00Z') } as Clock);
  const directory = await service.get({ role: 'ADMIN', organizationId: 'org', userId: 'admin' } as AuthenticatedPrincipal);
  assert.deepEqual(directory.rows.map(row => [row.minimumMinutes, row.maximumMinutes, row.weeklyLimit, row.dailyLimit]),
    [[30, 90, 4, 2], [45, 120, 3, 1], [null, null, null, null]]);
  assert.equal(directory.rows[0]?.courseTargetSeconds, 0);
  assert.equal(directory.rows[0]?.generalTargetSeconds, 72000);
  assert.equal(directory.rows[2]?.courseTargetSeconds, null);
  const ruleQuery = queries.find(sql => sql.includes('course_target AS course'))!;
  assert.match(ruleQuery, /published_at IS NOT NULL/);
  assert.match(ruleQuery, /organization_id=/);
});
