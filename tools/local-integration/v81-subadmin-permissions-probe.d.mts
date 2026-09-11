import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeSubadminPermissions(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'adminToken' | 'teacherToken'> & { request: ProbeRequest<string | null> }): Promise<void>;
