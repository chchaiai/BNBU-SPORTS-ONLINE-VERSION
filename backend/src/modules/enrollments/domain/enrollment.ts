import type { EnrollmentSource, EnrollmentStatus } from './enrollment-status.js';

export interface EnrollmentState {
  id: string;
  organizationId: string;
  semesterId: string;
  classSectionId: string;
  studentId: string;
  source: EnrollmentSource;
  sourceReferenceId: string | null;
  status: EnrollmentStatus;
  joinedAt: Date;
  endedAt: Date | null;
  endReason: string | null;
  createdBy: string;
  updatedBy: string;
  createdAt: Date;
  updatedAt: Date;
  version: number;
}

export class EnrollmentEntity {
  private constructor(private state: EnrollmentState) {}

  static create(
    input: Omit<EnrollmentState, 'status' | 'endedAt' | 'endReason' | 'version'>,
  ): EnrollmentEntity {
    return new EnrollmentEntity({
      ...input,
      status: 'ACTIVE',
      endedAt: null,
      endReason: null,
      version: 1,
    });
  }

  static restore(state: EnrollmentState): EnrollmentEntity {
    return new EnrollmentEntity({ ...state });
  }

  remove(reason: string, actorUserId: string, now: Date): void {
    if (this.state.status !== 'ACTIVE') throw new Error('ENROLLMENT_NOT_ACTIVE');
    this.state = {
      ...this.state,
      status: 'REMOVED',
      endedAt: now,
      endReason: reason,
      updatedBy: actorUserId,
      updatedAt: now,
      version: this.state.version + 1,
    };
  }

  activate(reason: string, actorUserId: string, now: Date): void {
    if (this.state.status !== 'REMOVED' && this.state.status !== 'WITHDRAWN') {
      throw new Error('ENROLLMENT_TRANSITION_NOT_ALLOWED');
    }
    if (reason.length === 0) throw new Error('ENROLLMENT_REASON_REQUIRED');
    this.state = {
      ...this.state,
      status: 'ACTIVE',
      endedAt: null,
      endReason: null,
      updatedBy: actorUserId,
      updatedAt: now,
      version: this.state.version + 1,
    };
  }

  snapshot(): EnrollmentState {
    return { ...this.state };
  }
}
