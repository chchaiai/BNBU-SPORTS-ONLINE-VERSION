import assert from 'node:assert/strict';
import test from 'node:test';
import { courseRequirementLabel, loadCourseDirectory } from '../app/admin-course-directory-api.ts';

test('older directory responses do not mislabel absent requirements as unpublished or zero', () => {
  assert.equal(courseRequirementLabel(undefined, '分钟', 'zh'), '暂未提供');
  assert.equal(courseRequirementLabel(undefined, 'min', 'en'), 'Unavailable');
  assert.equal(courseRequirementLabel(null, '分钟', 'zh'), '未发布');
  assert.equal(courseRequirementLabel(0, '分钟', 'zh'), '0 分钟');
  assert.equal(courseRequirementLabel(30, 'min', 'en'), '30 min');
  assert.equal(courseRequirementLabel(NaN, 'min', 'en'), 'Unavailable');
});

test('directory uses server distinct totals and excludes removed-member credit from current-member display', async () => {
  const fetchBefore = globalThis.fetch, windowBefore = globalThis.window;
  globalThis.window = { localStorage: { getItem: () => null, setItem: () => {}, removeItem: () => {} } };
  const calls = [];
  const body = { generatedAt: '2026-09-07T00:00:00Z', semester: { id: 'semester', displayName: 'Test semester' },
    summary: { courses: 2, students: 3, teachers: 1 }, rows: ['one', 'two'].map(id => ({ id,
      courseName: `Teacher title ${id}`, teacherId: 'teacher', teacherName: 'Test teacher',
      currentMembers: { students: 2, submittedStudents: 1, totalRecords: 3, validRecords: 1, invalidRecords: 1, creditedSeconds: 1800 },
      removedMembers: { students: 7, submittedStudents: 7, totalRecords: 10, validRecords: 10, creditedSeconds: 36000 },
      minimumMinutes: id === "one" ? 30 : null, maximumMinutes: id === "one" ? 90 : null,
      weeklyLimit: id === "one" ? 4 : null, dailyLimit: id === "one" ? 2 : null,
      courseTargetSeconds: id === "one" ? 0 : null, generalTargetSeconds: null, completedStudents: null, completionRate: null })) };
  globalThis.fetch = async url => { calls.push(String(url)); return Response.json({ data: body, meta: {} }); };
  try {
    const result = await loadCourseDirectory();
    assert.deepEqual(calls, ['/api/v1/admin/course-directory']);
    assert.equal(result.summary.students, 3);
    assert.equal(result.rows.reduce((sum, row) => sum + row.activeStudents, 0), 4);
    assert.equal(result.rows[0].creditedSeconds, 1800);
    assert.equal(result.rows[0].removedStudents, 7);
    assert.equal(result.rows[0].submittedStudents, 1);
    assert.equal(result.rows[0].courseTargetSeconds, 0);
    assert.deepEqual(result.rows.map(({ minimumMinutes, maximumMinutes, weeklyLimit, dailyLimit }) =>
      [minimumMinutes, maximumMinutes, weeklyLimit, dailyLimit]), [[30, 90, 4, 2], [null, null, null, null]]);
    assert.equal(result.rows[0].semesterName, 'Test semester');
    assert.equal(result.rows[0].completedStudents, null);
    body.semester = null; body.rows = []; body.summary = { courses: 0, students: 0, teachers: 0 };
    const empty = await loadCourseDirectory();
    assert.deepEqual(empty.rows, []); assert.deepEqual(empty.summary, body.summary);
    globalThis.fetch = async () => Response.json({ code: 'PERMISSION_RESOURCE_SCOPE_DENIED', message: 'Denied' }, { status: 403 });
    await assert.rejects(loadCourseDirectory(), error => error.status === 403);
  } finally { globalThis.fetch = fetchBefore; globalThis.window = windowBefore; }
});
