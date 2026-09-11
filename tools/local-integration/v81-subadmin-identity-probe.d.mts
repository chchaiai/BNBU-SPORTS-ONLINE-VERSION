import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeSubadminIdentity(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'adminToken' | 'teacherToken'> & Partial<Pick<ProbeInputs, 'readMailboxJson'>> & { request: ProbeRequest<string | null> }): Promise<void>;
