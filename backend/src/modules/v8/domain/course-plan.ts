import { mondayOf, validateCreditRules, type CreditRules } from './crediting.js';

const dayMs = 86_400_000;
function dateValue(value: string): number {
  const at = Date.parse(`${value}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || !Number.isFinite(at) ||
      new Date(at).toISOString().slice(0, 10) !== value) throw new Error('INVALID_PLAN_DATE');
  return at;
}
function localParts(at: Date, timezone: string) {
  const parts = new Map(new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  }).formatToParts(at).map((part) => [part.type, part.value]));
  return {
    date: `${parts.get('year')}-${parts.get('month')}-${parts.get('day')}`,
    time: `${parts.get('hour')}:${parts.get('minute')}:${parts.get('second')}`,
  };
}

/** Counts actual available start dates. Session duration is not bounded by the start window. */
export function coursePlanCapacity(input: {
  rules: CreditRules;
  semesterStart: string; semesterEnd: string;
  startDate: string; endDate: string;
  dailyStart: string; dailyEnd: string;
  excludedDates: readonly string[];
  now: Date; regularDeadline?: Date; timezone: string;
}) {
  validateCreditRules(input.rules);
  for (const time of [input.dailyStart, input.dailyEnd])
    if (!/^([01]\d|2[0-3]):[0-5]\d:[0-5]\d$/.test(time)) throw new Error('INVALID_PLAN_TIME');
  if (input.dailyStart > input.dailyEnd) throw new Error('INVALID_PLAN_TIME');
  const now = localParts(input.now, input.timezone);
  const first = Math.max(dateValue(input.startDate), dateValue(input.semesterStart), dateValue(now.date));
  const last = Math.min(dateValue(input.endDate), dateValue(input.semesterEnd));
  const excluded = new Set(input.excludedDates);
  const weeks = new Map<string, number>();
  if (first <= last) {
    for (let at = first; at <= last; at += dayMs) {
      const date = new Date(at).toISOString().slice(0, 10);
      if (excluded.has(date)) continue;
      const start = date === now.date && now.time > input.dailyStart ? now.time : input.dailyStart;
      const end = input.dailyEnd;
      if (start > end) continue;
      const week = mondayOf(date);
      weeks.set(week, (weeks.get(week) ?? 0) + 1);
    }
  }
  const availableSlots = [...weeks.values()].reduce((sum, days) => sum + Math.min(days * (input.rules.dailyLimit ?? 1), input.rules.weeklyLimit), 0);
  // Both categories share daily/weekly slots; neither assumes future certification.
  const maximumMinutes = input.rules.maximumMinutes ?? 60;
  const requiredSlots = Math.ceil(input.rules.courseTarget / maximumMinutes) + Math.ceil(input.rules.generalTarget / maximumMinutes);
  return { availableSlots, requiredSlots, completable: availableSlots >= requiredSlots };
}
