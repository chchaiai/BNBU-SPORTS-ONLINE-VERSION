import test from 'node:test';
import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ApiError} from '../app/api-client.ts';
import {AdminStudentBulkDeletion} from '../app/admin-student-bulk-deletion.tsx';
import {createStudentDeletionBatch, readStudentDeletionBatch, runStudentDeletionBatch, selectedStudents} from '../app/student-deletion-batch.ts';

const owner = crypto.randomUUID();
const students = Array.from({length: 12}, (_, index) => ({id: crypto.randomUUID(), studentNumber: `TEST${index}`, fullName: `Fixture ${index}`, version: 3}));
const create = () => createStudentDeletionBatch(owner, students, '  Synthetic test only  ');
const options = send => ({save() {}, changed() {}, stopped: () => false, send});
test('selection includes only selected IDs in the filtered scope and preserves list order', () => {
  assert.deepEqual(selectedStudents([students[9].id, students[0].id], students), [students[0], students[9]]);
  assert.deepEqual(selectedStudents(students.map(s => s.id), students.slice(10)), students.slice(10));
  assert.equal(selectedStudents(students.slice(0, 10).map(s => s.id), students).length, 10);
});
test('intent freezes the confirmed names, versions, reason and unique keys', () => {
  const source = students.map(s => ({...s}));
  const batch = createStudentDeletionBatch(owner, source, ' reason ');
  source[0].version = 99;
  assert.equal(batch.items[0].student.version, 3);
  assert.equal(batch.reason, 'reason');
  assert.equal(new Set(batch.items.map(item => item.key)).size, 12);
  assert.throws(() => createStudentDeletionBatch(owner, [students[0], students[0]], 'reason'));
  assert.throws(() => createStudentDeletionBatch(owner, students, ' '));
});
test('success sends one request at a time, saves before dispatch, and skips completed rows on resume', async () => {
  const batch = create(); let active = 0, max = 0, calls = 0, saved = null;
  const opts = options(async (id, key, body) => {
    assert.equal(JSON.parse(saved).items[calls].status, 'unconfirmed');
    assert.equal(JSON.parse(saved).items[calls].key, key);
    assert.equal(body.confirmationStudentNumber, students[calls].studentNumber);
    assert.equal(body.expectedVersion, 3);
    calls++; active++; max = Math.max(max, active);
    await new Promise(resolve => setTimeout(resolve, 1)); active--;
    return {id, deleted: true};
  });
  opts.save = value => {saved = JSON.stringify(value);};
  await runStudentDeletionBatch(batch, opts);
  await runStudentDeletionBatch(batch, opts);
  assert.equal(calls, 12); assert.equal(max, 1);
  assert.ok(batch.items.every(item => item.status === 'deleted'));
});
test('lost receipt pauses the batch and retries the same persisted intent after reload', async () => {
  const batch = create(); const calls = []; let raw;
  const opts = options(async (...args) => {calls.push(args); throw new TypeError('network failure');});
  opts.save = value => {raw = JSON.stringify(value);};
  await runStudentDeletionBatch(batch, opts);
  assert.equal(calls.length, 1);
  assert.equal(batch.items[0].status, 'unconfirmed');
  const restored = readStudentDeletionBatch(raw, owner);
  await runStudentDeletionBatch(restored, options(async (...args) => {
    if (args[0] === students[0].id) assert.deepEqual(args, calls[0]);
    return {id: args[0], deleted: true};
  }));
  assert.ok(restored.items.every(item => item.status === 'deleted'));
});
test('version or permission rejection retains partial results and stops later requests', async () => {
  for (const status of [403, 409]) {
    const batch = create(); let count = 0;
    await runStudentDeletionBatch(batch, options(async id => {
      if (++count === 2) throw new ApiError(status, {code: 'CONFLICT_VERSION', requestId: 'fixture-request'});
      return {id, deleted: true};
    }));
    assert.equal(count, 2);
    assert.deepEqual(batch.items.slice(0, 3).map(i => i.status), ['deleted', 'failed', 'pending']);
    assert.equal(batch.items[1].failure.requestId, 'fixture-request');
  }
});
test('server error, in-progress conflict or mismatched receipt is never reported as deleted', async () => {
  for (const result of [new ApiError(500, {code: 'INTERNAL_ERROR'}), new ApiError(409, {code: 'CONFLICT_REQUEST_IN_PROGRESS'}), {id: 'wrong', deleted: true}]) {
    const batch = create(); let calls = 0;
    await runStudentDeletionBatch(batch, options(async () => {calls++; if (result instanceof Error) throw result; return result;}));
    assert.equal(calls, 1); assert.equal(batch.items[0].status, 'unconfirmed');
  }
});
test('stop waits for the active receipt and prevents subsequent deletion', async () => {
  const batch = create(); let stopped = false, calls = 0;
  await runStudentDeletionBatch(batch, {...options(async id => {calls++; stopped = true; return {id, deleted: true};}), stopped: () => stopped});
  assert.equal(calls, 1); assert.equal(batch.items[0].status, 'deleted'); assert.equal(batch.items[1].status, 'pending');
});
test('unavailable journal storage prevents dispatch', async () => {
  let calls = 0;
  await assert.rejects(runStudentDeletionBatch(create(), {...options(async id => {calls++; return {id, deleted: true};}), save() {throw new Error('quota');}}));
  assert.equal(calls, 0);
});
test('journal rejects another owner, malformed data, duplicate IDs and invalid versions', () => {
  assert.equal(readStudentDeletionBatch(null, owner), null);
  assert.throws(() => readStudentDeletionBatch(JSON.stringify(create()), 'another-owner'));
  assert.throws(() => readStudentDeletionBatch('{', owner));
  const batch = create(); batch.items[0].student.version = 0;
  assert.throws(() => readStudentDeletionBatch(JSON.stringify(batch), owner));
  const duplicate = create(); duplicate.items.push(duplicate.items[0]);
  assert.throws(() => readStudentDeletionBatch(JSON.stringify(duplicate), owner));
});
test('confirmation shows exact list, irreversible impact, reason, acknowledgment and count phrase in both languages', () => {
  for (const locale of ['zh', 'en']) {
    const html = renderToStaticMarkup(React.createElement(AdminStudentBulkDeletion, {locale, students, ownerId: owner, close() {}, removed() {}}));
    for (const student of students) {assert.ok(html.includes(student.studentNumber)); assert.ok(html.includes(student.fullName));}
    assert.match(html, /maxLength="1000"/);
    assert.match(html, /type="checkbox"/);
    assert.match(html, /class="danger-button" disabled=""/);
    assert.ok(html.includes(locale === 'zh' ? '删除 12 名学生' : 'DELETE 12 STUDENTS'));
  }
});
