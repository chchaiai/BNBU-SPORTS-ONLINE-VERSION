/** V8.1 overview 11.3. Input is scoped to one student and one course. */
export type CreditCategory = 'COURSE_RELATED' | 'GENERAL';
export interface CreditCandidate {
  id: string;
  category: CreditCategory;
  startedAt: string;
  businessDate: string;
  actualSeconds: number;
  valid: boolean;
  previouslySelected: boolean;
}
export interface CreditRules {
  minimumMinutes: 30 | 45 | 60;
  weeklyLimit: 2 | 3 | 4;
  courseTarget: number;
  generalTarget: number;
}
interface State {
  course: number;
  general: number;
  weekCount: number;
  previousCount: number;
  chosen: number[];
}
export function eligibleMinutes(actualSeconds: number, minimumMinutes: number): number {
  if (!Number.isSafeInteger(actualSeconds) || actualSeconds < 0)
    throw new Error('INVALID_DURATION');
  if (![30, 45, 60].includes(minimumMinutes)) throw new Error('INVALID_THRESHOLD');
  const minutes = Math.floor(actualSeconds / 60);
  return minutes < minimumMinutes ? 0 : Math.min(minutes, 60);
}
export function validateCreditRules(rules: CreditRules): void {
  if (
    ![30, 45, 60].includes(rules.minimumMinutes) ||
    ![2, 3, 4].includes(rules.weeklyLimit) ||
    !Number.isInteger(rules.courseTarget) ||
    !Number.isInteger(rules.generalTarget) ||
    rules.courseTarget < 0 ||
    rules.generalTarget < 0 ||
    rules.courseTarget + rules.generalTarget !== 1200
  )
    throw new Error('INVALID_COURSE_RULES');
}
export function mondayOf(businessDate: string): string {
  const day = new Date(`${businessDate}T00:00:00Z`);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(businessDate) ||
    !Number.isFinite(day.getTime()) ||
    day.toISOString().slice(0, 10) !== businessDate
  )
    throw new Error('INVALID_BUSINESS_DATE');
  day.setUTCDate(day.getUTCDate() - ((day.getUTCDay() + 6) % 7));
  return day.toISOString().slice(0, 10);
}
function preferred(a: State, b: State): boolean {
  if (a.previousCount !== b.previousCount) return a.previousCount > b.previousCount;
  const length = Math.min(a.chosen.length, b.chosen.length);
  for (let index = 0; index < length; index++) {
    if (a.chosen[index] !== b.chosen[index]) return a.chosen[index]! < b.chosen[index]!;
  }
  return a.chosen.length < b.chosen.length;
}
function retain(states: Map<string, State>, value: State): void {
  const key = `${value.course}:${value.general}:${value.weekCount}`;
  const existing = states.get(key);
  if (!existing || preferred(value, existing)) states.set(key, value);
}
export function selectCredits(
  candidates: readonly CreditCandidate[],
  rules: CreditRules,
  recognized: { course: number; general: number } = { course: 0, general: 0 },
) {
  validateCreditRules(rules);
  if (
    ![recognized.course, recognized.general].every(
      (value) => Number.isInteger(value) && value >= 0,
    ) ||
    recognized.course > rules.courseTarget ||
    recognized.general > rules.generalTarget
  ) {
    throw new Error('INVALID_RECOGNIZED_MINUTES');
  }
  if (new Set(candidates.map((item) => item.id)).size !== candidates.length)
    throw new Error('DUPLICATE_RECORD');
  const sorted = [...candidates].sort(
    (a, b) => a.startedAt.localeCompare(b.startedAt) || a.id.localeCompare(b.id),
  );
  const days = new Map<string, number[]>();
  sorted.forEach((item, index) => {
    mondayOf(item.businessDate);
    if (!Number.isFinite(Date.parse(item.startedAt))) throw new Error('INVALID_START_TIME');
    if (!['COURSE_RELATED', 'GENERAL'].includes(item.category)) throw new Error('INVALID_CATEGORY');
    if (item.valid && eligibleMinutes(item.actualSeconds, rules.minimumMinutes) > 0) {
      const group = days.get(item.businessDate) ?? [];
      group.push(index);
      days.set(item.businessDate, group);
    }
  });
  let states = new Map<string, State>();
  retain(states, {
    course: recognized.course,
    general: recognized.general,
    weekCount: 0,
    previousCount: 0,
    chosen: [],
  });
  let week: string | undefined;
  for (const [date, records] of [...days].sort(([a], [b]) => a.localeCompare(b))) {
    const nextWeek = mondayOf(date);
    if (week !== nextWeek) {
      const reset = new Map<string, State>();
      for (const state of states.values()) retain(reset, { ...state, weekCount: 0 });
      states = reset;
      week = nextWeek;
    }
    // Read only yesterday's states so at most one record can be chosen per day.
    const next = new Map(states);
    for (const state of states.values()) {
      if (state.weekCount >= rules.weeklyLimit) continue;
      for (const index of records) {
        const record = sorted[index]!;
        const amount = eligibleMinutes(record.actualSeconds, rules.minimumMinutes);
        const course =
          record.category === 'COURSE_RELATED'
            ? Math.min(rules.courseTarget, state.course + amount)
            : state.course;
        const general =
          record.category === 'GENERAL'
            ? Math.min(rules.generalTarget, state.general + amount)
            : state.general;
        if (course === state.course && general === state.general) continue;
        retain(next, {
          course,
          general,
          weekCount: state.weekCount + 1,
          previousCount: state.previousCount + Number(record.previouslySelected),
          chosen: [...state.chosen, index].sort((a, b) => a - b),
        });
      }
    }
    states = next;
  }
  let best: State | undefined;
  for (const state of states.values()) {
    if (
      !best ||
      state.course + state.general > best.course + best.general ||
      (state.course + state.general === best.course + best.general && preferred(state, best))
    )
      best = state;
  }
  const selected = new Set(best!.chosen);
  let courseRemaining = rules.courseTarget - recognized.course;
  let generalRemaining = rules.generalTarget - recognized.general;
  const records = sorted.map((record, index) => {
    const eligible = eligibleMinutes(record.actualSeconds, rules.minimumMinutes);
    let credited = 0;
    if (selected.has(index)) {
      if (record.category === 'COURSE_RELATED') {
        credited = Math.min(eligible, courseRemaining);
        courseRemaining -= credited;
      } else {
        credited = Math.min(eligible, generalRemaining);
        generalRemaining -= credited;
      }
    }
    return {
      id: record.id,
      selected: selected.has(index),
      eligibleMinutes: eligible,
      creditedMinutes: credited,
      reason: !record.valid
        ? 'NOT_VALID'
        : eligible === 0
          ? 'BELOW_THRESHOLD'
          : credited < eligible
            ? 'CREDIT_LIMIT'
            : null,
    };
  });
  return {
    courseMinutes: best!.course,
    generalMinutes: best!.general,
    totalMinutes: best!.course + best!.general,
    records,
  };
}
