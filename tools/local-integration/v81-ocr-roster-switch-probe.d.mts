import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeOcrRosterSwitch(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'teacherToken' | 'adminToken' | 'otherTeacherToken' | 'confirmed'> & { request: ProbeRequest }): Promise<void>;
