import type { ProbeInputs, ProbeRequest } from './probe-inputs.mjs';
export function probeOcrDraftApi(input: Pick<ProbeInputs, 'baseUrl' | 'prisma' | 'fixture' | 'teacherToken' | 'adminToken' | 'otherTeacherTokens' | 'batchId' | 'pageId'> & { request: ProbeRequest }): Promise<void>;
