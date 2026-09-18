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
  maximumMinutes?: number;
}
export interface CreditRules {
  minimumMinutes: number;
  maximumMinutes?: number;
  weeklyLimit: number;
  dailyLimit?: number;
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
export function eligibleMinutes(actualSeconds: number, minimumMinutes: number, maximumMinutes = 60): number {
  if (!Number.isSafeInteger(actualSeconds) || actualSeconds < 0)
    throw new Error('INVALID_DURATION');
  if (!Number.isInteger(minimumMinutes) || minimumMinutes < 1 || minimumMinutes > 1440) throw new Error('INVALID_THRESHOLD');
  if (!Number.isInteger(maximumMinutes) || maximumMinutes < 1 || maximumMinutes > 1440) throw new Error('INVALID_MAXIMUM');
  const minutes = Math.floor(actualSeconds / 60);
  return minutes < minimumMinutes ? 0 : Math.min(minutes, maximumMinutes);
}
export function validateCreditRules(rules: CreditRules): void {
  if (
    !Number.isInteger(rules.minimumMinutes) || rules.minimumMinutes < 1 || rules.minimumMinutes > 1440 ||
    !Number.isSafeInteger(rules.weeklyLimit) || rules.weeklyLimit < 1 || rules.weeklyLimit > 2147483647 ||
    !Number.isSafeInteger(rules.dailyLimit ?? 1) ||
    (rules.dailyLimit ?? 1) < 1 ||
    (rules.dailyLimit ?? 1) > 2147483647 ||
    !Number.isInteger(rules.courseTarget) ||
    !Number.isInteger(rules.generalTarget) ||
    rules.courseTarget < 0 ||
    rules.generalTarget < 0 ||
    rules.courseTarget + rules.generalTarget < 1 || rules.courseTarget + rules.generalTarget > 2147483647 ||
    (rules.maximumMinutes !== undefined && (!Number.isInteger(rules.maximumMinutes) || rules.maximumMinutes < rules.minimumMinutes || rules.maximumMinutes > 1440))
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
  reserved: { days: ReadonlyMap<string, number>; weeks: ReadonlyMap<string, number> } = { days: new Map(), weeks: new Map() },
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
    if (item.valid && eligibleMinutes(item.actualSeconds, rules.minimumMinutes, item.maximumMinutes) > 0) {
      const group = days.get(item.businessDate) ?? [];
      group.push(index);
      days.set(item.businessDate, group);
    }
  });
  const orderedDays = [...days].sort(([a], [b]) => a.localeCompare(b));
  const amountOf = (index: number) => eligibleMinutes(sorted[index]!.actualSeconds, rules.minimumMinutes, sorted[index]!.maximumMinutes);
  // A feasible solution is only a lower bound. Never use it as the answer:
  // equal-scoring states retain the historical and chronological tie breakers.
  const usedDays = new Map(reserved.days), usedWeeks = new Map(reserved.weeks);
  let lowerCourse = recognized.course, lowerGeneral = recognized.general;
  for (const index of [...days.values()].flat().sort((a,b) => amountOf(b)-amountOf(a) || a-b)) {
    const record = sorted[index]!, week = mondayOf(record.businessDate);
    if ((usedDays.get(record.businessDate) ?? 0) >= (rules.dailyLimit ?? 1) || (usedWeeks.get(week) ?? 0) >= rules.weeklyLimit) continue;
    const course = record.category === 'COURSE_RELATED' ? Math.min(rules.courseTarget, lowerCourse + amountOf(index)) : lowerCourse;
    const general = record.category === 'GENERAL' ? Math.min(rules.generalTarget, lowerGeneral + amountOf(index)) : lowerGeneral;
    if (course + general === lowerCourse + lowerGeneral) continue;
    lowerCourse = course; lowerGeneral = general;
    usedDays.set(record.businessDate, (usedDays.get(record.businessDate) ?? 0)+1);
    usedWeeks.set(week, (usedWeeks.get(week) ?? 0)+1);
  }
  const lowerBound = lowerCourse + lowerGeneral;
  // Relax category caps when bounding remaining minutes. Per-day and per-week
  // maxima are admissible upper bounds, so only strictly inferior totals go.
  const futureBudget = (after: number, currentWeek: string) => {
    const weeks = new Map<string, number[]>();
    for (const [date, indices] of orderedDays.slice(after + 1)) {
      const week = mondayOf(date);
      const values = indices.map(amountOf).sort((a,b)=>b-a).slice(0, Math.max(0,(rules.dailyLimit ?? 1)-(reserved.days.get(date) ?? 0)));
      weeks.set(week, [...(weeks.get(week) ?? []), ...values]);
    }
    let later = 0;
    for (const [week, values] of weeks) {
      values.sort((a,b)=>b-a);
      if (week !== currentWeek) later += values.slice(0, Math.max(0,rules.weeklyLimit-(reserved.weeks.get(week) ?? 0))).reduce((a,b)=>a+b,0);
    }
    const current = weeks.get(currentWeek) ?? [];
    const prefix = [0]; for (const value of current) prefix.push(prefix[prefix.length-1]!+value);
    return (count: number) => later + prefix[Math.min(current.length, Math.max(0,rules.weeklyLimit-(reserved.weeks.get(currentWeek) ?? 0)-count))]!;
  };
  // If both targets and every historical selection can be retained, an
  // include-first search gives the exact chronological winner. Otherwise the
  // full dynamic program below resolves displacement and all tie breakers.
  let saturated: State | undefined;
  if (lowerBound === rules.courseTarget + rules.generalTarget &&
      sorted.every((r,i) => i === 0 || r.businessDate >= sorted[i-1]!.businessDate)) {
    const indices = [...days.values()].flat().sort((a,b)=>a-b);
    const countsDay = new Map(reserved.days), countsWeek = new Map(reserved.weeks);
    const seen = new Set<string>();
    const historicalCount = indices.filter(i => sorted[i]!.previouslySelected).length;
    const search = (position: number, state: State): boolean => {
      if (state.course + state.general === lowerBound) {
        if (state.previousCount !== historicalCount) return false;
        saturated = state; return true;
      }
      if (position >= indices.length) return false;
      const index = indices[position]!, record = sorted[index]!, date = record.businessDate, week = mondayOf(date);
      const key = `${position}:${state.course}:${state.general}:${state.previousCount}:${countsDay.get(date) ?? 0}:${countsWeek.get(week) ?? 0}`;
      if (seen.has(key)) return false;
      let course = state.course, general = state.general;
      const budgets = new Map<string, number[]>();
      const dayValues = new Map<string, number[]>();
      for (const remaining of indices.slice(position)) {
        const row = sorted[remaining]!, amount = amountOf(remaining);
        if (row.category === 'COURSE_RELATED') course += amount; else general += amount;
        dayValues.set(row.businessDate, [...(dayValues.get(row.businessDate) ?? []), amount]);
      }
      if (course < rules.courseTarget || general < rules.generalTarget) return false;
      for (const [day,values] of dayValues) {
        const w = mondayOf(day);
        budgets.set(w, [...(budgets.get(w) ?? []), ...values.sort((a,b)=>b-a).slice(0,Math.max(0,(rules.dailyLimit ?? 1)-(countsDay.get(day) ?? 0)))]);
      }
      let possible = state.course + state.general;
      for (const [w,values] of budgets) possible += values.sort((a,b)=>b-a).slice(0,Math.max(0,rules.weeklyLimit-(countsWeek.get(w) ?? 0))).reduce((a,b)=>a+b,0);
      if (possible < lowerBound) return false;
      course = record.category === 'COURSE_RELATED' ? Math.min(rules.courseTarget,state.course+amountOf(index)) : state.course;
      general = record.category === 'GENERAL' ? Math.min(rules.generalTarget,state.general+amountOf(index)) : state.general;
      const dc = countsDay.get(date) ?? 0, wc = countsWeek.get(week) ?? 0;
      if (course + general > state.course + state.general && dc < (rules.dailyLimit ?? 1) && wc < rules.weeklyLimit) {
        countsDay.set(date,dc+1); countsWeek.set(week,wc+1);
        if (search(position+1,{course,general,weekCount:wc+1,previousCount:state.previousCount+Number(record.previouslySelected),chosen:[...state.chosen,index]})) return true;
        countsDay.set(date,dc); countsWeek.set(week,wc);
      }
      if (!record.previouslySelected && search(position+1,state)) return true;
      seen.add(key); return false;
    };
    search(0,{course:recognized.course,general:recognized.general,weekCount:0,previousCount:0,chosen:[]});
  }
  let states = new Map<string, State>();
  retain(states, {
    course: recognized.course,
    general: recognized.general,
    weekCount: 0,
    previousCount: 0,
    chosen: [],
  });
  let week: string | undefined;
  for (const [dayIndex, [date, records]] of orderedDays.entries()) {
    if (saturated) break;
    const nextWeek = mondayOf(date);
    if (week !== nextWeek) {
      const reset = new Map<string, State>();
      for (const state of states.values()) retain(reset, { ...state, weekCount: 0 });
      states = reset;
      week = nextWeek;
    }
    // Track today's count separately; each record is considered once.
    let daily = new Map<string, { state: State; count: number }>();
    for (const state of states.values()) {
      daily.set(`${state.course}:${state.general}:${state.weekCount}:0`, { state, count: 0 });
    }
    for (const index of records) {
      const next = new Map(daily);
      for (const { state, count } of daily.values()) {
        if (state.weekCount + (reserved.weeks.get(nextWeek) ?? 0) >= rules.weeklyLimit ||
          count + (reserved.days.get(date) ?? 0) >= (rules.dailyLimit ?? 1)) continue;
        const record = sorted[index]!;
        const amount = eligibleMinutes(record.actualSeconds, rules.minimumMinutes, record.maximumMinutes);
        const course =
          record.category === 'COURSE_RELATED'
            ? Math.min(rules.courseTarget, state.course + amount)
            : state.course;
        const general =
          record.category === 'GENERAL'
            ? Math.min(rules.generalTarget, state.general + amount)
            : state.general;
        if (course === state.course && general === state.general) continue;
        const candidate: State = {
          course,
          general,
          weekCount: state.weekCount + 1,
          previousCount: state.previousCount + Number(record.previouslySelected),
          chosen: [...state.chosen, index].sort((a, b) => a - b),
        };
        const key = `${course}:${general}:${candidate.weekCount}:${count + 1}`;
        const existing = next.get(key);
        if (!existing || preferred(candidate, existing.state)) {
          next.set(key, { state: candidate, count: count + 1 });
        }
      }
      daily = next;
    }
    states = new Map();
    const remaining = futureBudget(dayIndex, nextWeek);
    for (const { state } of daily.values()) {
      if (state.course + state.general + remaining(state.weekCount) >= lowerBound) retain(states, state);
    }
  }
  let best: State | undefined = saturated;
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
    const eligible = eligibleMinutes(record.actualSeconds, rules.minimumMinutes, record.maximumMinutes);
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
