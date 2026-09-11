import assert from 'node:assert/strict';
import { Readable } from 'node:stream';
import test from 'node:test';
import { validateEnvironment, type RuntimeConfig } from '../../src/common/config/environment.js';
import { RosterMultipartUploadService } from '../../src/common/roster-ingestion/roster-multipart-upload.service.js';
import { foundationEnvironment } from '../helpers/test-environment.js';

test('roster multipart has an inclusive 100 MiB limit independent of JSON configuration', async () => {
  const env = foundationEnvironment('postgresql://test:test@127.0.0.1:1/size_probe', 0);
  env.REQUEST_BODY_LIMIT_BYTES = '2097152';
  const config = validateEnvironment(env).RUNTIME_CONFIG as RuntimeConfig;
  const objects = new Map<string, number>();
  const removed: string[] = [];
  const service = new RosterMultipartUploadService(config, {
    async checkHealth() {},
    async putPrivateObject(input) {
      let bytes = 0;
      for await (const chunk of input.body) bytes += Buffer.byteLength(chunk);
      objects.set(input.storageKey, bytes);
      return { entityTag: null };
    },
    async getPrivateObject() { throw new Error('not used'); },
    async deletePrivateObject(key) { objects.delete(key); removed.push(key); },
  });
  for (const size of [12 * 1024 * 1024, 100 * 1024 * 1024, 100 * 1024 * 1024 + 1]) {
    const boundary = 'synthetic-size-boundary';
    const fields = { source: 'FILE', fileFormat: 'XLSX', sheetName: 'roster', fieldMappingSnapshot: JSON.stringify({studentNumber:'number',fullName:'name',gender:null,gradeYear:null,collegeName:null,majorName:null,administrativeClassName:null}) };
    async function* body() {
      for (const [name,value] of Object.entries(fields)) yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="${name}"\r\n\r\n${value}\r\n`);
      yield Buffer.from(`--${boundary}\r\nContent-Disposition: form-data; name="file"; filename="synthetic.xlsx"\r\nContent-Type: application/vnd.openxmlformats-officedocument.spreadsheetml.sheet\r\n\r\n`);
      yield Buffer.from([0x50,0x4b,3,4]);
      const chunk = Buffer.alloc(64 * 1024, 97);
      for (let remaining = size - 4; remaining > 0; remaining -= chunk.length) yield chunk.subarray(0, Math.min(chunk.length, remaining));
      yield Buffer.from(`\r\n--${boundary}--\r\n`);
    }
    const request = Object.assign(Readable.from(body()), { headers: { 'content-type': `multipart/form-data; boundary=${boundary}` } });
    const receive = service.receive(request as never, {organizationId:'synthetic-org',classSectionId:'synthetic-course'});
    if (size > 100 * 1024 * 1024) {
      await assert.rejects(receive, {code:'ROSTER_FILE_INVALID'});
      assert.equal(removed.length, 1);
    } else {
      const result = await receive;
      assert.equal(result.fileSizeBytes, size);
      assert.equal(objects.get(result.sourceFileStorageKey), size);
    }
  }
  assert.equal(objects.size, 2);
});
