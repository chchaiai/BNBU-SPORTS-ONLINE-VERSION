import type { Prisma } from '../../generated/prisma/client.js';
import type { OcrConfiguration } from './tencent-ocr-provider.js';

export type OcrServiceRevision = { id: string; organization_id: string; version: number; provider: 'DISABLED' | 'TENCENT_TABLE_V3';
  region: string | null; timeout_ms: number; enabled: boolean; reason: string; actor_id: string; created_at: Date };
export async function currentOcrService(tx: Pick<Prisma.TransactionClient, '$queryRaw'>, organizationId: string, fallback?: OcrConfiguration) {
  const row = (await tx.$queryRaw<OcrServiceRevision[]>`SELECT * FROM v81_ocr_service_revisions
    WHERE organization_id=${organizationId}::uuid ORDER BY version DESC LIMIT 1`)[0];
  const configured = fallback?.provider === 'TENCENT_TABLE_V3' ? fallback : null;
  const provider = row?.provider ?? fallback?.provider ?? 'DISABLED';
  return { revision: row ?? null, id: row?.id ?? null, version: row?.version ?? 0, provider,
    region: row ? row.region : configured?.region ?? null, timeoutMs: row?.timeout_ms ?? configured?.timeoutMs ?? 20000,
    enabled: row?.enabled ?? provider !== 'DISABLED' };
}
