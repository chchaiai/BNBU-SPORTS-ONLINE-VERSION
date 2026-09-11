import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeSemesterSwitch(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'adminToken' | 'teacherToken' | 'targetId'> & Partial<Pick<ProbeInputs, 'targetVersion'>> & { request: ProbeRequest }): Promise<void>;
