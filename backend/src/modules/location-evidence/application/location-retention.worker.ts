import { Injectable } from '@nestjs/common';

import { AuditService, type AppendAuditInput } from '../../../common/audit/audit.service.js';
import { PrismaService } from '../../../common/database/prisma.service.js';
import { ApplicationError } from '../../../common/errors/application-error.js';
import { validRequestId } from '../../../common/http/request-id.js';
import { OutboxService } from '../../../common/outbox/outbox.service.js';
import { Clock } from '../../../common/time/clock.js';
import { IdGenerator } from '../../../common/time/id-generator.js';
import { Prisma } from '../../../generated/prisma/client.js';

type Transaction = Prisma.TransactionClient;

interface RawRetentionCandidate {
  id: string;
  organizationId: string;
  trackId: string;
  policyVersion: string;
}

interface CoarseRetentionCandidate {
  id: string;
  organizationId: string;
  trackId: string;
  policyVersion: string;
}

interface RawRetentionGroup {
  organizationId: string;
  trackId: string;
  policyVersion: string;
  sampleRowIds: string[];
}

type RetentionAuditInput = Omit<AppendAuditInput, 'actionType'> & {
  actionType: 'LOCATION_RETENTION_APPLIED';
};

type RetentionAuditAppend = (transaction: Transaction, input: RetentionAuditInput) => Promise<void>;

export interface LocationRetentionBatchResult {
  rawDeletedRowCount: number;
  coarseExpiredSummaryCount: number;
  retentionEventCount: number;
}

@Injectable()
export class LocationRetentionWorker {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly outbox: OutboxService,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async runBatch(limit: number, requestId: string): Promise<LocationRetentionBatchResult> {
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100 || !validRequestId(requestId)) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }

    return this.prisma.$transaction(async (transaction) => {
      const now = this.clock.now();
      const rawCandidates = await transaction.$queryRaw<RawRetentionCandidate[]>`
        SELECT sample.id,
               sample.organization_id AS "organizationId",
               sample.track_id AS "trackId",
               track.policy_version AS "policyVersion"
          FROM location_samples AS sample
          JOIN location_tracks AS track
            ON track.id = sample.track_id
           AND track.organization_id = sample.organization_id
         WHERE sample.raw_expires_at <= ${now}
         ORDER BY sample.raw_expires_at ASC, sample.id ASC
         FOR UPDATE OF sample SKIP LOCKED
         LIMIT ${limit}
      `;

      let rawDeletedRowCount = 0;
      let retentionEventCount = 0;
      for (const group of this.groupRawCandidates(rawCandidates)) {
        await transaction.locationSampleSecret.deleteMany({
          where: { sampleRowId: { in: group.sampleRowIds } },
        });
        const deleted = await transaction.locationSample.deleteMany({
          where: { id: { in: group.sampleRowIds } },
        });
        if (deleted.count !== group.sampleRowIds.length) {
          throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
            invariant: 'LOCATION_RAW_RETENTION_DELETE_COUNT_MISMATCH',
          });
        }
        rawDeletedRowCount += deleted.count;
        await this.appendRetentionEvidence(transaction, {
          organizationId: group.organizationId,
          trackId: group.trackId,
          policyVersion: group.policyVersion,
          dataClass: 'RAW',
          deletedRowCount: deleted.count,
          deletedAt: now,
          requestId,
        });
        retentionEventCount += 1;
      }

      const remaining = limit - rawCandidates.length;
      let coarseExpiredSummaryCount = 0;
      if (remaining > 0) {
        const coarseCandidates = await transaction.$queryRaw<CoarseRetentionCandidate[]>`
          SELECT summary.id,
                 summary.organization_id AS "organizationId",
                 summary.track_id AS "trackId",
                 summary.policy_version AS "policyVersion"
            FROM location_summaries AS summary
           WHERE summary.availability = 'AVAILABLE'
             AND summary.expires_at <= ${now}
           ORDER BY summary.expires_at ASC, summary.id ASC
           FOR UPDATE OF summary SKIP LOCKED
           LIMIT ${remaining}
        `;

        for (const candidate of coarseCandidates) {
          const updated = await transaction.locationSummary.updateMany({
            where: {
              id: candidate.id,
              availability: 'AVAILABLE',
              expiresAt: { lte: now },
            },
            data: {
              availability: 'EXPIRED',
              coarseRoutePolyline: null,
              coarseDistanceMeters: null,
              observedStartAt: null,
              observedEndAt: null,
              qualityFlags: [],
              updatedAt: now,
              version: { increment: 1 },
            },
          });
          if (updated.count !== 1) {
            throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
              invariant: 'LOCATION_COARSE_RETENTION_UPDATE_COUNT_MISMATCH',
            });
          }
          coarseExpiredSummaryCount += 1;
          await this.appendRetentionEvidence(transaction, {
            organizationId: candidate.organizationId,
            trackId: candidate.trackId,
            policyVersion: candidate.policyVersion,
            dataClass: 'COARSE',
            deletedRowCount: 1,
            deletedAt: now,
            requestId,
          });
          retentionEventCount += 1;
        }
      }

      return {
        rawDeletedRowCount,
        coarseExpiredSummaryCount,
        retentionEventCount,
      };
    });
  }

  private groupRawCandidates(
    candidates: readonly RawRetentionCandidate[],
  ): readonly RawRetentionGroup[] {
    const groups = new Map<string, RawRetentionGroup>();
    for (const candidate of candidates) {
      const key = `${candidate.organizationId}\u0000${candidate.trackId}\u0000${candidate.policyVersion}`;
      const current = groups.get(key);
      if (current === undefined) {
        groups.set(key, {
          organizationId: candidate.organizationId,
          trackId: candidate.trackId,
          policyVersion: candidate.policyVersion,
          sampleRowIds: [candidate.id],
        });
      } else {
        current.sampleRowIds.push(candidate.id);
      }
    }
    return [...groups.values()];
  }

  private async appendRetentionEvidence(
    transaction: Transaction,
    input: {
      organizationId: string;
      trackId: string;
      policyVersion: string;
      dataClass: 'RAW' | 'COARSE';
      deletedRowCount: number;
      deletedAt: Date;
      requestId: string;
    },
  ): Promise<void> {
    const eventId = this.idGenerator.next();
    await transaction.locationRetentionEvent.create({
      data: {
        id: eventId,
        organizationId: input.organizationId,
        trackId: input.trackId,
        dataClass: input.dataClass,
        deletedRowCount: input.deletedRowCount,
        policyVersion: input.policyVersion,
        requestId: input.requestId,
        deletedAt: input.deletedAt,
      },
    });

    // Keep retention audit typing local and omit safeMetadata so no location detail can leak.
    const appendAudit: RetentionAuditAppend = this.audit.append.bind(this.audit);
    await appendAudit(transaction, {
      organizationId: input.organizationId,
      actorUserId: null,
      actorRoleSnapshot: null,
      permissionId: 'LOCATION-RETENTION-WORKER',
      actionType: 'LOCATION_RETENTION_APPLIED',
      targetType: 'LOCATION_TRACK',
      targetId: input.trackId,
      requestId: input.requestId,
      outcome: 'SUCCEEDED',
    });

    await this.outbox.append(transaction, {
      organizationId: input.organizationId,
      aggregateType: 'LOCATION_RETENTION_EVENT',
      aggregateId: eventId,
      eventType: 'LOCATION_RETENTION_APPLIED',
      eventVersion: 1,
      payload: {
        retentionEventId: eventId,
        trackId: input.trackId,
        dataClass: input.dataClass,
        deletedRowCount: input.deletedRowCount,
        policyVersion: input.policyVersion,
        deletedAt: input.deletedAt.toISOString(),
        requestId: input.requestId,
      },
    });
  }
}
