// Approved values from docs/business/30-admin-flow.md section 19.2.
export const approvedRuleTemplate = {
  ruleSet: 'V8_1', totalTargetMinutes: 1200, minimumMinutesOptions: [30, 45, 60], defaultMinimumMinutes: 30,
  weeklyLimitOptions: [2, 3, 4], defaultWeeklyLimit: 3, maximumCreditedMinutes: 60, dailyLimit: 1,
  creditedUnit: 'WHOLE_MINUTE', supplementHours: 24, specialSupplementHours: 72, closingDays: 7,
} as const;
