import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeRuntimeArchive(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'adminToken' | 'teacherToken'> & Partial<Pick<ProbeInputs, 'localStorage'>> & { request: ProbeRequest }): Promise<void>;
