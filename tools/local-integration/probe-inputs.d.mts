import type { PrismaClient } from '../../backend/src/generated/prisma/client.js';
import type { FoundationFixture } from '../../backend/test/helpers/database.js';
import type { seedExerciseSessionStudent } from '../../backend/test/helpers/exercise-session.js';
export type ProbeStudent = Awaited<ReturnType<typeof seedExerciseSessionStudent>>;
export type ProbeRequest<Token = string> = (path: string, token: Token, input?: Record<string, unknown>, key?: string) => Promise<Record<string, unknown> | unknown[]>;
export interface ProbeInputs {
  prisma: PrismaClient;
  fixture: FoundationFixture;
  request: ProbeRequest;
  baseUrl: string;
  teacherToken: string;
  adminToken: string;
  token: string;
  otherTeacherTokens: { token: string; role?: string }[];
  otherTeacherToken: string;
  readMailboxJson: (url: string) => Promise<unknown>;
  processMedia: () => Promise<boolean>;
  outside: ProbeStudent;
  student: ProbeStudent;
  batchId: string;
  pageId: string;
  targetId: string;
  targetVersion: number;
  confirmed: Record<string, unknown>;
  localStorage: { endpoint: string; accessKeyId: string; secretAccessKey: string; bucket: string };
}
