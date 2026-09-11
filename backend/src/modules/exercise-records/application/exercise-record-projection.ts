import type {
  ExerciseRecord,
  ExerciseRecordMedia,
  ExerciseSession,
  ReviewRecord,
} from '../../../generated/prisma/client.js';

export interface ExerciseRecordProjection {
  id: string;
  organizationId: string;
  semesterId: string;
  studentId: string;
  enrollmentId: string;
  classSectionId: string;
  courseId: string;
  teacherId: string;
  sessionId: string;
  businessDate: string;
  creditType: string;
  sportType: string;
  sportName: string | null;
  description: string | null;
  actualDurationSeconds: number;
  pausedDurationSeconds: number;
  creditedDurationSeconds: number;
  status: string;
  submittedAt: string | null;
  cancelledAt: string | null;
  clientRequestId: string;
  currentReview: {
    result: string;
    reasonCode: string | null;
    publicComment: string | null;
  } | null;
  version: number;
}

export type ExerciseRecordWithReview = ExerciseRecord & {
  reviews: Pick<ReviewRecord, 'result' | 'reasonCode' | 'publicComment' | 'reviewVersion'>[];
};

export interface ExerciseRecordEvidenceContextProjection {
  recordId: string;
  sessionId: string;
  startedAt: string;
  endedAt: string | null;
  mediaIds: string[];
}

export type ExerciseRecordWithEvidenceContext = Pick<ExerciseRecord, 'id' | 'sessionId'> & {
  session: Pick<ExerciseSession, 'startedAt' | 'completedAt'>;
  media: Pick<ExerciseRecordMedia, 'mediaId'>[];
};

function safeSeconds(value: bigint): number {
  const result = Number(value);
  if (!Number.isSafeInteger(result)) throw new Error('ExerciseRecord duration is unsafe');
  return result;
}

export function projectExerciseRecord(record: ExerciseRecordWithReview): ExerciseRecordProjection {
  const current = record.reviews.at(0) ?? null;
  return {
    id: record.id,
    organizationId: record.organizationId,
    semesterId: record.semesterId,
    studentId: record.studentId,
    enrollmentId: record.enrollmentId,
    classSectionId: record.classSectionId,
    courseId: record.courseId,
    teacherId: record.teacherId,
    sessionId: record.sessionId,
    businessDate: record.businessDate.toISOString().slice(0, 10),
    creditType: record.creditType,
    sportType: record.sportType,
    sportName: record.sportName,
    description: record.description,
    actualDurationSeconds: safeSeconds(record.actualDurationSeconds),
    pausedDurationSeconds: safeSeconds(record.pausedDurationSeconds),
    creditedDurationSeconds: safeSeconds(record.creditedDurationSeconds),
    status: record.status,
    submittedAt: record.submittedAt?.toISOString() ?? null,
    cancelledAt: record.cancelledAt?.toISOString() ?? null,
    clientRequestId: record.clientRequestId,
    currentReview:
      current === null
        ? null
        : {
            result: current.result,
            reasonCode: current.reasonCode,
            publicComment: current.publicComment,
          },
    version: record.version,
  };
}

export function projectExerciseRecordEvidenceContext(
  record: ExerciseRecordWithEvidenceContext,
): ExerciseRecordEvidenceContextProjection {
  return {
    recordId: record.id,
    sessionId: record.sessionId,
    startedAt: record.session.startedAt.toISOString(),
    endedAt: record.session.completedAt?.toISOString() ?? null,
    mediaIds: record.media.map(({ mediaId }) => mediaId),
  };
}
