import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { Readable } from 'node:stream';
import { describe, it } from 'node:test';

import { validateEnvironment, type RuntimeConfig } from '../../src/common/config/environment.js';
import { ApplicationError } from '../../src/common/errors/application-error.js';
import type {
  ObjectStoragePort,
  PutPrivateObjectInput,
} from '../../src/common/object-storage/object-storage.port.js';
import { RosterCsvParserService } from '../../src/common/roster-ingestion/roster-csv-parser.service.js';
import { RosterMultipartUploadService } from '../../src/common/roster-ingestion/roster-multipart-upload.service.js';
import { foundationEnvironment } from '../helpers/test-environment.js';

class MemoryObjectStorage implements ObjectStoragePort {
  checkHealth(): Promise<void> {
    return Promise.resolve();
  }

  readonly objects = new Map<string, Buffer>();

  async putPrivateObject(input: PutPrivateObjectInput): Promise<{ entityTag: string | null }> {
    const chunks: Buffer[] = [];
    for await (const chunk of input.body) {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as Uint8Array));
    }
    this.objects.set(input.storageKey, Buffer.concat(chunks));
    return { entityTag: null };
  }

  getPrivateObject(storageKey: string): Promise<Readable> {
    const value = this.objects.get(storageKey);
    if (value === undefined) return Promise.reject(new Error('missing test object'));
    return Promise.resolve(Readable.from([value]));
  }

  deletePrivateObject(storageKey: string): Promise<void> {
    this.objects.delete(storageKey);
    return Promise.resolve();
  }
}

function runtimeConfig(): RuntimeConfig {
  return validateEnvironment(
    foundationEnvironment('postgresql://test:test@127.0.0.1:1/roster_ingestion_test', 0),
  ).RUNTIME_CONFIG as RuntimeConfig;
}

function multipartRequest(
  fields: Readonly<Record<string, string>>,
  file?: { name: string; type: string; body: Buffer },
): Readable & { headers: Record<string, string> } {
  const boundary = 'bnbu-roster-test-boundary';
  const chunks: Buffer[] = [];
  for (const [name, value] of Object.entries(fields)) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`,
      ),
    );
  }
  if (file !== undefined) {
    chunks.push(
      Buffer.from(
        `--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="${file.name}"\r\nContent-Type: ${file.type}\r\n\r\n`,
      ),
      file.body,
      Buffer.from('\r\n'),
    );
  }
  chunks.push(Buffer.from(`--${boundary}--\r\n`));
  const body = Buffer.concat(chunks);
  return Object.assign(Readable.from([body]), {
    headers: {
      'content-type': `multipart/form-data; boundary=${boundary}`,
      'content-length': String(body.length),
    },
  });
}

const FIELD_MAPPING = {
  studentNumber: 'studentNumber',
  fullName: 'fullName',
  gender: 'gender',
  gradeYear: 'gradeYear',
  collegeName: null,
  majorName: null,
  administrativeClassName: null,
} as const;

describe('Stage 13 private roster ingestion', () => {
  it('streams a strict CSV upload into a server-generated private key', async () => {
    const storage = new MemoryObjectStorage();
    const service = new RosterMultipartUploadService(runtimeConfig(), storage);
    const file = Buffer.from(
      ['studentNumber,fullName,gender,gradeYear', '0007A,Synthetic Student,FEMALE,2024'].join('\n'),
    );
    const checksum = createHash('sha256').update(file).digest('hex');
    const received = await service.receive(
      multipartRequest(
        {
          source: 'FILE',
          fileFormat: 'CSV',
          fileChecksumSha256: checksum,
          fieldMappingSnapshot: JSON.stringify(FIELD_MAPPING),
        },
        { name: 'synthetic-roster.csv', type: 'text/csv', body: file },
      ) as never,
      { organizationId: 'org-synthetic', classSectionId: 'section-synthetic' },
    );
    assert.equal(received.fileChecksumSha256, checksum);
    assert.match(received.sourceFileStorageKey, /^roster-sources\/[a-f0-9]{32}\/[a-f0-9-]+\.csv$/);
    assert.deepEqual(storage.objects.get(received.sourceFileStorageKey), file);
  });

  it('rejects path-like names and unsupported OFFICIAL_API without retaining an object', async () => {
    const storage = new MemoryObjectStorage();
    const service = new RosterMultipartUploadService(runtimeConfig(), storage);
    await assert.rejects(
      service.receive(
        multipartRequest(
          {
            source: 'FILE',
            fileFormat: 'CSV',
            fieldMappingSnapshot: JSON.stringify(FIELD_MAPPING),
          },
          { name: '../unsafe.csv', type: 'text/csv', body: Buffer.from('studentNumber,fullName') },
        ) as never,
        { organizationId: 'org-synthetic', classSectionId: 'section-synthetic' },
      ),
      (error: unknown) => error instanceof ApplicationError && error.code === 'ROSTER_FILE_INVALID',
    );
    await assert.rejects(
      service.receive(multipartRequest({ source: 'OFFICIAL_API', fileFormat: 'CSV' }) as never, {
        organizationId: 'org-synthetic',
        classSectionId: 'section-synthetic',
      }),
      (error: unknown) =>
        error instanceof ApplicationError && error.code === 'ROSTER_IMPORT_SOURCE_UNSUPPORTED',
    );
    assert.equal(storage.objects.size, 0);
  });

  it('normalizes leading-zero identifiers and marks every duplicate row non-valid', async () => {
    const storage = new MemoryObjectStorage();
    storage.objects.set(
      'roster-sources/a/test.csv',
      Buffer.from(
        [
          'studentNumber,fullName,gender,gradeYear',
          '0007a,Synthetic Student,FEMALE,2024',
          '0007A,=formula,FEMALE,2024',
        ].join('\n'),
      ),
    );
    const parsed = await new RosterCsvParserService(storage).parseStoredCsv({
      sourceFileStorageKey: 'roster-sources/a/test.csv',
      fieldMappingSnapshot: FIELD_MAPPING,
    });
    assert.equal(parsed.totalRowCount, 2);
    assert.equal(parsed.duplicatedRowCount, 1);
    assert.equal(parsed.invalidRowCount, 1);
    assert.deepEqual(
      parsed.rows.map((row) => row.rowValidationStatus),
      ['DUPLICATED', 'INVALID'],
    );
    assert.equal(parsed.rows[0]?.normalizedStudentNumber, '0007A');
    assert.ok(parsed.rows[1]?.rowErrorCodes.includes('FORMULA_LIKE_VALUE'));
    assert.equal(parsed.rows[1]?.fullName?.startsWith("'="), true);
  });

  it('uses static four-digit grade-year bounds for roster rows', async () => {
    const storage = new MemoryObjectStorage();
    storage.objects.set(
      'roster-sources/a/grade-years.csv',
      Buffer.from(
        [
          'studentNumber,fullName,gender,gradeYear',
          '0001A,Lower Boundary,MALE,1000',
          '0002A,Future Cohort,FEMALE,2028',
          '0003A,Upper Boundary,OTHER,9999',
          '0004A,Too Short,MALE,999',
          '0005A,Too Long,FEMALE,10000',
        ].join('\n'),
      ),
    );
    const parsed = await new RosterCsvParserService(storage).parseStoredCsv({
      sourceFileStorageKey: 'roster-sources/a/grade-years.csv',
      fieldMappingSnapshot: FIELD_MAPPING,
    });

    assert.deepEqual(
      parsed.rows.map((row) => row.gradeYear),
      [1000, 2028, 9999, null, null],
    );
    assert.deepEqual(
      parsed.rows.map((row) => row.rowValidationStatus),
      ['VALID', 'VALID', 'VALID', 'INVALID', 'INVALID'],
    );
  });
});
