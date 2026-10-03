import { ApiError, request } from './api-client';
import type { StudentProfileProjection } from './admin-types';

export type StudentBatchAction = 'profile' | 'second-class';
type Target = Pick<StudentProfileProjection, 'id' | 'studentNumber' | 'fullName' | 'version' | 'enrollmentCapacitySemesterId' | 'maximumActiveEnrollments'>;
export type UpdateItem = { student: Target; key: string; status: 'pending' | 'unconfirmed' | 'succeeded' | 'failed' | 'skipped'; note?: string };
export type StudentUpdateBatch = { schema: 1; ownerId: string; action: StudentBatchAction; reason: string; items: UpdateItem[] };
export type UpdateSender = (id: string, key: string, body: Record<string, unknown>) => Promise<Partial<StudentProfileProjection>>;
export const updateJournalKey = (owner: string) => `bnbu:student-update-batch:v1:${owner}`;

export function createStudentUpdateBatch(ownerId: string, action: StudentBatchAction, students: readonly Target[], reason: string): StudentUpdateBatch {
  if (!ownerId || !['profile', 'second-class'].includes(action) || !reason.trim() || reason.trim().length > 200 || !students.length || new Set(students.map(s => s.id)).size !== students.length) throw new Error('INVALID_UPDATE_BATCH');
  return {schema: 1, ownerId, action, reason: reason.trim(), items: students.map(s => {
    const student = {id:s.id,studentNumber:s.studentNumber,fullName:s.fullName,version:s.version,enrollmentCapacitySemesterId:s.enrollmentCapacitySemesterId,maximumActiveEnrollments:s.maximumActiveEnrollments};
    const note = action === 'second-class' ? (!s.enrollmentCapacitySemesterId ? 'NO_SEMESTER' : (s.maximumActiveEnrollments ?? 1) >= 2 ? 'ALREADY_OPEN' : undefined) : undefined;
    return {student,key:crypto.randomUUID(),status:note ? 'skipped' : 'pending',note};
  })};
}

export function readStudentUpdateBatch(raw: string | null, owner: string): StudentUpdateBatch | null {
  if (!raw) return null;
  const b = JSON.parse(raw) as StudentUpdateBatch;
  if (b.schema !== 1 || b.ownerId !== owner || !['profile','second-class'].includes(b.action) || typeof b.reason !== 'string' || !b.reason.trim() || b.reason.length > 200 || !Array.isArray(b.items) || !b.items.length || new Set(b.items.map(i=>i.student?.id)).size !== b.items.length || b.items.some(i => !i.student || typeof i.student.id !== 'string' || typeof i.student.fullName !== 'string' || typeof i.student.studentNumber !== 'string' || !Number.isSafeInteger(i.student.version) || i.student.version < 1 || typeof i.key !== 'string' || !/^[a-f0-9-]{36}$/i.test(i.key) || !['pending','unconfirmed','succeeded','failed','skipped'].includes(i.status) || (b.action === 'second-class' && i.status !== 'skipped' && (typeof i.student.enrollmentCapacitySemesterId !== 'string' || !i.student.enrollmentCapacitySemesterId)))) throw new Error('INVALID_UPDATE_JOURNAL');
  return b;
}

const sendUpdate: UpdateSender = (id,key,body) => request(`/students/${encodeURIComponent(id)}`, {method:'PATCH',headers:{'Idempotency-Key':key},body});

export async function runStudentUpdateBatch(batch: StudentUpdateBatch, options: {save:(batch:StudentUpdateBatch)=>void;changed:()=>void;stopped:()=>boolean;send?:UpdateSender}) {
  for (const item of batch.items) {
    if (options.stopped()) break;
    if (!['pending','unconfirmed'].includes(item.status)) continue;
    item.status='unconfirmed';delete item.note;
    options.save(batch);options.changed();
    try {
      const body = batch.action === 'profile'
        ? {expectedVersion:item.student.version,profileUpdateReason:batch.reason}
        : {expectedVersion:item.student.version,secondClassSemesterId:item.student.enrollmentCapacitySemesterId,secondClassReason:batch.reason};
      const result = await (options.send ?? sendUpdate)(item.student.id,item.key,body);
      if (result.id !== item.student.id || (batch.action === 'profile' ? result.profileQualityStatus !== 'REQUIRES_PROFILE_UPDATE' : result.maximumActiveEnrollments !== 2 || result.enrollmentCapacitySemesterId !== item.student.enrollmentCapacitySemesterId)) throw new Error('UPDATE_RECEIPT_UNCONFIRMED');
      item.status='succeeded';
    } catch (error) {
      const definite = error instanceof ApiError && [400,401,403,404,409,422].includes(error.status) && error.code !== 'CONFLICT_REQUEST_IN_PROGRESS';
      item.status=definite?'failed':'unconfirmed';
      item.note=error instanceof ApiError ? error.code : 'NETWORK_OR_RECEIPT_UNCONFIRMED';
      options.save(batch);options.changed();break;
    }
    options.save(batch);options.changed();
  }
}
