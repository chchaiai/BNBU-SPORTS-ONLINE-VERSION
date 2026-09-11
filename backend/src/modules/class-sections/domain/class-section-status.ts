export const CLASS_SECTION_STATUSES = ['UPCOMING', 'ACTIVE', 'CLOSED', 'ARCHIVED'] as const;
export type ClassSectionStatus = (typeof CLASS_SECTION_STATUSES)[number];

export const CHECK_IN_WINDOW_MODES = ['AVAILABLE', 'UNAVAILABLE'] as const;
export type CheckInWindowMode = (typeof CHECK_IN_WINDOW_MODES)[number];

export function isClassSectionStatus(value: string): value is ClassSectionStatus {
  return (CLASS_SECTION_STATUSES as readonly string[]).includes(value);
}

export function isCheckInWindowMode(value: string): value is CheckInWindowMode {
  return (CHECK_IN_WINDOW_MODES as readonly string[]).includes(value);
}
