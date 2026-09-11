import type { JoinCapabilityStatus } from './join-capability-status.js';

export interface JoinCapabilityState {
  id: string;
  organizationId: string;
  courseInviteId: string;
  classSectionId: string;
  tokenHash: string;
  secretCiphertext: string | null;
  secretKeyVersion: number;
  secretReplayExpiresAt: Date | null;
  status: JoinCapabilityStatus;
  identityFingerprint: string;
  deviceChallengeHash: string | null;
  encryptedIdentitySnapshot: string;
  identityKeyVersion: number;
  issuedAt: Date;
  expiresAt: Date;
  consumedAt: Date | null;
  consumedByUserId: string | null;
  enrollmentId: string | null;
  authSessionId: string | null;
  resultCiphertext: string | null;
  resultKeyVersion: number | null;
  resultReplayExpiresAt: Date | null;
  createdRequestId: string;
  consumedRequestId: string | null;
  consumedIdempotencyKeyHash: string | null;
  version: number;
}

export class JoinCapabilityEntity {
  private constructor(private state: JoinCapabilityState) {}

  static issue(
    input: Omit<
      JoinCapabilityState,
      | 'status'
      | 'consumedAt'
      | 'consumedByUserId'
      | 'enrollmentId'
      | 'authSessionId'
      | 'resultCiphertext'
      | 'resultKeyVersion'
      | 'resultReplayExpiresAt'
      | 'consumedRequestId'
      | 'consumedIdempotencyKeyHash'
      | 'version'
    >,
  ): JoinCapabilityEntity {
    if (input.expiresAt <= input.issuedAt) throw new Error('JOIN_CAPABILITY_EXPIRY_INVALID');
    return new JoinCapabilityEntity({
      ...input,
      status: 'ACTIVE',
      consumedAt: null,
      consumedByUserId: null,
      enrollmentId: null,
      authSessionId: null,
      resultCiphertext: null,
      resultKeyVersion: null,
      resultReplayExpiresAt: null,
      consumedRequestId: null,
      consumedIdempotencyKeyHash: null,
      version: 1,
    });
  }

  static restore(state: JoinCapabilityState): JoinCapabilityEntity {
    return new JoinCapabilityEntity({ ...state });
  }

  snapshot(): JoinCapabilityState {
    return { ...this.state };
  }
}
