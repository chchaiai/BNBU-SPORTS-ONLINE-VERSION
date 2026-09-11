import { mergedInterruptions, type Interruption } from './deadlines.js';
export type SwimEvidence = { mediaId: string; phase: 'BEFORE' | 'AFTER' | 'OTHER' };
export function swimTransferClock(acceptedAt: Date, now: Date, intervals: readonly Interruption[]) {
  if (now < acceptedAt) throw new Error('INVALID_TRANSFER_CLOCK');
  const start = acceptedAt.getTime();
  let deadline = start + 30 * 60 * 1000;
  for (const [from, to] of mergedInterruptions(intervals, now)) {
    if (to <= start) continue;
    if (from >= deadline) break;
    deadline += Math.max(0, Math.min(to, now.getTime()) - Math.max(start, from));
  }
  const paused = intervals.some((item) => item.endedAt === null && item.startedAt <= now && item.startedAt.getTime() < deadline);
  return { deadline: new Date(deadline), paused, remainingMs: Math.max(0, deadline - now.getTime()),
    expired: !paused && now.getTime() > deadline };
}
export function swimIntakeTiming(endedAt: Date, now: Date, delayReason?: string) {
  const elapsed = now.getTime() - endedAt.getTime();
  if (!Number.isFinite(elapsed) || elapsed < 0) throw new Error('INVALID_SESSION_END');
  const reason = delayReason?.trim() || null;
  if (elapsed > 24 * 60 * 60 * 1000) throw new Error('SWIM_DELAY_WINDOW_EXPIRED');
  if (elapsed > 15 * 60 * 1000 && !reason) throw new Error('SWIM_DELAY_REASON_REQUIRED');
  return {
    intakeKind: reason ? 'OFFLINE_DELAYED' as const : 'ON_TIME' as const,
    delayReason: reason,
    transferDeadline: new Date(now.getTime() + 30 * 60 * 1000),
  };
}
