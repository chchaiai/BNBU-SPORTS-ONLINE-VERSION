import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probePhysicalCorrection(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'outside' | 'teacherToken' | 'adminToken' | 'otherTeacherTokens'> & Partial<Pick<ProbeInputs, 'readMailboxJson'>> & { request: ProbeRequest<string | null> }): Promise<void>;
