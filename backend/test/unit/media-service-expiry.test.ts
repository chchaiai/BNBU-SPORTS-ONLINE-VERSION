import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { MediaService } from '../../src/modules/media/application/media.service.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';

describe('MediaService expired pending upload cleanup', () => {
  for (const objectState of ['absent', 'uploaded', 'unavailable'] as const) it(`expired upload cleanup preserves data when storage is ${objectState}`, async () => {
    const now = new Date('2026-08-11T01:00:00.000Z');
    const media = {
      id: '10000000-0000-4000-8000-000000000001',
      organizationId: '10000000-0000-4000-8000-000000000002',
      sessionId: '10000000-0000-4000-8000-000000000003',
      enrollmentId: null,
      businessPurpose: 'EXERCISE_RECORD',
      mediaType: 'VIDEO',
      uploadStatus: 'PENDING_UPLOAD',
      version: 1,
      storageKey: 'synthetic/private-object',
    };
    const writes: { operation: string; value: unknown }[] = [];
    const transaction = {
      mediaEvidence: {
        findMany: (args: unknown) => {
          writes.push({ operation: 'findMany', value: args });
          return Promise.resolve([media]);
        },
        update: (args: { data: { uploadStatus: string } }) => {
          writes.push({ operation: 'mediaUpdate', value: args });
          return Promise.resolve({
            ...media,
            uploadStatus: args.data.uploadStatus,
            version: 2,
          });
        },
      },
      mediaUploadSession: {
        update: (args: unknown) => {
          writes.push({ operation: 'sessionUpdate', value: args });
          return Promise.resolve({});
        },
      },
      mediaStatusEvent: {
        create: (args: unknown) => {
          writes.push({ operation: 'statusEvent', value: args });
          return Promise.resolve({});
        },
      },
    };
    const service = new MediaService(
      null as never,
      null as never,
      null as never,
      {
        append: (_transaction: unknown, event: unknown) => {
          writes.push({ operation: 'outbox', value: event });
          return Promise.resolve();
        },
      } as never,
      { now: () => now },
      { next: () => '10000000-0000-4000-8000-000000000004' },
      null as never,
      { headPrivateObject: async (key: string) => {
        assert.equal(key, media.storageKey);
        if (objectState === 'absent') throw new ApplicationError('MEDIA_OBJECT_NOT_FOUND', 404);
        if (objectState === 'unavailable') throw new Error('Synthetic storage unavailable');
        return { byteSize: 1024 };
      } } as never,
      null as never,
    );
    interface ExpiredUploadCleaner {
      expirePendingUploads(
        transactionClient: unknown,
        target: {
          kind: 'TARGET';
          studentId: string;
          sessionId: string | null;
          enrollmentId: string | null;
        },
        mediaType: string,
        actorUserId: string,
        requestId: string,
        observedAt: Date,
      ): Promise<void>;
    }

    const cleanup = (service as unknown as ExpiredUploadCleaner).expirePendingUploads(
      transaction,
      {
        kind: 'TARGET',
        studentId: '10000000-0000-4000-8000-000000000005',
        sessionId: media.sessionId,
        enrollmentId: null,
      },
      'VIDEO',
      '10000000-0000-4000-8000-000000000006',
      'request-expired-upload',
      now,
    );

    if (objectState === 'unavailable') await assert.rejects(cleanup, /Synthetic storage unavailable/);
    else await cleanup;
    if (objectState !== 'absent') {
      assert.deepEqual(writes.map(entry => entry.operation), ['findMany']);
      return;
    }

    assert.equal(writes.filter((entry) => entry.operation === 'mediaUpdate').length, 1);
    assert.equal(writes.filter((entry) => entry.operation === 'sessionUpdate').length, 1);
    assert.equal(writes.filter((entry) => entry.operation === 'statusEvent').length, 1);
    assert.equal(writes.filter((entry) => entry.operation === 'outbox').length, 1);
    assert.match(JSON.stringify(writes), /MEDIA_UPLOAD_SESSION_EXPIRED/);
    assert.match(JSON.stringify(writes), /MEDIA_UPLOAD_FAILED/);
  });
});
