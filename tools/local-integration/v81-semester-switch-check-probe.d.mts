import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeSemesterSwitchCheck(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'adminToken' | 'teacherToken' | 'targetId'> & { request: ProbeRequest }): Promise<void>;
