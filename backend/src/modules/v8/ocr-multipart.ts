import { createHash, randomUUID } from 'node:crypto';
import type { IncomingMessage } from 'node:http';
import { PassThrough, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import busboy from 'busboy';
import type { ObjectStoragePort } from '../../common/object-storage/object-storage.port.js';

export type OcrSourcePage = { id: string; sha256: string; storageKey: string; mimeType: string; sizeBytes: number };
const MAX_BYTES = 104857600;
/** Caller must authorize the course before consuming bytes and commit the batch only after this succeeds. */
export async function receiveOcrPages(request: IncomingMessage, storage: ObjectStoragePort,
  scope: { organizationId: string; batchId: string }) {
  if (![scope.organizationId, scope.batchId].every(id => /^[a-f0-9-]{36}$/.test(id))) throw new Error('OCR_UPLOAD_SCOPE_INVALID');
  const pages: OcrSourcePage[] = [], keys: string[] = [], uploads: Promise<void>[] = [];
  let totalBytes = 0, bodyBytes = 0, failure: unknown;
  const fail = (error: unknown) => { failure ??= error; };
  const parser = busboy({ headers: request.headers, limits: { files: 1000, fields: 0, parts: 1001, fileSize: MAX_BYTES + 1 } });
  for (const event of ['filesLimit', 'fieldsLimit', 'partsLimit']) parser.on(event, () => fail(new Error('OCR_MULTIPART_LIMIT')));
  parser.on('file', (field, file, info) => {
    const extension = ({ 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' } as Record<string, string>)[info.mimeType];
    if (failure || field !== 'pages' || !extension || !['7bit', '8bit', 'binary'].includes(info.encoding)) {
      fail(new Error('OCR_IMAGE_PART_INVALID')); file.resume(); return;
    }
    const id = randomUUID(), storageKey = `v81/ocr/${scope.organizationId}/${scope.batchId}/${id}.${extension}`;
    keys.push(storageKey);
    const page: OcrSourcePage = { id, storageKey, mimeType: info.mimeType, sizeBytes: 0, sha256: '' };
    pages.push(page);
    let prefix = Buffer.alloc(0);
    const checksum = createHash('sha256');
    const checked = new Transform({
      transform(chunk: Buffer, _encoding, callback) {
        page.sizeBytes += chunk.length; totalBytes += chunk.length;
        if (totalBytes > MAX_BYTES) { callback(new Error('OCR_BATCH_BYTE_LIMIT')); return; }
        checksum.update(chunk);
        if (prefix.length < 16) prefix = Buffer.concat([prefix, chunk.subarray(0, 16 - prefix.length)]);
        callback(null, chunk);
      },
      flush(callback) {
        const valid = extension === 'png' ? prefix.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
          : extension === 'jpg' ? prefix.subarray(0, 3).equals(Buffer.from([255, 216, 255]))
          : prefix.toString('ascii', 0, 4) === 'RIFF' && prefix.toString('ascii', 8, 12) === 'WEBP';
        if (!valid || !page.sizeBytes || file.truncated) callback(new Error('OCR_IMAGE_SIGNATURE_INVALID'));
        else { page.sha256 = checksum.digest('hex'); callback(); }
      },
    });
    const body = new PassThrough();
    const upload = storage.putPrivateObject({ storageKey, body, contentType: info.mimeType }).catch(error => {
      body.destroy(error instanceof Error ? error : new Error('OCR_STORAGE_FAILED')); throw error;
    });
    uploads.push(Promise.all([pipeline(file, checked, body), upload]).then(() => {}).catch(fail));
  });
  const limited = new Transform({ transform(chunk: Buffer, _encoding, callback) {
    bodyBytes += chunk.length;
    callback(bodyBytes > MAX_BYTES + 1048576 ? new Error('OCR_MULTIPART_BODY_LIMIT') : null, chunk);
  } });
  try { await pipeline(request, limited, parser); } catch (error) { fail(error); }
  await Promise.all(uploads);
  if (!pages.length) fail(new Error('OCR_PAGES_REQUIRED'));
  if (failure) {
    const deleted = await Promise.allSettled(keys.map(storageKey => storage.deletePrivateObject(storageKey)));
    if (deleted.some(result => result.status === 'rejected')) throw new AggregateError([failure], 'OCR_UPLOAD_FAILED_CLEANUP_INCOMPLETE');
    throw failure;
  }
  return { pages, totalBytes };
}
