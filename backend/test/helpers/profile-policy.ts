import type { PrismaService } from '../../src/common/database/prisma.service.js';

// Valid profile fixture for role-policy unit tests. Real readiness denials are covered by HTTP tests.
export function readyProfileDatabase(): PrismaService {
  return {
    studentProfile: { findFirst: async () => ({
      id: '10000000-0000-4000-8000-000000000001', organizationId: '10000000-0000-4000-8000-000000000002',
      version: 1, studentNumber: '2300000001', fullName: 'Synthetic Student', gender: 'MALE', gradeYear: 2026,
      collegeName: 'SCC', majorName: 'JC', dateOfBirth: '2004-01-01', regionCode: 'HK',
    }) },
    $queryRaw: async () => [],
  } as unknown as PrismaService;
}
