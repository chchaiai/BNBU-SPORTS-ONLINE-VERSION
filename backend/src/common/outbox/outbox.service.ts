import { Injectable } from '@nestjs/common';

import { Prisma } from '../../generated/prisma/client.js';
import { PrismaService } from '../database/prisma.service.js';
import { ApplicationError } from '../errors/application-error.js';
import { Clock } from '../time/clock.js';
import { IdGenerator } from '../time/id-generator.js';

export interface AppendOutboxInput {
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: Record<string, unknown>;
  availableAt?: Date;
}

export interface ClaimedOutboxEvent {
  id: string;
  organizationId: string;
  aggregateType: string;
  aggregateId: string;
  eventType: string;
  eventVersion: number;
  payload: unknown;
  attempts: number;
}

interface ClaimedOutboxRow {
  id: string;
  organization_id: string;
  aggregate_type: string;
  aggregate_id: string;
  event_type: string;
  event_version: number;
  payload: unknown;
  attempts: number;
}

@Injectable()
export class OutboxService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly clock: Clock,
    private readonly idGenerator: IdGenerator,
  ) {}

  async append(transaction: Prisma.TransactionClient, input: AppendOutboxInput): Promise<string> {
    if (input.eventVersion < 1 || !Number.isSafeInteger(input.eventVersion)) {
      throw new ApplicationError('SYSTEM_DATA_INTEGRITY_ERROR', 500, {
        invariant: 'OUTBOX_EVENT_VERSION_INVALID',
      });
    }
    const id = this.idGenerator.next();
    const now = this.clock.now();
    await transaction.outboxEvent.create({
      data: {
        id,
        organizationId: input.organizationId,
        aggregateType: input.aggregateType,
        aggregateId: input.aggregateId,
        eventType: input.eventType,
        eventVersion: input.eventVersion,
        payload: input.payload as Prisma.InputJsonValue,
        status: 'PENDING',
        availableAt: input.availableAt ?? now,
        createdAt: now,
      },
    });
    return id;
  }

  async claimBatch(workerId: string, limit: number): Promise<ClaimedOutboxEvent[]> {
    if (
      !/^[A-Za-z0-9._:-]{1,128}$/.test(workerId) ||
      !Number.isInteger(limit) ||
      limit < 1 ||
      limit > 100
    ) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
    const now = this.clock.now();
    const rows = await this.prisma.$transaction(
      (transaction) =>
        transaction.$queryRaw<ClaimedOutboxRow[]>`
        WITH candidates AS (
          SELECT id
          FROM outbox_events
          WHERE status IN ('PENDING', 'FAILED')
            AND available_at <= ${now}
          ORDER BY available_at ASC, id ASC
          FOR UPDATE SKIP LOCKED
          LIMIT ${limit}
        )
        UPDATE outbox_events AS event
        SET status = 'PROCESSING',
            locked_at = ${now},
            locked_by = ${workerId},
            attempts = event.attempts + 1
        FROM candidates
        WHERE event.id = candidates.id
        RETURNING event.id,
                  event.organization_id,
                  event.aggregate_type,
                  event.aggregate_id,
                  event.event_type,
                  event.event_version,
                  event.payload,
                  event.attempts
      `,
    );

    return rows.map((row) => ({
      id: row.id,
      organizationId: row.organization_id,
      aggregateType: row.aggregate_type,
      aggregateId: row.aggregate_id,
      eventType: row.event_type,
      eventVersion: row.event_version,
      payload: row.payload,
      attempts: row.attempts,
    }));
  }

  async markProcessed(eventId: string, workerId: string): Promise<void> {
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, status: 'PROCESSING', lockedBy: workerId },
      data: {
        status: 'PROCESSED',
        lockedAt: null,
        lockedBy: null,
        processedAt: this.clock.now(),
      },
    });
    if (result.count !== 1) {
      throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409);
    }
  }

  async markFailed(
    eventId: string,
    workerId: string,
    errorCode: string,
    retryAt: Date,
  ): Promise<void> {
    if (!/^[A-Z][A-Z0-9_]*$/.test(errorCode) || retryAt < this.clock.now()) {
      throw new ApplicationError('VALIDATION_FORMAT_INVALID', 422);
    }
    const result = await this.prisma.outboxEvent.updateMany({
      where: { id: eventId, status: 'PROCESSING', lockedBy: workerId },
      data: {
        status: 'FAILED',
        lockedAt: null,
        lockedBy: null,
        lastErrorCode: errorCode,
        availableAt: retryAt,
      },
    });
    if (result.count !== 1) {
      throw new ApplicationError('CONFLICT_UNSUPPORTED_RESOURCE_STATE', 409);
    }
  }
}
