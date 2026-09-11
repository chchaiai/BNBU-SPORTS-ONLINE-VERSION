import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeAuditEvents(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'adminToken' | 'teacherToken'> & { request: ProbeRequest }): Promise<void>;
