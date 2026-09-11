export const AUTH_CHALLENGE_STATUSES = [
  'PENDING_DELIVERY',
  'ACTIVE',
  'CONSUMED',
  'LOCKED',
  'EXPIRED',
  'DELIVERY_FAILED',
] as const;

export type AuthChallengeStatus = (typeof AUTH_CHALLENGE_STATUSES)[number];

export interface AuthChallengeSnapshot {
  status: AuthChallengeStatus;
  failedAttempts: number;
  maxAttempts: number;
  expiresAt: Date;
  deliveredAt: Date | null;
  consumedAt: Date | null;
  version: number;
}

export type AuthChallengeAttempt =
  | { accepted: true; next: AuthChallengeSnapshot }
  | {
      accepted: false;
      errorCode: 'AUTH_VERIFICATION_CODE_INVALID';
      next: AuthChallengeSnapshot;
    };

export function markAuthChallengeDelivered(
  current: AuthChallengeSnapshot,
  deliveredAt: Date,
): AuthChallengeSnapshot {
  assertChallenge(current);
  assertTimestamp(deliveredAt);
  if (current.status !== 'PENDING_DELIVERY') {
    throw new Error('AUTH_CHALLENGE_TRANSITION_NOT_ALLOWED');
  }
  if (deliveredAt >= current.expiresAt) {
    return transition(current, { status: 'EXPIRED' });
  }
  return transition(current, { status: 'ACTIVE', deliveredAt });
}

export function markAuthChallengeDeliveryFailed(
  current: AuthChallengeSnapshot,
): AuthChallengeSnapshot {
  assertChallenge(current);
  if (current.status !== 'PENDING_DELIVERY') {
    throw new Error('AUTH_CHALLENGE_TRANSITION_NOT_ALLOWED');
  }
  return transition(current, { status: 'DELIVERY_FAILED' });
}

export function attemptAuthChallengeVerification(
  current: AuthChallengeSnapshot,
  now: Date,
  codeMatches: boolean,
): AuthChallengeAttempt {
  assertChallenge(current);
  assertTimestamp(now);
  if (current.status !== 'ACTIVE') return rejected(cloneChallenge(current));
  if (now >= current.expiresAt) {
    return rejected(transition(current, { status: 'EXPIRED' }));
  }
  if (!codeMatches) {
    const failedAttempts = current.failedAttempts + 1;
    return rejected(
      transition(current, {
        failedAttempts,
        status: failedAttempts >= current.maxAttempts ? 'LOCKED' : 'ACTIVE',
      }),
    );
  }
  return {
    accepted: true,
    next: transition(current, { status: 'CONSUMED', consumedAt: now }),
  };
}

function rejected(next: AuthChallengeSnapshot): AuthChallengeAttempt {
  return { accepted: false, errorCode: 'AUTH_VERIFICATION_CODE_INVALID', next };
}

function transition(
  current: AuthChallengeSnapshot,
  changes: Partial<Omit<AuthChallengeSnapshot, 'version' | 'expiresAt'>>,
): AuthChallengeSnapshot {
  return {
    ...cloneChallenge(current),
    ...changes,
    deliveredAt:
      changes.deliveredAt === undefined
        ? current.deliveredAt === null
          ? null
          : new Date(current.deliveredAt.getTime())
        : changes.deliveredAt === null
          ? null
          : new Date(changes.deliveredAt.getTime()),
    consumedAt:
      changes.consumedAt === undefined
        ? current.consumedAt === null
          ? null
          : new Date(current.consumedAt.getTime())
        : changes.consumedAt === null
          ? null
          : new Date(changes.consumedAt.getTime()),
    version: current.version + 1,
  };
}

function cloneChallenge(current: AuthChallengeSnapshot): AuthChallengeSnapshot {
  return {
    ...current,
    expiresAt: new Date(current.expiresAt.getTime()),
    deliveredAt: current.deliveredAt === null ? null : new Date(current.deliveredAt.getTime()),
    consumedAt: current.consumedAt === null ? null : new Date(current.consumedAt.getTime()),
  };
}

function assertChallenge(current: AuthChallengeSnapshot): void {
  if (
    !AUTH_CHALLENGE_STATUSES.includes(current.status) ||
    !Number.isSafeInteger(current.failedAttempts) ||
    current.failedAttempts < 0 ||
    !Number.isSafeInteger(current.maxAttempts) ||
    current.maxAttempts < 1 ||
    current.failedAttempts > current.maxAttempts ||
    !Number.isSafeInteger(current.version) ||
    current.version < 1
  ) {
    throw new Error('AUTH_CHALLENGE_STATE_INVALID');
  }
  assertTimestamp(current.expiresAt);
  if (current.deliveredAt !== null) assertTimestamp(current.deliveredAt);
  if (current.consumedAt !== null) assertTimestamp(current.consumedAt);
  if (current.status === 'CONSUMED' && current.consumedAt === null) {
    throw new Error('AUTH_CHALLENGE_STATE_INVALID');
  }
}

function assertTimestamp(value: Date): void {
  if (!Number.isFinite(value.getTime())) throw new Error('AUTH_CHALLENGE_STATE_INVALID');
}
