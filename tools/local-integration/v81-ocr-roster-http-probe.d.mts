import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeOcrRosterHttp(input: Pick<ProbeInputs, 'baseUrl' | 'prisma' | 'fixture' | 'teacherToken' | 'adminToken' | 'otherTeacherTokens' | 'batchId'> & { request: ProbeRequest }): Promise<void>;
