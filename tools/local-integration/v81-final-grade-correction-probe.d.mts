import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeFinalGradeCorrection(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'student' | 'teacherToken' | 'adminToken' | 'token' | 'otherTeacherTokens'> & { request: ProbeRequest }): Promise<void>;
