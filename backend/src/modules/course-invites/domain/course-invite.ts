import type { CourseInviteStatus } from './course-invite-status.js';

export interface CourseInviteState {
  id: string;
  organizationId: string;
  classSectionId: string;
  versionNumber: number;
  status: CourseInviteStatus;
  tokenHash: string;
  secretCiphertext: string | null;
  secretKeyVersion: number;
  secretReplayExpiresAt: Date | null;
  createdBy: string;
  createdAt: Date;
  expiresAt: Date;
  revokedAt: Date | null;
  revokedBy: string | null;
  revokeReason: string | null;
  replacedByInviteId: string | null;
  rowVersion: number;
}

export class CourseInviteEntity {
  private constructor(private state: CourseInviteState) {}

  static create(
    input: Omit<
      CourseInviteState,
      'status' | 'revokedAt' | 'revokedBy' | 'revokeReason' | 'replacedByInviteId' | 'rowVersion'
    >,
  ): CourseInviteEntity {
    if (input.expiresAt <= input.createdAt || input.versionNumber < 1) {
      throw new Error('COURSE_INVITE_STATE_INVALID');
    }
    return new CourseInviteEntity({
      ...input,
      status: 'ACTIVE',
      revokedAt: null,
      revokedBy: null,
      revokeReason: null,
      replacedByInviteId: null,
      rowVersion: 1,
    });
  }

  static restore(state: CourseInviteState): CourseInviteEntity {
    return new CourseInviteEntity({ ...state });
  }

  revoke(replacedByInviteId: string, actorUserId: string, now: Date): void {
    if (this.state.status !== 'ACTIVE') throw new Error('COURSE_INVITE_NOT_ACTIVE');
    this.state = {
      ...this.state,
      status: 'REVOKED',
      revokedAt: now,
      revokedBy: actorUserId,
      revokeReason: 'ROTATED',
      replacedByInviteId,
      rowVersion: this.state.rowVersion + 1,
    };
  }

  snapshot(): CourseInviteState {
    return { ...this.state };
  }
}
