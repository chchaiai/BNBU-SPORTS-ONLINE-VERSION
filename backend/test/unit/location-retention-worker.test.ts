import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import type { AuditService } from '../../src/common/audit/audit.service.js';
import type { PrismaService } from '../../src/common/database/prisma.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import type { OutboxService } from '../../src/common/outbox/outbox.service.js';
import { FixedClock } from '../../src/common/time/clock.js';
import { IdGenerator } from '../../src/common/time/id-generator.js';
import { LocationRetentionWorker } from '../../src/modules/location-evidence/application/location-retention.worker.js';

const NOW = new Date('2026-08-06T12:00:00.000Z');
const ORGANIZATION_ID = '0198c74b-7dc0-7000-8000-000000000001';
const RAW_TRACK_ID = '0198c74b-7dc0-7000-8000-000000000002';
const COARSE_TRACK_ID = '0198c74b-7dc0-7000-8000-000000000003';
const RAW_SAMPLE_IDS = [
  '0198c74b-7dc0-7000-8000-000000000004',
  '0198c74b-7dc0-7000-8000-000000000005',
];
const SUMMARY_ID = '0198c74b-7dc0-7000-8000-000000000006';

class SequenceIds extends IdGenerator {
  private value = 100;

  next(): string {
    const suffix = this.value.toString(16).padStart(12, '0');
    this.value += 1;
    return `0198c74b-7dc0-7000-8000-${suffix}`;
  }
}

function record(value: unknown): Record<string, unknown> {
  assert.equal(typeof value, 'object');
  assert.notEqual(value, null);
  return value as Record<string, unknown>;
}

function dataFrom(value: unknown): Record<string, unknown> {
  return record(record(value).data);
}

interface Calls {
  operations: string[];
  rawSecretDeletes: Record<string, unknown>[];
  rawMetadataDeletes: Record<string, unknown>[];
  coarseUpdates: Record<string, unknown>[];
  retentionEvents: Record<string, unknown>[];
  audits: Record<string, unknown>[];
  outbox: Record<string, unknown>[];
  transactionCount: number;
}

function createHarness(options: { empty?: boolean } = {}): {
  worker: LocationRetentionWorker;
  calls: Calls;
} {
  const calls: Calls = {
    operations: [],
    rawSecretDeletes: [],
    rawMetadataDeletes: [],
    coarseUpdates: [],
    retentionEvents: [],
    audits: [],
    outbox: [],
    transactionCount: 0,
  };
  let queryNumber = 0;
  const transaction = {
    $queryRaw: (): Promise<unknown[]> => {
      queryNumber += 1;
      if (options.empty === true) return Promise.resolve([]);
      if (queryNumber === 1) {
        return Promise.resolve(
          RAW_SAMPLE_IDS.map((id) => ({
            id,
            organizationId: ORGANIZATION_ID,
            trackId: RAW_TRACK_ID,
            policyVersion: 'location-policy-v4',
          })),
        );
      }
      return Promise.resolve([
        {
          id: SUMMARY_ID,
          organizationId: ORGANIZATION_ID,
          trackId: COARSE_TRACK_ID,
          policyVersion: 'location-policy-v4',
        },
      ]);
    },
    locationSampleSecret: {
      deleteMany: (input: unknown): Promise<{ count: number }> => {
        calls.operations.push('DELETE_RAW_SECRETS');
        calls.rawSecretDeletes.push(record(input));
        return Promise.resolve({ count: RAW_SAMPLE_IDS.length });
      },
    },
    locationSample: {
      deleteMany: (input: unknown): Promise<{ count: number }> => {
        calls.operations.push('DELETE_RAW_METADATA');
        calls.rawMetadataDeletes.push(record(input));
        return Promise.resolve({ count: RAW_SAMPLE_IDS.length });
      },
    },
    locationSummary: {
      updateMany: (input: unknown): Promise<{ count: number }> => {
        calls.operations.push('EXPIRE_COARSE_SUMMARY');
        calls.coarseUpdates.push(record(input));
        return Promise.resolve({ count: 1 });
      },
    },
    locationRetentionEvent: {
      create: (input: unknown): Promise<Record<string, unknown>> => {
        const data = dataFrom(input);
        calls.retentionEvents.push(data);
        return Promise.resolve(data);
      },
    },
  };
  const prisma = {
    $transaction: async <T>(action: (tx: unknown) => Promise<T>): Promise<T> => {
      calls.transactionCount += 1;
      return action(transaction);
    },
  } as unknown as PrismaService;
  const audit = {
    append: (_transaction: unknown, input: unknown): Promise<void> => {
      calls.audits.push(record(input));
      return Promise.resolve();
    },
  } as unknown as AuditService;
  const outbox = {
    append: (_transaction: unknown, input: unknown): Promise<string> => {
      calls.outbox.push(record(input));
      return Promise.resolve('0198c74b-7dc0-7000-8000-000000000099');
    },
  } as unknown as OutboxService;
  return {
    worker: new LocationRetentionWorker(
      prisma,
      audit,
      outbox,
      new FixedClock(NOW),
      new SequenceIds(),
    ),
    calls,
  };
}

describe('LocationRetentionWorker', () => {
  it('deletes due raw secrets before metadata and expires coarse summaries atomically', async () => {
    const { worker, calls } = createHarness();

    const result = await worker.runBatch(10, 'location-retention-test');

    assert.deepEqual(result, {
      rawDeletedRowCount: 2,
      coarseExpiredSummaryCount: 1,
      retentionEventCount: 2,
    });
    assert.equal(calls.transactionCount, 1);
    assert.deepEqual(calls.operations, [
      'DELETE_RAW_SECRETS',
      'DELETE_RAW_METADATA',
      'EXPIRE_COARSE_SUMMARY',
    ]);
    assert.deepEqual(record(record(calls.rawSecretDeletes[0]).where).sampleRowId, {
      in: RAW_SAMPLE_IDS,
    });
    assert.deepEqual(record(record(calls.rawMetadataDeletes[0]).where).id, {
      in: RAW_SAMPLE_IDS,
    });

    const coarseData = dataFrom(calls.coarseUpdates[0]);
    assert.equal(coarseData.availability, 'EXPIRED');
    assert.equal(coarseData.coarseRoutePolyline, null);
    assert.equal(coarseData.coarseDistanceMeters, null);
    assert.equal(coarseData.observedStartAt, null);
    assert.equal(coarseData.observedEndAt, null);
    assert.deepEqual(coarseData.qualityFlags, []);

    assert.deepEqual(
      calls.retentionEvents.map((event) => [event.dataClass, event.deletedRowCount]),
      [
        ['RAW', 2],
        ['COARSE', 1],
      ],
    );
  });

  it('keeps audit and outbox evidence coordinate-free', async () => {
    const { worker, calls } = createHarness();
    await worker.runBatch(10, 'location-retention-evidence');

    assert.equal(calls.audits.length, 2);
    assert.equal(calls.outbox.length, 2);
    for (const audit of calls.audits) {
      assert.equal(audit.actionType, 'LOCATION_RETENTION_APPLIED');
      assert.equal(Object.hasOwn(audit, 'safeMetadata'), false);
    }
    for (const outbox of calls.outbox) {
      assert.equal(outbox.aggregateType, 'LOCATION_RETENTION_EVENT');
      assert.equal(outbox.eventType, 'LOCATION_RETENTION_APPLIED');
      const serialized = JSON.stringify(outbox).toLowerCase();
      assert.equal(serialized.includes('latitude'), false);
      assert.equal(serialized.includes('longitude'), false);
      assert.equal(serialized.includes('coordinate'), false);
      assert.equal(serialized.includes('polyline'), false);
    }
  });

  it('returns an empty result without writes and rejects invalid batch input', async () => {
    const { worker, calls } = createHarness({ empty: true });

    assert.deepEqual(await worker.runBatch(10, 'location-retention-empty'), {
      rawDeletedRowCount: 0,
      coarseExpiredSummaryCount: 0,
      retentionEventCount: 0,
    });
    assert.equal(calls.retentionEvents.length, 0);
    assert.equal(calls.audits.length, 0);
    assert.equal(calls.outbox.length, 0);
    await assert.rejects(
      worker.runBatch(0, 'invalid limit'),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'VALIDATION_FORMAT_INVALID',
    );
  });
});
