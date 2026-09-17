export type MakeupWindow = { startsAt: Date; endsAt: Date; acceptedAt: Date; revokedAt: Date | null };
const instant = (value: Date) => value.getTime();

/** Window dates constrain future server starts; they never assign an exercise to an earlier day or week. */
export function validateMakeupWindow(input: { startsAt: Date; endsAt: Date; now: Date; startBoundary: Date; endBoundary: Date }) {
  const values = Object.values(input).map(instant);
  if (values.some(value => !Number.isFinite(value))) throw new Error('MAKEUP_TIME_INVALID');
  if (input.startsAt < input.startBoundary || input.endsAt > input.endBoundary || input.startsAt >= input.endsAt)
    throw new Error('MAKEUP_OUTSIDE_EXERCISE_DATES');
  if (input.endsAt <= input.now) throw new Error('MAKEUP_WINDOW_ALREADY_ENDED');
}

/** A grant can authorize only starts accepted after the grant, within [startsAt, endsAt). */
export function makeupWindowAllowsStart(window: MakeupWindow, serverNow: Date): boolean {
  const times = [window.startsAt, window.endsAt, window.acceptedAt, serverNow, ...(window.revokedAt ? [window.revokedAt] : [])].map(instant);
  if (times.some(value => !Number.isFinite(value)) || window.startsAt >= window.endsAt) return false;
  return serverNow >= window.acceptedAt && serverNow >= window.startsAt && serverNow < window.endsAt &&
    (window.revokedAt === null || serverNow < window.revokedAt);
}
