export interface DurableRateWindowPolicy {
  windowSeconds: number;
  limit: number;
}

export interface DurableRateWindowDecision {
  allowed: boolean;
  activeAttemptCount: number;
  remainingAfterCurrentAttempt: number;
  retryAfterSeconds: number;
  cutoff: Date;
}

/**
 * Evaluates durable attempt timestamps supplied by a repository. It retains no process state.
 * A caller records `now` only when `allowed` is true, inside the surrounding transaction.
 */
export function evaluateDurableRateWindow(
  persistedAttempts: readonly Date[],
  now: Date,
  policy: DurableRateWindowPolicy,
): DurableRateWindowDecision {
  if (
    !Number.isSafeInteger(policy.windowSeconds) ||
    policy.windowSeconds < 1 ||
    !Number.isSafeInteger(policy.limit) ||
    policy.limit < 1 ||
    !Number.isFinite(now.getTime())
  ) {
    throw new RangeError('Invalid durable rate-window input.');
  }

  const nowMs = now.getTime();
  const windowMs = policy.windowSeconds * 1_000;
  if (!Number.isSafeInteger(windowMs)) throw new RangeError('Invalid durable rate-window input.');
  const cutoffMs = nowMs - windowMs;
  const active = persistedAttempts
    .map((attempt) => attempt.getTime())
    .filter((attemptMs) => {
      if (!Number.isFinite(attemptMs) || attemptMs > nowMs) {
        throw new RangeError('Persisted rate-window facts must be valid server timestamps.');
      }
      return attemptMs > cutoffMs;
    })
    .sort((left, right) => left - right);
  const allowed = active.length < policy.limit;
  const oldestActive = active[0];
  return {
    allowed,
    activeAttemptCount: active.length,
    remainingAfterCurrentAttempt: allowed ? policy.limit - active.length - 1 : 0,
    retryAfterSeconds:
      allowed || oldestActive === undefined
        ? 0
        : Math.max(1, Math.ceil((oldestActive + windowMs - nowMs) / 1_000)),
    cutoff: new Date(cutoffMs),
  };
}
