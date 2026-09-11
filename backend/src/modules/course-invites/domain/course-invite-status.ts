export const COURSE_INVITE_STATUSES = ['ACTIVE', 'REVOKED', 'EXPIRED'] as const;
export type CourseInviteStatus = (typeof COURSE_INVITE_STATUSES)[number];
