import { ApiError, request } from './api-client';
import type { StudentProfileProjection } from './admin-types';

export type DeletionStudent = Pick<StudentProfileProjection, 'id' | 'studentNumber' | 'fullName' | 'version'>;
export type DeletionItem = {
  student: DeletionStudent;
  key: string;
  status: 'pending' | 'unconfirmed' | 'deleted' | 'failed';
  failure?: { status: number; code: string; requestId: string | null };
};
export type StudentDeletionBatch = { schema: 1; ownerId: string; reason: string; items: DeletionItem[] };
export type DeletionSender = (id: string, key: string, body: {
  expectedVersion: number; confirmationStudentNumber: string; reason: string;
}) => Promise<{ id: string; deleted: boolean }>;

export function selectedStudents(ids: readonly string[], scope: readonly StudentProfileProjection[]) {
  const selected = new Set(ids);
  return scope.filter(student => selected.has(student.id));
}

export function createStudentDeletionBatch(ownerId: string, students: readonly DeletionStudent[], reason: string): StudentDeletionBatch {
  if (!ownerId || !reason.trim() || reason.trim().length > 1000 || !students.length ||
    new Set(students.map(s => s.id)).size !== students.length) throw new Error('INVALID_DELETION_BATCH');
  return { schema: 1, ownerId, reason: reason.trim(), items: students.map(student => ({
    student: { id: student.id, studentNumber: student.studentNumber, fullName: student.fullName, version: student.version },
    key: crypto.randomUUID(), status: 'pending',
  })) };
}

export const deletionJournalKey = (ownerId: string) => `bnbu:student-deletion-batch:v1:${ownerId}`;

export function readStudentDeletionBatch(raw: string | null, ownerId: string): StudentDeletionBatch | null {
  if (!raw) return null;
  const batch = JSON.parse(raw) as StudentDeletionBatch;
  if (batch.schema !== 1 || batch.ownerId !== ownerId || typeof batch.reason !== 'string' ||
    !batch.reason.trim() || batch.reason.length > 1000 || !Array.isArray(batch.items) || !batch.items.length ||
    new Set(batch.items.map(item => item.student?.id)).size !== batch.items.length ||
    batch.items.some(item => !item.student || typeof item.student.id !== 'string' ||
      !/^[a-f0-9-]{36}$/i.test(item.student.id) || typeof item.student.studentNumber !== 'string' ||
      !item.student.studentNumber.trim() || typeof item.student.fullName !== 'string' ||
      !Number.isSafeInteger(item.student.version) || item.student.version < 1 ||
      typeof item.key !== 'string' || !/^[a-f0-9-]{36}$/i.test(item.key) ||
      !['pending', 'unconfirmed', 'deleted', 'failed'].includes(item.status))) throw new Error('INVALID_DELETION_JOURNAL');
  return batch;
}

const sendDeletion: DeletionSender = (id, key, body) => request(`/admin/students/${encodeURIComponent(id)}/delete`, {
  method: 'POST', headers: { 'Idempotency-Key': key }, body,
});

/** A finite frozen selection, one request at a time; stop on the first error. */
export async function runStudentDeletionBatch(batch: StudentDeletionBatch, options: {
  save: (batch: StudentDeletionBatch) => void;
  changed: () => void;
  stopped: () => boolean;
  send?: DeletionSender;
}) {
  for (const item of batch.items) {
    if (options.stopped()) break;
    if (item.status === 'deleted' || item.status === 'failed') continue;
    item.status = 'unconfirmed';
    delete item.failure;
    // Persist the original intent before sending, including after a page reload.
    options.save(batch);
    options.changed();
    try {
      const result = await (options.send ?? sendDeletion)(item.student.id, item.key, {
        expectedVersion: item.student.version, confirmationStudentNumber: item.student.studentNumber, reason: batch.reason,
      });
      if (result.id !== item.student.id || result.deleted !== true) throw new Error('DELETION_RECEIPT_UNCONFIRMED');
      item.status = 'deleted';
    } catch (error) {
      const definitive = error instanceof ApiError && [400, 401, 403, 404, 409, 422].includes(error.status) &&
        error.code !== 'CONFLICT_REQUEST_IN_PROGRESS';
      item.status = definitive ? 'failed' : 'unconfirmed';
      item.failure = error instanceof ApiError
        ? {status: error.status, code: error.code, requestId: error.requestId}
        : {status: 0, code: 'NETWORK_ERROR', requestId: null};
      options.save(batch);
      options.changed();
      break;
    }
    options.save(batch);
    options.changed();
  }
}
