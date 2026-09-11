import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeMakeupHttp(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'teacherToken' | 'adminToken' | 'otherTeacherTokens'> & Partial<Pick<ProbeInputs, 'readMailboxJson'>> & { request: ProbeRequest<string | null> }): Promise<void>;
