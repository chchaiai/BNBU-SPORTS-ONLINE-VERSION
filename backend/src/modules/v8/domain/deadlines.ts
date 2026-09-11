export interface Interruption {
  startedAt: Date;
  endedAt: Date | null;
}

/** Union of actual interruptions: overlaps must never grant duplicate compensation. */
export function mergedInterruptions(
  intervals: readonly Interruption[],
  now: Date,
): [number, number][] {
  const ordered = intervals
    .map((item) => [item.startedAt.getTime(), (item.endedAt ?? now).getTime()] as [number, number])
    .sort((a, b) => a[0] - b[0]);
  const merged: [number, number][] = [];
  for (const [start, end] of ordered) {
    if (!Number.isFinite(start) || !Number.isFinite(end) || end < start)
      throw new Error('INVALID_INTERRUPTION');
    const previous = merged.at(-1);
    if (previous && start <= previous[1]) previous[1] = Math.max(previous[1], end);
    else merged.push([start, end]);
  }
  return merged;
}
export function supplementClock(
  startedAt: Date,
  hours: 24 | 72,
  intervals: readonly Interruption[],
  now: Date,
) {
  if (![24, 72].includes(hours) || now < startedAt) throw new Error('INVALID_SUPPLEMENT_CLOCK');
  const start = startedAt.getTime();
  let deadline = start + hours * 3_600_000;
  for (const [from, to] of mergedInterruptions(intervals, now)) {
    if (to <= start) continue;
    // An interruption starting after the deadline cannot resurrect an expired record.
    if (from >= deadline) break;
    deadline += Math.max(0, to - Math.max(start, from));
  }
  const paused = intervals.some(
    (item) => item.endedAt === null && item.startedAt <= now && item.startedAt.getTime() < deadline,
  );
  return {
    deadline: new Date(deadline),
    remainingMs: Math.max(0, deadline - now.getTime()),
    paused,
    expired: !paused && now.getTime() >= deadline,
  };
}
