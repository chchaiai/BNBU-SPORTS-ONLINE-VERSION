import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeMakeupSession(input: Pick<ProbeInputs, 'prisma' | 'fixture' | 'baseUrl' | 'teacherToken' | 'adminToken' | 'processMedia'> & Partial<Pick<ProbeInputs, 'otherTeacherTokens' | 'readMailboxJson'>> & { request: ProbeRequest<string | null> }): Promise<void>;
