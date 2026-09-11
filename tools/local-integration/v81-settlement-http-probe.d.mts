import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function seedHistoricalSettlementRules(input: Pick<ProbeInputs, 'prisma' | 'fixture'>): Promise<void>;
export function probeSettlementHttp(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'teacherToken' | 'adminToken' | 'otherTeacherTokens' | 'outside'> & { request: ProbeRequest }): Promise<void>;
