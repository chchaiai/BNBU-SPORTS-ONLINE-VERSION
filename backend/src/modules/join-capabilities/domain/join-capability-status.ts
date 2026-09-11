export const JOIN_CAPABILITY_STATUSES = ['ACTIVE', 'CONSUMED', 'EXPIRED'] as const;
export type JoinCapabilityStatus = (typeof JOIN_CAPABILITY_STATUSES)[number];
