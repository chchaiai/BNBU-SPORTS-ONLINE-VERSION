import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeRuleTemplates(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'adminToken' | 'teacherToken' | 'otherTeacherTokens'> & { request: ProbeRequest }): Promise<void>;
