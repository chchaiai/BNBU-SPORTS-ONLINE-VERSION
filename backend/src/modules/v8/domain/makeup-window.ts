export type MakeupWindow = { startsAt: Date; endsAt: Date; acceptedAt: Date; revokedAt: Date | null };
const instant = (value: Date) => value.getTime();

/** Window dates constrain future server starts; they never assign an exercise to an earlier day or week. */
export function validateMakeupWindow(input: { startsAt: Date; endsAt: Date; now: Date; regularDeadline: Date; closingDeadline: Date }) {
  const values = Object.values(input).map(instant);
  if (values.some(value => !Number.isFinite(value))) throw new Error('MAKEUP_TIME_INVALID');
  if (input.closingDeadline.getTime() - input.regularDeadline.getTime() !== 7 * 24 * 60 * 60 * 1000)
    throw new Error('MAKEUP_CLOSING_PERIOD_INVALID');
  if (input.startsAt < input.regularDeadline || input.endsAt > input.closingDeadline || input.startsAt >= input.endsAt)
    throw new Error('MAKEUP_OUTSIDE_CLOSING_PERIOD');
  if (input.endsAt <= input.now) throw new Error('MAKEUP_WINDOW_ALREADY_ENDED');
}

/** A grant can authorize only starts accepted after the grant, within [startsAt, endsAt). */
export function makeupWindowAllowsStart(window: MakeupWindow, serverNow: Date): boolean {
  const times = [window.startsAt, window.endsAt, window.acceptedAt, serverNow, ...(window.revokedAt ? [window.revokedAt] : [])].map(instant);
  if (times.some(value => !Number.isFinite(value)) || window.startsAt >= window.endsAt) return false;
  return serverNow >= window.acceptedAt && serverNow >= window.startsAt && serverNow < window.endsAt &&
    (window.revokedAt === null || serverNow < window.revokedAt);
}
