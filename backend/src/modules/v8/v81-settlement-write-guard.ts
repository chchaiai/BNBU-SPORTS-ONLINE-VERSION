import type { Prisma } from '../../generated/prisma/client.js';
import { ApplicationError } from '../../common/errors/application-error.js';

// Call after resource authorization and while holding the organization mutation lock.
// A receipt replay is handled before this check by the existing idempotency owner.
export async function requireUnsettledCourse(tx: Prisma.TransactionClient, organizationId: string, classSectionId: string) {
  const reports = await tx.$queryRaw<{ id: string }[]>`SELECT id FROM v81_settlement_report_revisions
    WHERE organization_id=${organizationId}::uuid AND class_section_id=${classSectionId}::uuid LIMIT 1`;
  if (reports.length) throw new ApplicationError('CONFLICT_STATE_TRANSITION', 409,
    { reason: 'SETTLED_FACT_CORRECTION_REQUIRED' });
}
