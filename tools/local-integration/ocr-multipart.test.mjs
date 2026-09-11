import assert from 'node:assert/strict';
import test from 'node:test';
import { Readable } from 'node:stream';
import { createHash, randomUUID } from 'node:crypto';
import { receiveOcrPages } from '../../backend/src/modules/v8/ocr-multipart.ts';
import { syntheticPng } from './synthetic-png.mjs';
const scope = () => ({ organizationId: randomUUID(), batchId: randomUUID() });
const multipart = async entries => {
  const form = new FormData();
  for (const entry of entries) form.append(entry.name ?? 'pages', new Blob([entry.bytes], { type: entry.type ?? 'image/png' }), '../../untrusted.png');
  const request = new Request('http://localhost/', { method: 'POST', body: form });
  const stream = Readable.fromWeb(request.body);
  stream.headers = { 'content-type': request.headers.get('content-type') };
  return stream;
};
const storage = () => {
  const objects = new Map();
  return { objects, async putPrivateObject({ storageKey, body }) {
    const chunks = []; for await (const chunk of body) chunks.push(chunk);
    objects.set(storageKey, Buffer.concat(chunks)); return { entityTag: null };
  }, async deletePrivateObject(key) { objects.delete(key); } };
};
test('OCR multipart streams original page bytes with server-generated keys, checksum and batch total', async () => {
  const store = storage(), bytes = syntheticPng();
  const input = await multipart([{ bytes }, { bytes }]);
  const result = await receiveOcrPages(input, store, scope());
  assert.equal(result.pages.length, 2); assert.equal(result.totalBytes, bytes.length * 2);
  assert.equal(store.objects.size, 2);
  for (const page of result.pages) {
    assert.ok(store.objects.get(page.storageKey).equals(bytes));
    assert.equal(page.sha256, createHash('sha256').update(bytes).digest('hex'));
    assert.equal(page.storageKey.includes('untrusted'), false);
  }
});
test('bad image signature or unsupported part removes any uploaded objects and never returns a partial batch', async () => {
  for (const bad of [{ bytes: Buffer.from('not a png') }, { bytes: syntheticPng(), name: 'other' }]) {
    const store = storage();
    await assert.rejects(receiveOcrPages(await multipart([{ bytes: syntheticPng() }, bad]), store, scope()));
    assert.equal(store.objects.size, 0);
  }
});
